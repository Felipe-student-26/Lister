import { useEffect, useState } from 'react';

/** Tiempo mínimo que se ve el splash (para que no parpadee si todo carga al instante). */
export const SPLASH_MIN_MS = 1500;
/** Tope: si algo no responde (sin red, perfil que no llega) el splash se cierra igual y la app muestra su propio estado. */
export const SPLASH_MAX_MS = 8000;

const bootAt = Date.now();

export interface SplashInput {
  /** PC (Electron o navegador de escritorio). */
  desktop: boolean;
  /** Firebase Auth ya informó si hay sesión. */
  ready: boolean;
  hasUser: boolean;
  /** Ya se cargó el perfil (rol) de la cuenta. */
  profileReady: boolean;
}

const OFF = { active: false, minDone: false };

/**
 * ¿Mostrar el splash?
 * - Celular: al abrir la app, hasta que haya sesión/perfil resueltos (mínimo SPLASH_MIN_MS).
 * - PC: solo al iniciar sesión (paso de "sin sesión" a "con sesión"), hasta que cargue el perfil (mínimo SPLASH_MIN_MS).
 *   Al abrir la app en PC se ve directamente el login.
 */
export function useSplash({ desktop, ready, hasUser, profileReady }: SplashInput): boolean {
  // Celular: tiempo mínimo desde que arrancó la app
  const [bootDone, setBootDone] = useState(false);
  useEffect(() => {
    if (desktop) return;
    const t = setTimeout(() => setBootDone(true), Math.max(0, SPLASH_MIN_MS - (Date.now() - bootAt)));
    return () => clearTimeout(t);
  }, [desktop]);

  // PC: detectar el inicio de sesión. Se ajusta durante el render para que el splash aparezca en el mismo cuadro en que entra el usuario.
  const [seen, setSeen] = useState<boolean | null>(null);
  const [login, setLogin] = useState(OFF);
  if (ready && seen !== hasUser) {
    setSeen(hasUser);
    if (!hasUser) setLogin(OFF);
    else if (seen === false) setLogin({ active: true, minDone: false });
  }
  useEffect(() => {
    if (!login.active || login.minDone) return;
    const t = setTimeout(() => setLogin((l) => ({ ...l, minDone: true })), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, [login.active, login.minDone]);

  const wanted = desktop ? login.active && !(login.minDone && profileReady) : !bootDone || !ready || (hasUser && !profileReady);

  // Tope de seguridad
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!wanted) {
      setGaveUp(false);
      return;
    }
    const t = setTimeout(() => setGaveUp(true), SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, [wanted]);

  return wanted && !gaveUp;
}
