import { create } from 'zustand';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { newToken, type AnamnesisForm } from '../lib/anamnesis';
import type { Client } from '../lib/types';
import { toast } from './toast';
import { metrics, tracked } from './metrics';

interface AnamnesisState {
  ownerId: string | null;
  loading: boolean;
  forms: AnamnesisForm[];

  start: (ownerId: string) => void;
  stop: () => void;

  /** Crea un formulario pendiente (enlace nuevo) para el paciente y lo devuelve. */
  create: (client: Pick<Client, 'id' | 'fullName'>) => Promise<AnamnesisForm>;
  remove: (id: string) => Promise<void>;
}

let unsub: Unsubscribe | null = null;

export const useAnamnesis = create<AnamnesisState>((set, get) => ({
  ownerId: null,
  loading: true,
  forms: [],

  start: (ownerId) => {
    unsub?.();
    set({ ownerId, loading: true });
    metrics.attempt('sync', 'sub:anamnesisForms');
    unsub = onSnapshot(
      query(collection(db, 'anamnesisForms'), where('ownerId', '==', ownerId)),
      (snap) => set({ forms: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as AnamnesisForm), loading: false }),
      () => {
        metrics.fail('sync', 'sub:anamnesisForms');
        toast.error('Error de sincronización. Se reintentará automáticamente.');
      },
    );
  },

  stop: () => {
    unsub?.();
    unsub = null;
    set({ ownerId: null, forms: [], loading: true });
  },

  create: async (client) => {
    const ownerId = get().ownerId;
    if (!ownerId) throw new Error('Sin sesión');
    const form: AnamnesisForm = {
      id: newToken(),
      ownerId,
      clientId: client.id,
      clientName: client.fullName,
      status: 'pending',
      answers: {},
      createdAt: Date.now(),
    };
    const { id, ...data } = form;
    await tracked('save', 'anamnesis:create', () => setDoc(doc(db, 'anamnesisForms', id), data));
    return form;
  },

  remove: async (id) => {
    await tracked('save', 'anamnesis:delete', () => deleteDoc(doc(db, 'anamnesisForms', id)));
  },
}));

/** Formularios de un paciente, el más reciente primero. */
export const formsOfClient = (forms: AnamnesisForm[], clientId: string) =>
  forms.filter((f) => f.clientId === clientId).sort((a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt));

/** Última anamnesis respondida de un paciente (la que muestra su pestaña). */
export const latestCompleted = (forms: AnamnesisForm[], clientId: string) =>
  formsOfClient(forms, clientId).find((f) => f.status === 'completed');

/** Formulario enviado y aún sin responder (el más reciente). */
export const latestPending = (forms: AnamnesisForm[], clientId: string) =>
  formsOfClient(forms, clientId).find((f) => f.status === 'pending');
