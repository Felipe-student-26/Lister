import { create } from 'zustand';
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updatePassword,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  serverLockEnabled,
  serverLoginAttempt,
  serverLoginGate,
  serverLoginSuccess,
  serverMfaFailure,
  type LoginAttemptResponse,
} from '../lib/functions';
import { passkeyAvailability, passkeyErrorMessage, passkeyLogin } from '../lib/passkey';
import { toast } from './toast';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const LOCK_KEY = 'lister.loginLock';

interface LockInfo {
  attempts: number;
  lockedUntil: number;
}

function readLock(): LockInfo {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) || '') as LockInfo;
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}
function writeLock(l: LockInfo) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(l));
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Bloqueo LOCAL (solo si VITE_USE_SERVER_LOCK no está activado): se puede saltar borrando localStorage.
 * Con VITE_USE_SERVER_LOCK=true el conteo vive en Cloud Functions (functions/src/loginLogic.ts).
 * Cuenta un fallo (contraseña o código 2FA) y lanza el error correspondiente.
 */
function registerFailure(lock: LockInfo): never {
  const attempts = (lock.lockedUntil && lock.lockedUntil <= Date.now() ? 0 : lock.attempts) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    writeLock({ attempts: 0, lockedUntil: Date.now() + LOCK_MS });
    throw new Error('Cuenta bloqueada 15 minutos por 5 intentos fallidos.');
  }
  writeLock({ attempts, lockedUntil: 0 });
  throw new Error(`Credenciales incorrectas. Intentos restantes: ${MAX_ATTEMPTS - attempts}.`);
}

function assertNotLocked(lock: LockInfo) {
  if (lock.lockedUntil > Date.now()) {
    const mins = Math.ceil((lock.lockedUntil - Date.now()) / 60000);
    throw new Error(`Demasiados intentos. Intenta de nuevo en ${mins} min.`);
  }
}

// El resolver de MFA no es serializable: vive fuera del estado.
let mfaResolver: MultiFactorResolver | null = null;
// Credenciales del intento en curso (solo en memoria y solo mientras se espera el 2.º factor).
// La contraseña solo se conserva si hay passkey: el servidor la vuelve a verificar al pedir el desafío.
let pending: { email: string; password: string } | null = null;

const LOCK_UNAVAILABLE = 'No se pudo contactar el servidor de seguridad. Revisa tu conexión e inténtalo de nuevo.';
const BLOCKED_BY_SERVER = 'Demasiados intentos. Intenta de nuevo en unos minutos.';

