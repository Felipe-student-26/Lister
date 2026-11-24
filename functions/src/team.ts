import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from './admin';
import { assertAdmin, assertTherapist, randomPassword, TeamError, validateTherapistInput, type ProfileDoc } from './teamLogic';

const users = () => adminDb().collection('users');
const profiles = () => adminDb().collection('therapistProfiles');

function toHttps(err: unknown): never {
  if (err instanceof HttpsError) throw err;
  if (err instanceof TeamError) throw new HttpsError(err.code, err.message);
  throw err;
}

/** Verifica el rol 'admin' DENTRO de la función (las reglas de Firestore no protegen al Admin SDK). */
async function requireAdmin(req: CallableRequest): Promise<void> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  const snap = await users().doc(req.auth.uid).get();
  try {
    assertAdmin(snap.exists ? (snap.data() as ProfileDoc) : undefined);
  } catch (err) {
    toHttps(err);
  }
}

async function therapistUid(uid: unknown): Promise<string> {
  const id = typeof uid === 'string' ? uid : '';
  if (!id) throw new HttpsError('invalid-argument', 'Falta la terapeuta.');
  const snap = await users().doc(id).get();
  try {
    assertTherapist(snap.exists ? (snap.data() as ProfileDoc) : undefined);
  } catch (err) {
    toHttps(err);
  }
  return id;
}

export const createTherapist = onCall(async (req) => {
  await requireAdmin(req);
  let input;
  try {
    input = validateTherapistInput(req.data);
  } catch (err) {
    return toHttps(err);
  }
  const auth = adminAuth();
  let created;
  try {
    created = await auth.createUser({
      email: input.email,
      password: randomPassword(),
      displayName: input.fullName,
      emailVerified: false,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
    }
    throw err;
  }
  try {
    // Un solo lote: o se crean users/{uid} y therapistProfiles/{uid}, o ninguno.
    const now = Date.now();
    const batch = adminDb().batch();
    // La terapeuta es dueña de sus propios datos: ownerId = su uid.
    batch.set(users().doc(created.uid), { role: 'therapist', ownerId: created.uid, email: input.email, createdAt: now });
    batch.set(profiles().doc(created.uid), { ...input, createdAt: now, updatedAt: now });
    await batch.commit();
  } catch (err) {
    await auth.deleteUser(created.uid).catch(() => undefined); // sin perfil la cuenta quedaría sin acceso
    throw err;
  }
  const link = await auth.generatePasswordResetLink(input.email);
  return { uid: created.uid, email: input.email, link };
});

/** Nuevo enlace para que la terapeuta defina o restablezca su contraseña. */
export const therapistResetLink = onCall(async (req) => {
  await requireAdmin(req);
  const uid = await therapistUid(req.data?.uid);
  const user = await adminAuth().getUser(uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'La terapeuta no tiene correo.');
  return { link: await adminAuth().generatePasswordResetLink(user.email) };
});

/**
 * Elimina la cuenta de Auth, users/{uid} y su perfil profesional therapistProfiles/{uid}. Los datos clínicos (clients, appointments, sessions, observations con su
 * ownerId) NO se borran: quedan huérfanos en Firestore hasta que alguien los elimine a propósito (ver README).
 */
export const removeTherapist = onCall(async (req) => {
  await requireAdmin(req);
  const uid = await therapistUid(req.data?.uid);
  try {
    await adminAuth().deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
  await users().doc(uid).delete();
  await profiles().doc(uid).delete();
  return { ok: true };
});
