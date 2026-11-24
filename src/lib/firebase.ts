import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { keepSession } from './platform';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

// Sin .env (p. ej. un instalador construido sin variables) initializeAuth lanza 'auth/invalid-api-key' al importar el módulo
// y la ventana queda en blanco. Con una clave de relleno la app arranca y muestra "Falta configurar Firebase" (App.tsx).
export const app = initializeApp(firebaseConfigured ? config : { ...config, apiKey: 'sin-configurar', projectId: 'sin-configurar' });

// Celular: sesión persistente (se inicia sesión una sola vez; Firebase renueva el token solo).
// PC (Electron / navegador de escritorio): la sesión dura mientras la app esté abierta (sobrevive a recargar, no a cerrar y volver a abrir).
// El cierre por inactividad en PC se maneja en useIdleLogout. Ver src/lib/platform.ts.
if (!keepSession && typeof localStorage !== 'undefined') {
  // Sesiones guardadas por versiones anteriores (persistencia local): se descartan para exigir iniciar sesión.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('firebase:authUser:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* almacenamiento no disponible */
  }
}
export const auth = initializeAuth(app, {
  persistence: keepSession ? [indexedDBLocalPersistence, browserLocalPersistence] : [browserSessionPersistence],
});

// Firestore con caché en IndexedDB: funciona sin internet y sincroniza solo al volver la conexión.
// Conflictos: last write wins (comportamiento por defecto de Firestore).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