export interface MfaMethods {
  totp: boolean;
  passkey: boolean;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  /** true mientras se espera el segundo factor (código TOTP o passkey) */
  mfaPending: boolean;
  /** segundos factores disponibles para el intento en curso */
  mfaMethods: MfaMethods;
  init: () => () => void;
  /** 'mfa' = contraseña correcta, falta el código de la app autenticadora */
  login: (email: string, password: string) => Promise<'ok' | 'mfa'>;
  verifyMfa: (code: string) => Promise<void>;
  /** Segundo factor con passkey (WebAuthn): el servidor verifica contraseña + aserción y emite un custom token. */
  verifyPasskey: () => Promise<void>;
  cancelMfa: () => void;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Re-autentica con la contraseña actual (necesario para operaciones sensibles). */
  reauth: (password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

type SetState = (partial: Partial<AuthState>) => void;

function finishMfa(set: SetState) {
  mfaResolver = null;
  pending = null;
  set({ mfaPending: false, mfaMethods: { totp: false, passkey: false } });
}

/** Inicio de sesión con bloqueo en servidor: primero loginAttempt (verifica y cuenta), luego el SDK (necesario para la sesión). */
async function loginWithServerLock(set: SetState, email: string, password: string): Promise<'ok' | 'mfa'> {
  let r: LoginAttemptResponse;
  try {
    r = await serverLoginAttempt(email, password);
  } catch {
    throw new Error(LOCK_UNAVAILABLE);
  }
  if (r.result === 'locked' || r.result === 'wrong') throw new Error(r.message);
  if (r.result === 'error') throw new Error(r.message || 'No se pudo verificar el acceso. Inténtalo de nuevo.');

  const passkeyOk = r.hasPasskey && passkeyAvailability().available;
  if (r.hasPasskey && !passkeyOk && !r.hasTotp) {
    toast.info('Los passkeys no están disponibles en este dispositivo: se inició sesión solo con la contraseña.');
  }
  if (passkeyOk && !r.hasTotp) {
    // No se llama al SDK: con solo contraseña Firebase abriría la sesión sin segundo factor.
    pending = { email, password };
    set({ mfaPending: true, mfaMethods: { totp: false, passkey: true } });
    return 'mfa';
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    void serverLoginSuccess().catch(() => undefined);
    return 'ok';
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'auth/multi-factor-auth-required') {
      mfaResolver = getMultiFactorResolver(auth, err as Parameters<typeof getMultiFactorResolver>[1]);
      pending = { email, password: passkeyOk ? password : '' };
      set({ mfaPending: true, mfaMethods: { totp: true, passkey: passkeyOk } });
      return 'mfa';
    }
    if (String(e.message).includes('BLOCKING_FUNCTION') || e.code === 'auth/too-many-requests') throw new Error(BLOCKED_BY_SERVER);
    // El servidor ya validó la contraseña: esto solo ocurre si cambió entre ambas llamadas o hay un error de red.
    if (e.code === 'auth/network-request-failed') throw new Error('Sin conexión. Inténtalo cuando vuelva internet.');
    throw new Error('Credenciales incorrectas.');
  }
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  mfaPending: false,
  mfaMethods: { totp: false, passkey: false },

  init: () =>
    onAuthStateChanged(auth, (user) => set({ user, ready: true })),

  login: async (email, password) => {
    if (serverLockEnabled) return loginWithServerLock(set, email, password);

    const lock = readLock();
    assertNotLocked(lock);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      writeLock({ attempts: 0, lockedUntil: 0 });
      return 'ok';
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/multi-factor-auth-required') {
        // Contraseña correcta: no cuenta como fallo; falta el segundo factor.
        mfaResolver = getMultiFactorResolver(auth, err as Parameters<typeof getMultiFactorResolver>[1]);
        set({ mfaPending: true, mfaMethods: { totp: true, passkey: false } });
        return 'mfa';
      }
      return registerFailure(lock);
    }
  },

  verifyMfa: async (code) => {
    if (!mfaResolver) throw new Error('La verificación expiró. Vuelve a iniciar sesión.');
    const server = serverLockEnabled && pending !== null;
    const lock = server ? null : readLock();
    if (lock) assertNotLocked(lock);
    if (server) {
      try {
        const g = await serverLoginGate(pending!.email);
        if (g.locked) throw new Error(g.message);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Demasiados')) throw err;
        throw new Error(LOCK_UNAVAILABLE);
      }
    }
    const hint = mfaResolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error('Esta cuenta no tiene un autenticador TOTP disponible.');
    try {
      await mfaResolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
      if (lock) writeLock({ attempts: 0, lockedUntil: 0 });
      else void serverLoginSuccess().catch(() => undefined);
      finishMfa(set);
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/invalid-verification-code') {
        if (lock) return registerFailure(lock);
        const r = await serverMfaFailure(pending!.email).catch(() => null);
        throw new Error(r && 'message' in r ? r.message : 'Credenciales incorrectas.');
      }
      throw err;
    }
  },

  verifyPasskey: async () => {
    if (!pending?.password) throw new Error('La verificación expiró. Vuelve a iniciar sesión.');
    try {
      const token = await passkeyLogin(pending.email, pending.password);
      await signInWithCustomToken(auth, token);
    } catch (err) {
      throw new Error(passkeyErrorMessage(err));
    }
    void serverLoginSuccess().catch(() => undefined);
    finishMfa(set);
  },

  cancelMfa: () => {
    finishMfa(set);
  },

  logout: async () => {
    await signOut(auth);
  },

  resetPassword: async (email) => {
    await sendPasswordResetEmail(auth, email);
  },

  reauth: async (password) => {
    const u = auth.currentUser;
    if (!u?.email) throw new Error('Sin sesión activa.');
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    } catch (err) {
      // Con 2FA activo, Firebase exige el segundo factor: la contraseña ya fue validada y la sesión es la propia.
      if ((err as { code?: string }).code !== 'auth/multi-factor-auth-required') throw err;
    }
  },

  changePassword: async (current, next) => {
    const u = auth.currentUser;
    if (!u?.email) throw new Error('Sin sesión activa.');
    await useAuth.getState().reauth(current);
    // Si la sesión no es reciente Firebase responde auth/requires-recent-login (mfaErrorMessage lo explica).
    await updatePassword(u, next);
  },
}));
