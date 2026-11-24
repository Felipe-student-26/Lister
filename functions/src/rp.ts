/**
 * rpID y origen de WebAuthn según la plataforma desde la que se llama.
 * - Web: origen https del hosting (rpID = hostname).
 * - Desarrollo: http://localhost:5173 (rpID = localhost).
 * - Capacitor (WebView): https://localhost en Android / capacitor://localhost en iOS: WebAuthn depende del WebView.
 * - Electron (file://): el origen es "null"; WebAuthn no es utilizable, se rechaza con un mensaje claro.
 * Solo se aceptan orígenes de la lista blanca PASSKEY_ORIGINS; las credenciales guardan el rpID con que se crearon.
 */
export class RpError extends Error {}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function resolveRp(origin: unknown, allowed: string[]): { origin: string; rpID: string } {
  if (typeof origin !== 'string' || !origin || origin === 'null' || origin.startsWith('file:')) {
    throw new RpError('Los passkeys no están disponibles en este entorno (origen file://). Usa la versión web o la app autenticadora (TOTP).');
  }
  const clean = origin.replace(/\/$/, '');
  if (!allowed.includes(clean)) {
    throw new RpError('Este origen no está autorizado para passkeys. El administrador debe añadirlo a PASSKEY_ORIGINS.');
  }
  let rpID: string;
  try {
    rpID = new URL(clean).hostname;
  } catch {
    throw new RpError('Origen no válido.');
  }
  if (!rpID) throw new RpError('Origen no válido.');
  return { origin: clean, rpID };
}
