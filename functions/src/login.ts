import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserSignedIn, HttpsError as IdentityHttpsError } from 'firebase-functions/v2/identity';
import { defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { adminAuth, adminDb, firestoreLockStore } from './admin';
import { gate } from './lock';
import { handleLoginAttempt, handleLoginGate, handleLoginSuccess, handleMfaFailure, type LoginDeps } from './loginLogic';

export const WEB_API_KEY = defineString('WEB_API_KEY');
export const WEB_API_REFERER = defineString('WEB_API_REFERER', { default: '' });

/** Dependencias reales (Firestore, fetch global de Node 20, Admin SDK). */
export function realLoginDeps(): LoginDeps {
  return {
    store: firestoreLockStore(),
    fetchFn: (url, init) => fetch(url, init),
    apiKey: WEB_API_KEY.value(),
    referer: WEB_API_REFERER.value() || undefined,
    now: () => Date.now(),
    lookupAccount: async (email) => {
      const user = await adminAuth().getUserByEmail(email);
      const hasTotp = (user.multiFactor?.enrolledFactors ?? []).some((f) => f.factorId === 'totp');
      const snap = await adminDb().collection('passkeys').doc(user.uid).collection('credentials').limit(1).get();
      return { hasTotp, hasPasskey: !snap.empty };
    },
  };
}

export const loginGate = onCall(async (req) => handleLoginGate(realLoginDeps(), req.data ?? {}));

export const loginAttempt = onCall(async (req) => handleLoginAttempt(realLoginDeps(), req.data ?? {}));

/** Reinicia el contador tras un inicio de sesión completo (incluido el 2.º factor). Exige sesión: no es falsificable. */
export const loginSuccess = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sin sesión.');
  const user = await adminAuth().getUser(req.auth.uid);
  await handleLoginSuccess(realLoginDeps(), user.email);
  return { ok: true };
});

export const reportMfaFailure = onCall(async (req) => handleMfaFailure(realLoginDeps(), req.data ?? {}));

/**
 * Blocking function (Identity Platform): rechaza el inicio de sesión mientras haya bloqueo vigente,
 * también cuando se usa el SDK/REST directamente sin pasar por loginAttempt.
 * Si Firestore falla, deja pasar (fail-open) para no dejar a todo el mundo fuera; el error queda en los logs.
 */
export const beforeSignIn = beforeUserSignedIn(async (event) => {
  const email = event.data?.email;
  if (!email) return;
  let locked: { locked: boolean; message: string };
  try {
    locked = await gate(firestoreLockStore(), email, Date.now());
  } catch (err) {
    logger.error('beforeSignIn: no se pudo leer el bloqueo', err);
    return;
  }
  if (locked.locked) throw new IdentityHttpsError('resource-exhausted', locked.message);
});
