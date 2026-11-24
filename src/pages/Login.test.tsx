// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock('../store/auth', () => ({ useAuth: () => auth.s }));
vi.mock('../lib/mfa', () => ({ mfaErrorMessage: () => 'Error genérico de verificación' }));

import Login from './Login';
import { useToast } from '../store/toast';

const input = (sel: string) => document.querySelector(sel) as HTMLInputElement;

beforeEach(() => {
  useToast.setState({ toasts: [] });
  auth.s = {
    login: vi.fn(async () => 'ok'),
    resetPassword: vi.fn(async () => undefined),
    verifyMfa: vi.fn(async () => undefined),
    verifyPasskey: vi.fn(async () => undefined),
    cancelMfa: vi.fn(),
    mfaPending: false,
    mfaMethods: { totp: true, passkey: false },
  };
});

describe('Login', () => {
  it('valida inline correo y contraseña antes de llamar a login', async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Correo no válido')).toBeTruthy();
    expect(screen.getByText('Ingresa tu contraseña')).toBeTruthy();
    expect((auth.s.login as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('con datos válidos llama a login con el correo recortado', async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.type(input('input[type="email"]'), '  ana@correo.com ');
    await user.type(input('input[type="password"]'), 'Secreta#12345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(auth.s.login).toHaveBeenCalledWith('ana@correo.com', 'Secreta#12345');
  });

  it('un error de login se muestra como aviso (toast), no como código crudo', async () => {
    (auth.s.login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Credenciales incorrectas. Intentos restantes: 4.'));
    const user = userEvent.setup();
    render(<Login />);
    await user.type(input('input[type="email"]'), 'ana@correo.com');
    await user.type(input('input[type="password"]'), 'x');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(useToast.getState().toasts[0]).toMatchObject({ kind: 'error', message: 'Credenciales incorrectas. Intentos restantes: 4.' });
  });

  it('paso MFA: exige 6 dígitos, envía el código y muestra el error del servidor', async () => {
    auth.s.mfaPending = true;
    (auth.s.verifyMfa as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Credenciales incorrectas. Intentos restantes: 3.'));
    const user = userEvent.setup();
    render(<Login />);
    expect(screen.getByText('Verificación en dos pasos')).toBeTruthy();
    const code = input('input[autocomplete="one-time-code"]');

    await user.type(code, '12');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('Son 6 dígitos')).toBeTruthy();
    expect((auth.s.verifyMfa as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    await user.clear(code);
    await user.type(code, '12a3456'); // las letras se descartan
    expect(code.value).toBe('123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(auth.s.verifyMfa).toHaveBeenCalledWith('123456');
    expect(await screen.findByText('Credenciales incorrectas. Intentos restantes: 3.')).toBeTruthy();
  });

  it('paso MFA: "Volver" cancela la verificación', async () => {
    auth.s.mfaPending = true;
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(auth.s.cancelMfa).toHaveBeenCalled();
  });

  it('paso MFA con passkey: ofrece passkey y TOTP; solo passkey oculta el código', async () => {
    auth.s.mfaPending = true;
    auth.s.mfaMethods = { totp: true, passkey: true };
    const user = userEvent.setup();
    const { unmount } = render(<Login />);
    await user.click(screen.getByRole('button', { name: /Usar passkey/ }));
    expect(auth.s.verifyPasskey).toHaveBeenCalled();
    expect(input('input[autocomplete="one-time-code"]')).toBeTruthy();
    unmount();

    auth.s.mfaMethods = { totp: false, passkey: true };
    render(<Login />);
    expect(input('input[autocomplete="one-time-code"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Usar passkey/ })).toBeTruthy();
  });

  it('un error del passkey se muestra inline', async () => {
    auth.s.mfaPending = true;
    auth.s.mfaMethods = { totp: false, passkey: true };
    (auth.s.verifyPasskey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Operación cancelada o sin respuesta del dispositivo.'));
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: /Usar passkey/ }));
    expect(await screen.findByText('Operación cancelada o sin respuesta del dispositivo.')).toBeTruthy();
  });

  it('abre y cierra el modal "contactar al administrador"', async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: /contactar al administrador/ }));
    const dialog = screen.getByRole('dialog', { name: 'Contactar al administrador' });
    expect(within(dialog).getByText(/Aún no hay un correo de administrador/)).toBeTruthy();
    await user.click(within(dialog).getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('recuperar contraseña pide primero un correo válido', async () => {
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole('button', { name: 'Olvidé mi contraseña' }));
    expect(screen.getByText('Escribe tu correo para recuperar la contraseña')).toBeTruthy();
    expect((auth.s.resetPassword as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
