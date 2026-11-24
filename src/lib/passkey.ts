import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { callFn, fnErrorMessage, serverLockEnabled } from './functions';

type RegOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];
type RegResponse = Awaited<ReturnType<typeof startRegistration>>;
type AuthResponse = Awaited<ReturnType<typeof startAuthentication>>;

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: number;
  rpID: string;
}

/**
 * ¿Se pueden usar passkeys en esta plataforma?
 * - Sin servidor (VITE_USE_SERVER_LOCK != 'true', plan Spark): no. Los passkeys se registran y verifican con Cloud Functions
 *   (plan Blaze); así la interfaz nunca intenta llamarlas.
 * - Web (https / localhost): sí, si el navegador soporta WebAuthn.
 * - Electron (file://): no; el origen file:// no admite WebAuthn.
 * - Capacitor (WebView): desactivado por defecto; WebAuthn depende del WebView del sistema. Actívalo con VITE_PASSKEY_NATIVE=true.
 */
export function passkeyAvailability(): { available: boolean; reason?: string } {
  if (typeof window === 'undefined') return { available: false, reason: 'Passkeys no disponibles en este entorno.' };
  if (!serverLockEnabled) {
    return { available: false, reason: 'Los passkeys no están disponibles en este despliegue (requieren Cloud Functions, plan Blaze). Usa la app autenticadora (TOTP).' };
  }
  if (window.location.protocol === 'file:') {
    return {
      available: false,
      reason: 'En la app de escritorio los passkeys no están disponibles. Usa la versión web o la app autenticadora (TOTP).',
    };
  }
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.() && import.meta.env.VITE_PASSKEY_NATIVE !== 'true') {
    return {
      available: false,
      reason: 'En la app móvil los passkeys aún no están habilitados. Usa la versión web o la app autenticadora (TOTP).',
    };
  }
  if (!window.isSecureContext || !browserSupportsWebAuthn()) {
    return { available: false, reason: 'Este navegador o dispositivo no admite passkeys (WebAuthn).' };
  }
  return { available: true };
}

/** Traduce errores del navegador (WebAuthn) y del servidor a mensajes claros. */
export function passkeyErrorMessage(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string };
  if (e.name === 'NotAllowedError' || e.name === 'AbortError') return 'Operación cancelada o sin respuesta del dispositivo.';
  if (e.name === 'InvalidStateError') return 'Este dispositivo ya tiene un passkey registrado para Lister.';
  if (e.name === 'NotSupportedError' || e.name === 'SecurityError') return 'Este dispositivo o sitio no admite passkeys.';
  return fnErrorMessage(err, 'No se pudo completar la operación con el passkey.');
}

const origin = () => window.location.origin;

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  return callFn<undefined, PasskeyInfo[]>('passkeyList');
}

export async function removePasskey(id: string): Promise<void> {
  await callFn('passkeyRemove', { id });
}

/** Enrolamiento: el servidor verifica la contraseña, emite el desafío y valida la atestación. */
export async function registerPasskey(password: string, name: string): Promise<void> {
  const optionsJSON = await callFn<{ password: string; origin: string }, RegOptions>('passkeyRegisterOptions', {
    password,
    origin: origin(),
  });
  const response: RegResponse = await startRegistration({ optionsJSON });
  await callFn('passkeyRegisterVerify', { response, name });
}

/** Login: contraseña + aserción verificadas en servidor; devuelve un custom token solo si ambas son válidas. */
export async function passkeyLogin(email: string, password: string): Promise<string> {
  const optionsJSON = await callFn<{ email: string; password: string; origin: string }, AuthOptions>('passkeyLoginOptions', {
    email,
    password,
    origin: origin(),
  });
  const response: AuthResponse = await startAuthentication({ optionsJSON });
  const { token } = await callFn<{ email: string; response: AuthResponse }, { token: string }>('passkeyLoginVerify', {
    email,
    response,
  });
  return token;
}
