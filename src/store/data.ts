import { create } from 'zustand';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Appointment, Client, ObservationNote, SessionRecord } from '../lib/types';
import { BOOKING_MESSAGES, hasConflict, validateBooking, weeklyDates } from '../lib/validation';
import { toast } from './toast';
import { metrics, tracked } from './metrics';
import { useProfile } from './profile';

type NewClient = Omit<Client, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;
type NewSession = Omit<SessionRecord, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

interface DataState {
  ownerId: string | null;
  loading: boolean;
  clients: Client[];
  appointments: Appointment[];
  sessions: SessionRecord[];
  observations: ObservationNote[];

  start: (ownerId: string) => void;
  stop: () => void;

  addClient: (c: NewClient) => Promise<string>;
  updateClient: (id: string, c: Partial<NewClient>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  bookAppointment: (input: { clientId: string; date: string; time: string }) => Promise<boolean>;
  /** Reserva semanal: crea una cita cada 7 días desde `date` hasta `until`, saltando los horarios ocupados. */
  bookWeekly: (input: { clientId: string; date: string; time: string; until: string }) => Promise<{ created: number; skipped: string[] } | null>;
  setAppointmentStatus: (id: string, status: Appointment['status']) => Promise<void>;
  /** Cancela una cita y todas las siguientes de su serie que sigan programadas. */
  cancelSeriesFrom: (id: string) => Promise<number>;

  saveSession: (s: NewSession, existingId?: string) => Promise<void>;
  addObservation: (clientId: string, text: string) => Promise<void>;
  deleteObservation: (id: string) => Promise<void>;
}

/** Límite de operaciones de un writeBatch de Firestore. */
export const MAX_BATCH_OPS = 500;

let unsubs: Unsubscribe[] = [];

/** Eliminar datos clínicos es de la terapeuta dueña (la UI lo oculta al resto; las reglas de Firestore lo rechazan igual). */
function requireTherapist() {
  if (useProfile.getState().role !== 'therapist') throw new Error('Solo la terapeuta puede eliminar datos clínicos.');
}

function sub<T extends { id: string }>(
  name: string,
  ownerId: string,
  onData: (rows: T[]) => void,
  onFirst: () => void,
) {
  let first = true;
  metrics.attempt('sync', `sub:${name}`);
  return onSnapshot(
    query(collection(db, name), where('ownerId', '==', ownerId)),
    (snap) => {
      onData(snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T));
      if (first) {
        first = false;
        onFirst();
      }
    },
    () => {
      metrics.fail('sync', `sub:${name}`);
      toast.error('Error de sincronización. Se reintentará automáticamente.');
    },
  );
}

