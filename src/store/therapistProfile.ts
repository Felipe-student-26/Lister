import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { TherapistProfile } from '../lib/types';
import { emptyTherapistProfile } from '../lib/validation';

interface State {
  /** true cuando ya llegó la primera respuesta (con o sin documento). */
  ready: boolean;
  /** null = todavía no hay documento therapistProfiles/{uid} (p. ej. cuentas migradas). */
  profile: TherapistProfile | null;
  error: boolean;
  load: (uid: string) => void;
  reset: () => void;
}

let unsub: Unsubscribe | null = null;

/** Normaliza el documento: todo texto, con '' en lo que falte. */
export function toProfile(d: Record<string, unknown>): TherapistProfile {
  const base = emptyTherapistProfile();
  return Object.fromEntries(Object.keys(base).map((k) => [k, typeof d[k] === 'string' ? d[k] : ''])) as unknown as TherapistProfile;
}

/**
 * Perfil profesional de la terapeuta que inició sesión (therapistProfiles/{uid}); solo lectura: lo edita el administrador.
 * Solo se carga para role === 'therapist' (las reglas no dejan leerlo a otros).
 */
export const useTherapistProfile = create<State>((set, get) => ({
  ready: false,
  profile: null,
  error: false,

  load: (uid) => {
    get().reset();
    unsub = onSnapshot(
      doc(db, 'therapistProfiles', uid),
      (snap) => set({ ready: true, error: false, profile: snap.exists() ? toProfile(snap.data() as Record<string, unknown>) : null }),
      () => set({ ready: true, error: true, profile: null }),
    );
  },

  reset: () => {
    unsub?.();
    unsub = null;
    set({ ready: false, profile: null, error: false });
  },
}));
