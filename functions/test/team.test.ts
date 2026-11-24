import { describe, expect, it } from 'vitest';
import { assertAdmin, assertTherapist, randomPassword, TeamError, validateTherapistInput } from '../src/teamLogic';
import { hasAdmin, planMigration } from '../src/migrateLogic';

describe('gestión de terapeutas: verificación del rol de quien llama', () => {
  it('solo un perfil con role "admin" puede gestionar terapeutas', () => {
    expect(() => assertAdmin({ role: 'admin', ownerId: 'adm1' })).not.toThrow();
  });
  it('una terapeuta, un rol desconocido o el rol antiguo "editor" no pueden', () => {
    for (const role of ['therapist', 'editor', 'root', undefined]) {
      expect(() => assertAdmin({ role, ownerId: 'x' })).toThrow(TeamError);
    }
    expect(() => assertAdmin({ role: 'therapist', ownerId: 't1' })).toThrow(/administrador/);
  });
  it('sin documento users/{uid} = sin acceso (ya no es admin de sus propios datos)', () => {
    expect(() => assertAdmin(undefined)).toThrow(/administrador/);
  });
  it('valida y normaliza el correo y el nombre (acepta displayName como alias de fullName)', () => {
    const a = validateTherapistInput({ email: '  Luz@Correo.com ', fullName: '  Luz Gómez  ' });
    expect(a).toMatchObject({ email: 'luz@correo.com', fullName: 'Luz Gómez', phone: '', bio: '' });
    expect(validateTherapistInput({ email: 'l@c.co', displayName: 'Luz Gómez' }).fullName).toBe('Luz Gómez');
    expect(() => validateTherapistInput({ email: 'nope', fullName: 'Luz Gómez' })).toThrow(/Correo/);
    expect(() => validateTherapistInput({ email: 'l@c.co', fullName: ' ' })).toThrow(/nombre/);
    expect(() => validateTherapistInput(undefined)).toThrow(TeamError);
  });
  it('el perfil guarda los datos opcionales recortados y valida fecha y años de experiencia', () => {
    const p = validateTherapistInput({
      email: 'l@c.co', fullName: 'Luz Gómez', phone: ' 300 ', idNumber: '123', birthDate: '1990-05-01', specialty: 'Psicología',
      licenseNumber: 'TP-1', officeAddress: 'Cra 1', city: 'Manizales', yearsExperience: '8', bio: ' Hola ', extra: 'ignorado',
    });
    expect(p).toMatchObject({ phone: '300', birthDate: '1990-05-01', yearsExperience: '8', bio: 'Hola' });
    expect('extra' in p).toBe(false);
    expect(validateTherapistInput({ email: 'l@c.co', fullName: 'Luz Gómez', bio: 'x'.repeat(900) }).bio).toHaveLength(600);
    expect(() => validateTherapistInput({ email: 'l@c.co', fullName: 'Luz Gómez', birthDate: '01/05/1990' })).toThrow(/Fecha/);
    expect(() => validateTherapistInput({ email: 'l@c.co', fullName: 'Luz Gómez', yearsExperience: 'ocho' })).toThrow(/Años/);
  });
  it('solo se eliminan terapeutas: un admin no puede borrar a otro admin ni a sí mismo', () => {
    expect(() => assertTherapist({ role: 'therapist', ownerId: 't1' })).not.toThrow();
    expect(() => assertTherapist({ role: 'admin', ownerId: 'adm1' })).toThrow(TeamError);
    expect(() => assertTherapist({ role: 'editor', ownerId: 'adm1' })).toThrow(TeamError);
    expect(() => assertTherapist(undefined)).toThrow(TeamError);
  });
  it('la contraseña inicial es larga y distinta cada vez', () => {
    const a = randomPassword();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(randomPassword());
  });
});

describe('migración de roles (plan)', () => {
  const docs = new Map<string, Record<string, unknown>>([
    ['adm', { role: 'admin', ownerId: 'adm', email: 'adm@x.co' }],
    ['ed1', { role: 'editor', ownerId: 'old-owner', email: 'ed1@x.co' }],
    ['ya', { role: 'therapist', ownerId: 'ya', email: 'ya@x.co' }],
    ['rara', { role: 'therapist', ownerId: 'otra' }],
    ['??', { role: 'jefe' }],
  ]);
  const users = [
    { uid: 'adm', email: 'adm@x.co' },
    { uid: 'viejo', email: 'viejo@x.co' }, // sin documento
    { uid: 'ed1', email: 'ed1@x.co' },
    { uid: 'ya', email: 'ya@x.co' },
    { uid: 'rara', email: 'rara@x.co' },
    { uid: '??', email: 'q@x.co' },
  ];
  const plan = planMigration(users, docs);
  const by = (uid: string) => plan.find((p) => p.uid === uid)!;

  it('quien no tiene documento pasa a terapeuta con su propio ownerId', () => {
    expect(by('viejo')).toMatchObject({ action: 'create', doc: { role: 'therapist', ownerId: 'viejo', email: 'viejo@x.co' } });
  });
  it('un editor pasa a terapeuta con su propio ownerId (y se avisa de que pierde los datos anteriores)', () => {
    expect(by('ed1')).toMatchObject({ action: 'convert', doc: { role: 'therapist', ownerId: 'ed1' } });
    expect((by('ed1') as { note: string }).note).toContain('old-owner');
  });
  it('admin y terapeutas ya migradas no cambian; los casos raros se dejan para revisar a mano', () => {
    expect(by('adm').action).toBe('skip');
    expect(by('ya').action).toBe('skip');
    expect(by('rara')).toMatchObject({ action: 'skip' });
    expect((by('rara') as { note: string }).note).toContain('revisar a mano');
    expect((by('??') as { note: string }).note).toContain('jefe');
  });
  it('es idempotente: volver a planificar sobre el resultado no cambia nada', () => {
    const after = new Map(docs);
    for (const p of plan) if (p.action !== 'skip') after.set(p.uid, p.doc);
    expect(planMigration(users, after).filter((p) => p.action !== 'skip')).toEqual([]);
  });
  it('se niega a aplicar si no existe ningún admin', () => {
    expect(hasAdmin(docs)).toBe(true);
    expect(hasAdmin(new Map([['ed1', { role: 'editor' }]]))).toBe(false);
  });
});
