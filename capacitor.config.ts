import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lister.app',
  appName: 'Lister',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    // Splash nativo de Android: rosado con el logo blanco (resources/splash.png). No se oculta solo: lo oculta la app
    // (src/lib/nativeSplash.ts) cuando React ya pintó el splash web, que tiene el mismo diseño.
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#e1477a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
