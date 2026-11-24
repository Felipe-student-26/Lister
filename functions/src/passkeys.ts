import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { adminAuth, adminDb, firestoreLockStore } from './admin';
import { emailKey, gate, registerFailure, registerSuccess } from './lock';
import { checkCredentials } from './loginLogic';
import { parseAllowedOrigins, resolveRp, RpError } from './rp';
import { realLoginDeps } from './login';

const PASSKEY_ORIGINS = defineString('PASSKEY_ORIGINS', { default: '' });
const RP_NAME = defineString('RP_NAME', { default: 'Lister' });
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface StoredCredential {
  id: string;
  publicKey: string; // base64url
  counter: number;
  transports: AuthenticatorTransportFuture[];
  rpID: string;
  name: string;
  createdAt: number;
}

const credCol = (uid: string) => adminDb().collection('passkeys').doc(uid).collection('credentials');
const challengeDoc = (id: string) => adminDb().collection('passkeyChallenges').doc(id);

function rpFrom(origin: unknown) {
  try {
    return resolveRp(origin, parseAllowedOrigins(PASSKEY_ORIGINS.value()));
  } catch (err) {
    if (err instanceof RpError) throw new HttpsError('failed-precondition', err.message);
    throw err;
  }
}

async function listCreds(uid: string): Promise<StoredCredential[]> {
  const snap = await credCol(uid).get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<StoredCredential, 'id'>), id: d.id }));
}

/** Lee y consume (un solo uso) el desafío; falla si no existe, venció o es de otro tipo. */
async function takeChallenge(id: string, type: 'register' | 'login') {
  const ref = challengeDoc(id);
  const snap = await ref.get();
  await ref.delete().catch(() => undefined);
  const d = snap.data() as
    | { type: string; challenge: string; rpID: string; origin: string; uid: string; expiresAt: number }
    | undefined;
  if (!d || d.type !== type || d.expiresAt < Date.now()) {
    throw new HttpsError('deadline-exceeded', 'La verificación expiró. Inténtalo de nuevo.');
  }
  return d;
}

// ── Registro (sesión iniciada + contraseña verificada en servidor) ─────────────────────────────────────────────────

export const passkeyRegisterOptions = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const uid = req.auth.uid;
  const { origin, rpID } = rpFrom(req.data?.origin);
  const user = await adminAuth().getUser(uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'La cuenta no tiene correo.');

  // La contraseña se verifica en servidor (funciona también con TOTP activo y cuenta los fallos).
  const check = await checkCredentials(realLoginDeps(), user.email, req.data?.password);
  if (!check.ok) {
    const msg = 'message' in check.response ? check.response.message : 'No se pudo verificar la contraseña.';
    throw new HttpsError('permission-denied', msg);
  }

  const existing = (await listCreds(uid)).filter((c) => c.rpID === rpID);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME.value(),
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(uid),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await challengeDoc(`reg_${uid}`).set({
    type: 'register',
    challenge: options.challenge,
    rpID,
    origin,
    uid,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return options;
});

export const passkeyRegisterVerify = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const uid = req.auth.uid;
  const rec = await takeChallenge(`reg_${uid}`, 'register');
  const name = String(req.data?.name ?? '').trim().slice(0, 60) || 'Passkey';

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.data?.response as RegistrationResponseJSON,
      expectedChallenge: rec.challenge,
      expectedOrigin: rec.origin,
      expectedRPID: rec.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new HttpsError('invalid-argument', 'No se pudo verificar el passkey.');
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpsError('invalid-argument', 'No se pudo verificar el passkey.');
  }
  const { credential } = verification.registrationInfo;
  const doc: Omit<StoredCredential, 'id'> = {
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    rpID: rec.rpID,
    name,
    createdAt: Date.now(),
  };
  await credCol(uid).doc(credential.id).set(doc);
  return { id: credential.id, name };
});

export const passkeyList = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const creds = await listCreds(req.auth.uid);
  return creds.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, rpID: c.rpID }));
});

export const passkeyRemove = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const id = String(req.data?.id ?? '');
  if (!id) throw new HttpsError('invalid-argument', 'Falta el passkey.');
  await credCol(req.auth.uid).doc(id).delete();
  return { ok: true };
});

// ── Login: contraseña (verificada en servidor) + aserción → custom token ───────────────────────────────────────────

export const passkeyLoginOptions = onCall(async (req) => {
  const { origin, rpID } = rpFrom(req.data?.origin);
  const check = await checkCredentials(realLoginDeps(), req.data?.email, req.data?.password);
  if (!check.ok) {
    const msg = 'message' in check.response ? check.response.message : 'No se pudo verificar el acceso.';
    throw new HttpsError('permission-denied', msg);
  }
  const user = await adminAuth().getUserByEmail(check.email);
  const creds = (await listCreds(user.uid)).filter((c) => c.rpID === rpID);
  if (!creds.length) {
    throw new HttpsError('failed-precondition', 'Esta cuenta no tiene un passkey registrado para este dispositivo o sitio.');
  }
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: 'required',
  });
  await challengeDoc(`login_${emailKey(check.email)}`).set({
    type: 'login',
    challenge: options.challenge,
    rpID,
    origin,
    uid: user.uid,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return options;
});

export const passkeyLoginVerify = onCall(async (req) => {
  const store = firestoreLockStore();
  const email = String(req.data?.email ?? '');
  const g = await gate(store, email, Date.now());
  if (g.locked) throw new HttpsError('resource-exhausted', g.message);

  const rec = await takeChallenge(`login_${emailKey(email)}`, 'login');
  const response = req.data?.response as AuthenticationResponseJSON | undefined;
  const fail = async (): Promise<never> => {
    const f = await registerFailure(store, email, Date.now());
    throw new HttpsError('permission-denied', f.message);
  };
  if (!response?.id) return fail();

  const credRef = credCol(rec.uid).doc(response.id);
  const credSnap = await credRef.get();
  if (!credSnap.exists) return fail();
  const stored = credSnap.data() as Omit<StoredCredential, 'id'>;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: rec.challenge,
      expectedOrigin: rec.origin,
      expectedRPID: rec.rpID,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
        counter: stored.counter,
        transports: stored.transports,
      },
      requireUserVerification: true,
    });
  } catch {
    return fail();
  }
  if (!verification.verified) return fail();

  await credRef.update({ counter: verification.authenticationInfo.newCounter });
  // El token solo se emite tras verificar contraseña (en passkeyLoginOptions) + aserción (aquí).
  const token = await adminAuth().createCustomToken(rec.uid);
  await registerSuccess(store, email, Date.now());
  return { token };
});
