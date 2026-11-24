import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const m = vi.hoisted(() => {
  const secondary = { name: 'secondary' };
  const secondaryAuth = { name: 'secondary-auth' };
  const mainAuth = { name: 'main-auth' };
  const newUser = { uid: 'nuevo-uid' };
  return {
    secondary,
    secondaryAuth,
    mainAuth,
    newUser,
    initializeApp: vi.fn(),
    deleteApp: vi.fn(),
    getAuth: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    signOut: vi.fn(),
    sendReset: vi.fn(),
    batchSet: vi.fn(),
    batchDelete: vi.fn(),
    batchCommit: vi.fn(),
    writeBatch: vi.fn(),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: m.initializeApp, deleteApp: m.deleteApp }));
vi.mock('firebase/auth', () => ({
  getAuth: m.getAuth,
  createUserWithEmailAndPassword: m.createUser,
  deleteUser: m.deleteUser,
  signOut: m.signOut,
  sendPasswordResetEmail: m.sendReset,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => `${col}/${id}`,
  writeBatch: m.writeBatch,
  onSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('./firebase', () => ({ app: { options: { apiKey: 'k', projectId: 'p' } }, auth: m.mainAuth, db: { name: 'db' } }));

import {
  createTherapistAccount,
  randomTempPassword,
  removeTherapistAccount,
  sendTherapistPasswordLink,
  therapistErrorMessage,
  TherapistAdminError,
} from './therapistAdmin';
import { useProfile } from '../store/profile';
import { emptyTherapistProfile, passwordIssues } from './validation';

const profile = () => ({ ...emptyTherapistProfile(), fullName: '  Ana Pérez ', email: 'ANA@Correo.com ', phone: ' 3001112233', specialty: 'Clínica' });
const asRole = (role: 'admin' | 'therapist' | null) => useProfile.setState({ ready: true, role, ownerId: null });

beforeEach(() => {
  vi.clearAllMocks();
  asRole('admin');
  m.initializeApp.mockReturnValue(m.secondary);
  m.deleteApp.mockResolvedValue(undefined);
  m.getAuth.mockReturnValue(m.secondaryAuth);
  m.createUser.mockResolvedValue({ user: m.newUser });
  m.deleteUser.mockResolvedValue(undefined);
  m.signOut.mockResolvedValue(undefined);
  m.sendReset.mockResolvedValue(undefined);
  m.batchCommit.mockResolvedValue(undefined);
  m.writeBatch.mockReturnValue({ set: m.batchSet, delete: m.batchDelete, commit: m.batchCommit });
});

describe('createTherapistAccount', () => {
  it('crea la cuenta en una instancia secundaria, escribe users y therapistProfiles en UN lote y envía el correo', async () => {
    const res = await createTherapistAccount({ email: ' ANA@Correo.com ', profile: profile() });

    expect(m.initializeApp).toHaveBeenCalledWith({ apiKey: 'k', projectId: 'p' }, 'secondary');
    expect(m.getAuth).toHaveBeenCalledWith(m.secondary);
    const [authArg, emailArg, passArg] = m.createUser.mock.calls[0];
    expect(authArg).toBe(m.secondaryAuth); // no la instancia principal: así no se cierra la sesión del admin
    expect(emailArg).toBe('ana@correo.com');
    expect(passArg.length).toBeGreaterThanOrEqual(40);
    expect(passwordIssues(passArg)).toEqual([]);

    expect(m.writeBatch).toHaveBeenCalledTimes(1);
    expect(m.batchCommit).toHaveBeenCalledTimes(1);
    expect(m.batchSet).toHaveBeenCalledTimes(2);
    const [usersPath, usersData] = m.batchSet.mock.calls[0];
    expect(usersPath).toBe('users/nuevo-uid');
    expect(usersData).toEqual({ role: 'therapist', ownerId: 'nuevo-uid', email: 'ana@correo.com', createdAt: expect.any(Number) });
    const [profPath, profData] = m.batchSet.mock.calls[1];
    expect(profPath).toBe('therapistProfiles/nuevo-uid');
    expect(profData).toMatchObject({ fullName: 'Ana Pérez', email: 'ana@correo.com', phone: '3001112233', specialty: 'Clínica', bio: '' });
    expect(Object.keys(profData).sort()).toEqual(
      ['bio', 'birthDate', 'city', 'createdAt', 'email', 'fullName', 'idNumber', 'licenseNumber', 'officeAddress', 'phone', 'specialty', 'updatedAt', 'yearsExperience'].sort(),
    );

    expect(m.sendReset).toHaveBeenCalledWith(m.mainAuth, 'ana@correo.com'); // con la instancia principal
    expect(m.batchCommit.mock.invocationCallOrder[0]).toBeLessThan(m.sendReset.mock.invocationCallOrder[0]);
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(res).toEqual({ uid: 'nuevo-uid', email: 'ana@correo.com', emailSent: true });
  });

  it('si falla Firestore revierte con deleteUser (instancia secundaria), relanza el error y no envía correo', async () => {
    m.batchCommit.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }));
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toThrow(/No tienes permiso/);
    expect(m.deleteUser).toHaveBeenCalledWith(m.newUser);
    expect(m.sendReset).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledWith(m.secondaryAuth);
    expect(m.deleteApp).toHaveBeenCalledWith(m.secondary);
  });

  it('aunque deleteUser falle, el error original de Firestore es el que se relanza', async () => {
    m.batchCommit.mockRejectedValue(new Error('boom'));
    m.deleteUser.mockRejectedValue(new Error('no se pudo borrar'));
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toThrow('No se pudo guardar a la terapeuta.');
    expect(m.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('cierra sesión de la instancia secundaria y la elimina SIEMPRE (éxito, fallo de Auth, de Firestore o del correo)', async () => {
    const run = () => createTherapistAccount({ email: 'ana@correo.com', profile: profile() }).catch(() => undefined);

    await run(); // éxito
    m.createUser.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await run(); // falla Auth
    m.batchCommit.mockRejectedValueOnce(new Error('x'));
    await run(); // falla Firestore
    m.sendReset.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await run(); // falla el correo

    expect(m.deleteApp).toHaveBeenCalledTimes(4);
    expect(m.signOut).toHaveBeenCalledTimes(4);
    for (const c of m.signOut.mock.calls) expect(c[0]).toBe(m.secondaryAuth);
    for (const c of m.deleteApp.mock.calls) expect(c[0]).toBe(m.secondary);
  });

  it('auth/email-already-in-use da el mensaje en español y no escribe nada', async () => {
    m.createUser.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toMatchObject({
      message: 'Ese correo ya existe en Firebase Authentication. Si era de una terapeuta eliminada, bórralo a mano en la consola (Authentication).',
    });
    expect(m.writeBatch).not.toHaveBeenCalled();
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(m.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('traduce otros errores de Auth (correo inválido, sin red) y usa un texto genérico para los desconocidos', async () => {
    m.createUser.mockRejectedValueOnce({ code: 'auth/invalid-email' });
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toThrow('Correo no válido.');
    m.createUser.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toThrow(/Sin conexión/);
    m.createUser.mockRejectedValueOnce({ code: 'auth/algo-raro' });
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toThrow('No se pudo crear la cuenta de acceso.');
  });

  it('si el correo no sale, la terapeuta queda creada y se avisa con emailSent: false', async () => {
    m.sendReset.mockRejectedValue({ code: 'auth/network-request-failed' });
    const res = await createTherapistAccount({ email: 'ana@correo.com', profile: profile() });
    expect(res).toEqual({ uid: 'nuevo-uid', email: 'ana@correo.com', emailSent: false });
    expect(m.deleteUser).not.toHaveBeenCalled();
  });

  it('valida el perfil antes de tocar Firebase', async () => {
    await expect(createTherapistAccount({ email: 'no-es-correo', profile: { ...profile(), email: 'no-es-correo' } })).rejects.toThrow('Correo no válido');
    await expect(createTherapistAccount({ email: 'a@b.co', profile: { ...profile(), fullName: 'A' } })).rejects.toThrow('Escribe el nombre completo');
    expect(m.initializeApp).not.toHaveBeenCalled();
    expect(m.createUser).not.toHaveBeenCalled();
  });

  it('recorta los campos al largo que aceptan las reglas', async () => {
    await createTherapistAccount({ email: 'ana@correo.com', profile: { ...profile(), bio: 'x'.repeat(700), city: 'y'.repeat(200) } });
    const data = m.batchSet.mock.calls[1][1];
    expect(data.bio).toHaveLength(600);
    expect(data.city).toHaveLength(80);
  });
});

describe('removeTherapistAccount', () => {
  it('borra users y therapistProfiles en un solo lote y NO toca Authentication', async () => {
    await removeTherapistAccount('ana');
    expect(m.writeBatch).toHaveBeenCalledTimes(1);
    expect(m.batchDelete.mock.calls.map((c) => c[0])).toEqual(['users/ana', 'therapistProfiles/ana']);
    expect(m.batchCommit).toHaveBeenCalledTimes(1);
    expect(m.deleteUser).not.toHaveBeenCalled();
    expect(m.initializeApp).not.toHaveBeenCalled();
    expect(m.batchSet).not.toHaveBeenCalled(); // tampoco se escribe ni se borra ningún dato clínico
  });

  it('traduce el rechazo de las reglas y exige un uid', async () => {
    m.batchCommit.mockRejectedValue({ code: 'permission-denied' });
    await expect(removeTherapistAccount('ana')).rejects.toThrow(/No tienes permiso/);
    await expect(removeTherapistAccount('')).rejects.toThrow('Falta la terapeuta.');
  });
});

describe('sendTherapistPasswordLink', () => {
  it('envía el correo con la instancia principal', async () => {
    await sendTherapistPasswordLink(' luz@correo.com ');
    expect(m.sendReset).toHaveBeenCalledWith(m.mainAuth, 'luz@correo.com');
  });

  it('traduce los errores de Auth', async () => {
    m.sendReset.mockRejectedValue({ code: 'auth/network-request-failed' });
    await expect(sendTherapistPasswordLink('luz@correo.com')).rejects.toThrow(/Sin conexión/);
  });
});

describe('solo el administrador opera', () => {
  it.each([['terapeuta', 'therapist' as const], ['sin rol', null]])('%s: ninguna operación llega a Firebase', async (_n, role) => {
    asRole(role);
    await expect(createTherapistAccount({ email: 'ana@correo.com', profile: profile() })).rejects.toMatchObject({ code: 'not-admin' });
    await expect(removeTherapistAccount('ana')).rejects.toBeInstanceOf(TherapistAdminError);
    await expect(sendTherapistPasswordLink('ana@correo.com')).rejects.toThrow('Solo un administrador');
    expect(m.initializeApp).not.toHaveBeenCalled();
    expect(m.createUser).not.toHaveBeenCalled();
    expect(m.writeBatch).not.toHaveBeenCalled();
    expect(m.sendReset).not.toHaveBeenCalled();
  });
});

describe('utilidades', () => {
  it('la contraseña temporal es larga, aleatoria y cumple la política', () => {
    const a = randomTempPassword();
    const b = randomTempPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(passwordIssues(a)).toEqual([]);
  });

  it('therapistErrorMessage usa el texto de TherapistAdminError y, si no, el de reserva', () => {
    expect(therapistErrorMessage(new TherapistAdminError('hola'), 'x')).toBe('hola');
    expect(therapistErrorMessage(new Error('interno'), 'No se pudo')).toBe('No se pudo');
  });
});

describe('ya no se usan las Cloud Functions de equipo', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });

  it('ningún archivo de src/ llama a createTherapist, removeTherapist ni therapistResetLink como función', () => {
    for (const f of files('src')) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/['"`](createTherapist|removeTherapist|therapistResetLink)['"`]/);
      expect(text, f).not.toMatch(/\b(createTherapist|removeTherapist|therapistResetLink)\b\s*[(,}]/);
    }
  });

  it('team.ts y Therapists.tsx no importan lib/functions', () => {
    for (const f of ['src/lib/team.ts', 'src/pages/Therapists.tsx', 'src/lib/therapistAdmin.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"](\.\/|\.\.\/lib\/)functions['"]/);
    }
  });
});
