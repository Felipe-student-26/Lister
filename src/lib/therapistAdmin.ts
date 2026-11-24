import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, getAuth, sendPasswordResetEmail, signOut, type Auth } from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { app, auth, db } from './firebase';
import { useProfile } from '../store/profile';
import type { TherapistProfile } from './types';
import { validateTherapistProfile } from './validation';

/**
 * Gestión de terapeutas SIN Cloud Functions (plan Spark): todo corre en el cliente con la sesión del administrador.
 * La seguridad real son las reglas de Firestore (solo el admin crea documentos de terapeuta válidos y los borra);
 * la comprobación de rol de aquí solo evita llamadas inútiles y mensajes confusos.
 *
 * Límites que se aceptaron al mover esto al cliente:
 *  - Eliminar NO borra la cuenta de Firebase Authentication (el cliente no puede): queda huérfana y su correo ocupado hasta
 *    que alguien la borre a mano en la consola (Authentication). Sin users/{uid} esa cuenta ya no entra a nada.
 *  - Eliminar NO borra los datos clínicos (clients, appointments, sessions, observations).
 */

/** Nombre de la segunda instancia de Firebase usada solo para crear la cuenta sin cerrar la sesión del admin. */
export const SECONDARY_APP_NAME = 'secondary';

/** Error con mensaje ya en español, listo para mostrarse en la interfaz. */
export class TherapistAdminError extends Error {
  constructor(
    message: string,
    public code = 'unknown',
  ) {
    super(message);
    this.name = 'TherapistAdminError';
  }
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use':
    'Ese correo ya existe en Firebase Authentication. Si era de una terapeuta eliminada, bórralo a mano en la consola (Authentication).',
  'auth/invalid-email': 'Correo no válido.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/weak-password': 'La contraseña temporal fue rechazada por la política del proyecto. Revisa la política de contraseñas en Firebase.',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está habilitado en Firebase Authentication.',
  'auth/missing-email': 'Escribe el correo.',
  'auth/user-not-found': 'No existe una cuenta de acceso con ese correo en Firebase Authentication.',
  'auth/unauthorized-continue-uri': 'El dominio de la app no está autorizado en Firebase Authentication.',
  'permission-denied': 'No tienes permiso para hacer esto. Solo un administrador puede gestionar terapeutas.',
  unavailable: 'No se pudo contactar el servidor. Revisa tu conexión.',
};

/** Convierte cualquier error (Auth, Firestore o propio) en un TherapistAdminError con texto en español. */
export function toAdminError(err: unknown, fallback = 'No se pudo completar la operación.'): TherapistAdminError {
  if (err instanceof TherapistAdminError) return err;
  const code = String((err as { code?: string } | null)?.code ?? '');
  const key = code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
  return new TherapistAdminError(AUTH_MESSAGES[key] ?? fallback, code || 'unknown');
}

/** Mensaje legible para mostrar en la interfaz. */
export function therapistErrorMessage(err: unknown, fallback = 'No se pudo completar la operación.'): string {
  return toAdminError(err, fallback).message;
}

function assertAdmin(): void {
  if (useProfile.getState().role !== 'admin') {
    throw new TherapistAdminError('Solo un administrador puede gestionar terapeutas.', 'not-admin');
  }
}

/** Contraseña temporal larga y aleatoria (crypto.getRandomValues). Nadie la ve: la terapeuta define la suya con el correo. */
export function randomTempPassword(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // base64 url-safe + sufijo fijo para cumplir cualquier política (mayúscula, minúscula, número y símbolo).
  return `${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}aA1!`;
}

const MAX_LEN: Record<string, number> = { fullName: 120, email: 120, bio: 600, officeAddress: 200 };
const maxLen = (k: string) => MAX_LEN[k] ?? 80;

/** Mismo formato que escribían las funciones: todo texto recortado, opcionales vacíos como '' (coincide con las reglas). */
function cleanProfile(profile: TherapistProfile, email: string): TherapistProfile {
  const out = {} as Record<string, string>;
  for (const [k, v] of Object.entries(profile)) out[k] = String(v ?? '').trim().slice(0, maxLen(k));
  out.email = email;
  return out as unknown as TherapistProfile;
}

