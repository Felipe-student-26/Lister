import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Role } from '../lib/types';

export type { Role };

interface ProfileState {
  ready: boolean;
  /** null = sin acceso (sin documento users/{uid}, rol desconocido o perfil inválido). */
  role: Role | null;
  /** uid dueño de los datos clínicos: solo la terapeuta (su propio uid). El admin de la plataforma no tiene datos. */
  ownerId: string | null;
  load: (uid: string) => void;
  reset: () => void;
}

let unsub: Unsubscribe | null = null;

export const useProfile = create<ProfileState>((set, get) => ({
  ready: false,
  role: null,
  ownerId: null,

  load: (uid) => {
    get().reset();
    unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const d = snap.data() as { role?: string; ownerId?: string } | undefined;
        if (snap.exists() && d?.role === 'admin') {
          set({ ready: true, role: 'admin', ownerId: null });
        } else if (snap.exists() && d?.role === 'therapist' && d.ownerId === uid) {
          // Igual que las reglas: una terapeuta solo cuenta si su perfil apunta a su propio uid.
          set({ ready: true, role: 'therapist', ownerId: uid });
        } else {
          set({ ready: true, role: null, ownerId: null }); // sin documento = sin acceso
        }
      },
      () => set({ ready: true, role: null, ownerId: null }), // ante error, sin acceso
    );
  },

  reset: () => {
    unsub?.();
    unsub = null;
    set({ ready: false, role: null, ownerId: null });
  },
}));

/** Permisos de la UI (las reglas de Firestore son la barrera real). */
export function useCan() {
  const role = useProfile((s) => s.role);
  return { role, canDelete: role === 'therapist', canManageTherapists: role === 'admin' };
}
