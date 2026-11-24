import { collection, doc, onSnapshot, query, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import type { TherapistProfile } from './types';
import { emptyTherapistProfile } from './validation';

/** Terapeuta de la plataforma: la cuenta (users/{uid}) más su perfil profesional (therapistProfiles/{uid}), que puede no existir en cuentas migradas. */
export interface Therapist extends TherapistProfile {
  uid: string;
  hasProfile: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Une las cuentas con rol terapeuta y sus perfiles. El nombre y el correo del perfil mandan; si no hay perfil se usa el correo de la cuenta. */
export function mergeTherapists(accounts: { uid: string; email: string }[], profiles: Map<string, Partial<TherapistProfile>>): Therapist[] {
  return accounts
    .map((a) => {
      const p = profiles.get(a.uid);
      const base = emptyTherapistProfile();
      return {
        ...base,
        ...(p ? Object.fromEntries(Object.keys(base).map((k) => [k, str(p[k as keyof TherapistProfile])])) : {}),
        email: str(p?.email) || a.email,
        uid: a.uid,
        hasProfile: Boolean(p),
      } as Therapist;
    })
    .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
}

/**
 * Terapeutas de la plataforma. Dos escuchas: users (solo role == 'therapist', lo exigen las reglas) y therapistProfiles
 * (el admin lista todos). Solo el administrador puede suscribirse.
 */
export function watchTherapists(onData: (rows: Therapist[]) => void, onError: () => void): Unsubscribe {
  let accounts: { uid: string; email: string }[] | null = null;
  let profiles: Map<string, Partial<TherapistProfile>> | null = null;
  const emit = () => accounts && profiles && onData(mergeTherapists(accounts, profiles));
  const u1 = onSnapshot(
    query(collection(db, 'users'), where('role', '==', 'therapist')),
    (snap) => {
      accounts = snap.docs.map((d) => ({ uid: d.id, email: str((d.data() as { email?: string }).email) }));
      emit();
    },
    onError,
  );
  const u2 = onSnapshot(
    collection(db, 'therapistProfiles'),
    (snap) => {
      profiles = new Map(snap.docs.map((d) => [d.id, d.data() as Partial<TherapistProfile>]));
      emit();
    },
    onError,
  );
  return () => {
    u1();
    u2();
  };
}

/** Guarda el perfil desde el cliente (las reglas lo permiten solo al admin y exigen nombre y correo). Vaciar un campo = guardarlo como ''. */
export function saveTherapistProfile(uid: string, p: TherapistProfile): Promise<void> {
  const clean = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v).trim()])) as unknown as TherapistProfile;
  return setDoc(doc(db, 'therapistProfiles', uid), { ...clean, updatedAt: Date.now() }, { merge: true });
}