export interface CreateTherapistResult {
  uid: string;
  email: string;
  /** false = la cuenta y los documentos se crearon, pero el correo no salió: se puede reenviar con "Enviar correo de contraseña". */
  emailSent: boolean;
}

/**
 * Crea la cuenta de acceso y los documentos de la terapeuta.
 * 1. Cuenta en Authentication desde una SEGUNDA instancia de Firebase (así no se cierra la sesión del admin).
 * 2. users/{uid} + therapistProfiles/{uid} en un solo lote con la sesión del admin.
 * 3. Si falla Firestore, se borra la cuenta recién creada y se relanza el error.
 * 4. Correo para que defina su contraseña. 5. Siempre: cierra sesión y elimina la instancia secundaria.
 */
export async function createTherapistAccount({ email, profile }: { email: string; profile: TherapistProfile }): Promise<CreateTherapistResult> {
  assertAdmin();
  const cleanEmail = email.trim().toLowerCase();
  const errors = validateTherapistProfile({ ...profile, email: cleanEmail });
  if (Object.values(errors).some(Boolean)) {
    throw new TherapistAdminError(Object.values(errors).find(Boolean) as string, 'invalid-profile');
  }

  const secondary = initializeApp(app.options, SECONDARY_APP_NAME);
  let secondaryAuth: Auth | null = null;
  try {
    secondaryAuth = getAuth(secondary);
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, randomTempPassword());
    } catch (err) {
      throw toAdminError(err, 'No se pudo crear la cuenta de acceso.');
    }
    const uid = cred.user.uid;

    try {
      const now = Date.now();
      const batch = writeBatch(db);
      // La terapeuta es dueña de sus propios datos: ownerId = su uid (las reglas lo exigen).
      batch.set(doc(db, 'users', uid), { role: 'therapist', ownerId: uid, email: cleanEmail, createdAt: now });
      batch.set(doc(db, 'therapistProfiles', uid), { ...cleanProfile(profile, cleanEmail), createdAt: now, updatedAt: now });
      await batch.commit();
    } catch (err) {
      // Sin documentos la cuenta no tendría acceso y el correo quedaría ocupado: se revierte (sigue autenticada la nueva cuenta).
      await deleteUser(cred.user).catch(() => undefined);
      throw toAdminError(err, 'No se pudo guardar a la terapeuta.');
    }

    let emailSent = true;
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch {
      emailSent = false; // la terapeuta ya existe: el admin puede reenviar el correo desde la tabla
    }
    return { uid, email: cleanEmail, emailSent };
  } finally {
    if (secondaryAuth) await signOut(secondaryAuth).catch(() => undefined);
    await deleteApp(secondary).catch(() => undefined);
  }
}

/**
 * Borra users/{uid} y therapistProfiles/{uid} en un lote. NO borra la cuenta de Authentication (el cliente no puede)
 * ni los datos clínicos. Sin users/{uid} la cuenta queda sin acceso ("Tu cuenta no tiene acceso").
 */
export async function removeTherapistAccount(uid: string): Promise<void> {
  assertAdmin();
  if (!uid) throw new TherapistAdminError('Falta la terapeuta.', 'invalid-argument');
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid));
    batch.delete(doc(db, 'therapistProfiles', uid));
    await batch.commit();
  } catch (err) {
    throw toAdminError(err, 'No se pudo eliminar a la terapeuta.');
  }
}

/** Envía el correo para definir o restablecer la contraseña (plantilla de Authentication). */
export async function sendTherapistPasswordLink(email: string): Promise<void> {
  assertAdmin();
  const clean = email.trim();
  if (!clean) throw new TherapistAdminError('La terapeuta no tiene correo.', 'invalid-argument');
  try {
    await sendPasswordResetEmail(auth, clean);
  } catch (err) {
    throw toAdminError(err, 'No se pudo enviar el correo.');
  }
}