export const useData = create<DataState>((set, get) => ({
  ownerId: null,
  loading: true,
  clients: [],
  appointments: [],
  sessions: [],
  observations: [],

  start: (ownerId) => {
    get().stop();
    set({ ownerId, loading: true });
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) set({ loading: false });
    };
    unsubs = [
      sub<Client>('clients', ownerId, (clients) => set({ clients }), done),
      sub<Appointment>('appointments', ownerId, (appointments) => set({ appointments }), done),
      sub<SessionRecord>('sessions', ownerId, (sessions) => set({ sessions }), done),
      sub<ObservationNote>('observations', ownerId, (observations) => set({ observations }), done),
    ];
  },

  stop: () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    set({ ownerId: null, clients: [], appointments: [], sessions: [], observations: [], loading: true });
  },

  addClient: async (c) => {
    const ownerId = get().ownerId!;
    const now = Date.now();
    const ref = await tracked('save', 'addClient', () =>
      addDoc(collection(db, 'clients'), { ...c, ownerId, createdAt: now, updatedAt: now }),
    );
    return ref.id;
  },

  updateClient: async (id, c) => {
    await tracked('save', 'updateClient', () => updateDoc(doc(db, 'clients', id), { ...c, updatedAt: Date.now() }));
  },

  deleteClient: async (id) => {
    requireTherapist();
    const { appointments, sessions, observations } = get();
    // Cascada: TODAS las citas del paciente (también las de reservas semanales, seriesId), sus sesiones y observaciones.
    const refs = [
      ...appointments.filter((a) => a.clientId === id).map((a) => doc(db, 'appointments', a.id)),
      ...sessions.filter((s) => s.clientId === id).map((s) => doc(db, 'sessions', s.id)),
      ...observations.filter((o) => o.clientId === id).map((o) => doc(db, 'observations', o.id)),
      doc(db, 'clients', id), // el paciente va al final: si un lote falla, sigue visible y se puede reintentar
    ];
    await tracked('save', 'deleteClient', async () => {
      // Un solo writeBatch (atómico). Firestore admite 500 operaciones por lote: solo si se superan se divide en varios.
      for (let i = 0; i < refs.length; i += MAX_BATCH_OPS) {
        const batch = writeBatch(db);
        refs.slice(i, i + MAX_BATCH_OPS).forEach((r) => batch.delete(r));
        await batch.commit();
      }
    });
  },

  bookAppointment: async (input) => {
    const { appointments, clients, ownerId } = get();
    const err = validateBooking(appointments, input);
    if (err) {
      toast.error(BOOKING_MESSAGES[err]);
      return false;
    }
    const client = clients.find((c) => c.id === input.clientId);
    await tracked('save', 'bookAppointment', () =>
      addDoc(collection(db, 'appointments'), {
        ...input,
        ownerId,
        clientName: client?.fullName ?? '',
        status: 'programada',
        createdAt: Date.now(),
      }),
    );
    return true;
  },

  bookWeekly: async ({ clientId, date, time, until }) => {
    const { appointments, clients, ownerId } = get();
    const err = validateBooking(appointments, { clientId, date, time });
    const dates = weeklyDates(date, until);
    if (!clientId || !time || dates.length === 0) {
      toast.error('Completa paciente y una fecha final igual o posterior a la inicial.');
      return null;
    }
    if (err === 'fecha_pasada') {
      toast.error(BOOKING_MESSAGES[err]);
      return null;
    }
    const free = dates.filter((d) => !hasConflict(appointments, d, time));
    const skipped = dates.filter((d) => !free.includes(d));
    if (free.length === 0) {
      toast.error('Todos esos horarios ya están ocupados.');
      return null;
    }
    const client = clients.find((c) => c.id === clientId);
    const seriesId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    await tracked('save', 'bookWeekly', () =>
      Promise.all(
        free.map((d) =>
          addDoc(collection(db, 'appointments'), {
            clientId,
            date: d,
            time,
            ownerId,
            clientName: client?.fullName ?? '',
            status: 'programada',
            seriesId,
            createdAt: Date.now(),
          }),
        ),
      ),
    );
    return { created: free.length, skipped };
  },

  cancelSeriesFrom: async (id) => {
    const { appointments } = get();
    const base = appointments.find((a) => a.id === id);
    if (!base) return 0;
    const targets = base.seriesId
      ? appointments.filter((a) => a.seriesId === base.seriesId && a.date >= base.date && a.status === 'programada')
      : [base];
    await tracked('save', 'cancelSeries', () =>
      Promise.all(targets.map((a) => updateDoc(doc(db, 'appointments', a.id), { status: 'cancelada' }))),
    );
    return targets.length;
  },

  setAppointmentStatus: async (id, status) => {
    await tracked('save', 'setAppointmentStatus', () => updateDoc(doc(db, 'appointments', id), { status }));
  },

  saveSession: async (s, existingId) => {
    const now = Date.now();
    if (existingId) {
      await tracked('save', 'saveSession', () => updateDoc(doc(db, 'sessions', existingId), { ...s, updatedAt: now }));
    } else {
      await tracked('save', 'saveSession', () =>
        addDoc(collection(db, 'sessions'), { ...s, ownerId: get().ownerId, createdAt: now, updatedAt: now }),
      );
    }
    await get().setAppointmentStatus(s.appointmentId, 'realizada');
  },

  addObservation: async (clientId, text) => {
    await tracked('save', 'addObservation', () =>
      addDoc(collection(db, 'observations'), {
        clientId,
        text,
        ownerId: get().ownerId,
        createdAt: Date.now(),
      }),
    );
  },

  deleteObservation: async (id) => {
    requireTherapist();
    await tracked('save', 'deleteObservation', () => deleteDoc(doc(db, 'observations', id)));
  },
}));
