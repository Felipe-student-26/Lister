// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {}, auth: { currentUser: { email: 'ana@correo.com', uid: 'u1' } } }));

const m = vi.hoisted(() => ({
  auth: { changePassword: vi.fn(async () => undefined), reauth: vi.fn(async () => undefined) },
  mfa: {
    listFactors: vi.fn(() => [] as unknown[]),
    startTotpEnrollment: vi.fn(async () => ({ secret: { s: 1 }, uri: 'otpauth://totp/x', key: 'ABCD EFGH' })),
    finishTotpEnrollment: vi.fn(async () => undefined),
    removeFactor: vi.fn(async () => undefined),
    mfaErrorMessage: vi.fn(() => 'Error de verificación'),
  },
}));
vi.mock('../store/auth', () => ({ useAuth: () => m.auth }));
vi.mock('../lib/mfa', () => m.mfa);
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AAAA' } }));
vi.mock('../lib/passkey', () => ({
  passkeyAvailability: () => ({ available: false, reason: 'Passkeys no disponibles en este dispositivo.' }),
  passkeyErrorMessage: () => 'Error de passkey',
  listPasskeys: async () => [],
  registerPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));
vi.mock('../lib/functions', () => ({ fnErrorMessage: (_e: unknown, f: string) => f }));

import SettingsModal from './SettingsModal';
import { useProfile, type Role } from '../store/profile';
import { useToast } from '../store/toast';

const pw = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
const open = (role: Role = 'admin') => {
  useProfile.setState({ role, ownerId: 'u1', ready: true });
  return render(<SettingsModal open onClose={() => undefined} />);
};
const rule = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
  m.mfa.listFactors.mockReturnValue([]);
});

describe('SettingsModal: contraseña', () => {
  it('el checklist aparece al escribir y marca cada regla cumplida', async () => {
    const user = userEvent.setup();
    open();
    expect(screen.queryByText('Mínimo 10 caracteres')).toBeNull();

    await user.type(pw()[1], 'abc');
    expect(rule('Una minúscula').className).toContain('text-brand-600');
    expect(rule('Una mayúscula').className).toContain('text-clay-600');
    expect(rule('Mínimo 10 caracteres').className).toContain('text-clay-600');

    await user.clear(pw()[1]);
    await user.type(pw()[1], 'Abcdefghi1!');
    for (const r of ['Mínimo 10 caracteres', 'Una minúscula', 'Una mayúscula', 'Un número', 'Un símbolo']) {
      expect(rule(r).className).toContain('text-brand-600');
    }
  });

  it('no envía si las contraseñas no coinciden o la política no se cumple', async () => {
    const user = userEvent.setup();
    open();
    await user.type(pw()[0], 'Actual#12345');
    await user.type(pw()[1], 'Nueva#123456');
    await user.type(pw()[2], 'Otra#1234567');
    await user.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
    expect(screen.getByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(m.auth.changePassword).not.toHaveBeenCalled();
  });

  it('con datos válidos cambia la contraseña y avisa', async () => {
    const user = userEvent.setup();
    open();
    await user.type(pw()[0], 'Actual#12345');
    await user.type(pw()[1], 'Nueva#123456');
    await user.type(pw()[2], 'Nueva#123456');
    await user.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
    expect(m.auth.changePassword).toHaveBeenCalledWith('Actual#12345', 'Nueva#123456');
    await waitFor(() => expect(useToast.getState().toasts.some((t) => t.message === 'Contraseña actualizada')).toBe(true));
  });
});

describe('SettingsModal: wizard TOTP (lib/mfa simulada)', () => {
  it('recorre contraseña → QR → código y activa el factor', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getAllByRole('button', { name: 'Activar' })[0]);

    // paso 1: contraseña
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Ingresa tu contraseña')).toBeTruthy();
    await user.type(pw()[0], 'Actual#12345');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(m.auth.reauth).toHaveBeenCalledWith('Actual#12345');
    expect(m.mfa.startTotpEnrollment).toHaveBeenCalled();

    // paso 2: QR + clave manual
    expect(await screen.findByAltText('Código QR para la app autenticadora')).toBeTruthy();
    expect(screen.getByText('ABCD EFGH')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ya lo escaneé' }));

    // paso 3: código
    const code = document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement;
    await user.type(code, '12');
    await user.click(screen.getByRole('button', { name: 'Activar' }));
    expect(screen.getByText('Son 6 dígitos')).toBeTruthy();
    expect(m.mfa.finishTotpEnrollment).not.toHaveBeenCalled();

    await user.clear(code);
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Activar' }));
    expect(m.mfa.finishTotpEnrollment).toHaveBeenCalledWith(expect.anything(), { s: 1 }, '123456');
    await waitFor(() => expect(useToast.getState().toasts.some((t) => t.message === 'Verificación en dos pasos activada')).toBe(true));
  });

  it('un error al verificar la contraseña se muestra inline y no avanza', async () => {
    m.auth.reauth.mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    open();
    await user.click(screen.getAllByRole('button', { name: 'Activar' })[0]);
    await user.type(pw()[0], 'mala');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Error de verificación')).toBeTruthy();
    expect(m.mfa.startTotpEnrollment).not.toHaveBeenCalled();
  });

  it('con TOTP activo ofrece quitarlo con confirmación', async () => {
    m.mfa.listFactors.mockReturnValue([{ uid: 'f1' }]);
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    const dialog = screen.getByRole('dialog', { name: 'Quitar verificación en dos pasos' });
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    expect(m.mfa.removeFactor).toHaveBeenCalled();
  });
});

describe('SettingsModal: passkey y equipo', () => {
  it('sin WebAuthn el botón queda deshabilitado con el motivo claro', () => {
    open();
    expect(screen.getByText('Passkeys no disponibles en este dispositivo.')).toBeTruthy();
    expect((screen.getAllByRole('button', { name: 'Activar' })[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('ya no hay sección "Equipo" en Configuración: las terapeutas se gestionan en /terapeutas', () => {
    for (const role of ['admin', 'therapist'] as const) {
      const { unmount } = open(role);
      expect(screen.queryByText('Equipo')).toBeNull();
      unmount();
    }
  });
});
