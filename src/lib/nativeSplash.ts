import { isNativeApp, type EnvLike } from './platform';

/**
 * Oculta el splash NATIVO de Android (capacitor.config.ts lo deja con launchAutoHide: false).
 * Debajo ya está el splash web (index.html / Splash.tsx) con el mismo diseño, así que el relevo no se nota.
 * En PC y en el navegador no hace nada.
 */
export async function hideNativeSplash(env: EnvLike | undefined = typeof window === 'undefined' ? undefined : (window as unknown as EnvLike)) {
  if (!isNativeApp(env)) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* plugin no disponible: el splash nativo se oculta solo al cargar la página */
  }
}
