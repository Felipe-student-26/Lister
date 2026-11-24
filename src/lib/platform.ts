/**
 * Política de sesión por plataforma:
 * - Celular (app Capacitor o navegador móvil): la sesión se conserva; se inicia sesión una sola vez.
 * - PC (Electron o navegador de escritorio): la sesión vive solo mientras la app/pestaña está abierta; al volver a abrirla se pide iniciar sesión.
 */
export interface EnvLike {
  Capacitor?: { isNativePlatform?: () => boolean };
  navigator?: { userAgent?: string };
}

const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

export function isNativeApp(env: EnvLike | undefined): boolean {
  return Boolean(env?.Capacitor?.isNativePlatform?.());
}

/** true = mantener la sesión iniciada entre aperturas de la app. `override` = VITE_KEEP_SESSION ('true' | 'false'). */
export function shouldKeepSession(env: EnvLike | undefined, override?: string): boolean {
  if (override === 'true') return true;
  if (override === 'false') return false;
  if (isNativeApp(env)) return true;
  return MOBILE_UA.test(env?.navigator?.userAgent ?? '');
}

const w = typeof window === 'undefined' ? undefined : (window as unknown as EnvLike);

export const keepSession = shouldKeepSession(w, import.meta.env.VITE_KEEP_SESSION as string | undefined);

/** PC (Electron o navegador de escritorio): aquí existe el "Panel de control" y el login se pide al abrir. */
export const isDesktop = !keepSession;
