import { create } from 'zustand';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BookPage, NoteColor, PersonalNote } from '../lib/types';
import { toast } from './toast';
import { metrics, tracked } from './metrics';

interface NotesState {
  ownerId: string | null;
  loading: boolean;
  notes: PersonalNote[];
  pages: BookPage[];

  start: (ownerId: string) => void;
  stop: () => void;

  addNote: (text: string, color: NoteColor) => Promise<string>;
  updateNote: (id: string, patch: Partial<Pick<PersonalNote, 'text' | 'color'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  /** Crea una página al final del libro y devuelve su id. */
  addPage: (title?: string) => Promise<string>;
  updatePage: (id: string, patch: Partial<Pick<BookPage, 'title' | 'body'>>) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
}

let unsubs: Unsubscribe[] = [];

function sub<T extends { id: string }>(name: string, ownerId: string, onData: (rows: T[]) => void, onFirst: () => void) {
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

/** Notas del mural: las más recientes primero. */
const byNewest = (a: PersonalNote, b: PersonalNote) => b.createdAt - a.createdAt;
/** Páginas del libro: por orden de creación (el número de página es la posición en esta lista). */
const byOrder = (a: BookPage, b: BookPage) => a.order - b.order || a.createdAt - b.createdAt;

export const useNotes = create<NotesState>((set, get) => ({
  ownerId: null,
  loading: true,
  notes: [],
  pages: [],

  start: (ownerId) => {
    get().stop();
    set({ ownerId, loading: true });
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) set({ loading: false });
    };
    unsubs = [
      sub<PersonalNote>('notes', ownerId, (rows) => set({ notes: [...rows].sort(byNewest) }), done),
      sub<BookPage>('bookPages', ownerId, (rows) => set({ pages: [...rows].sort(byOrder) }), done),
    ];
  },

  stop: () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    set({ ownerId: null, notes: [], pages: [], loading: true });
  },

  addNote: async (text, color) => {
    const ownerId = get().ownerId!;
    const now = Date.now();
    const ref = await tracked('save', 'addNote', () => addDoc(collection(db, 'notes'), { ownerId, text, color, createdAt: now, updatedAt: now }));
    return ref.id;
  },

  updateNote: async (id, patch) => {
    await tracked('save', 'updateNote', () => updateDoc(doc(db, 'notes', id), { ...patch, updatedAt: Date.now() }));
  },

  deleteNote: async (id) => {
    await tracked('save', 'deleteNote', () => deleteDoc(doc(db, 'notes', id)));
  },

  addPage: async (title = '') => {
    const { ownerId, pages } = get();
    const now = Date.now();
    const order = pages.reduce((max, p) => Math.max(max, p.order), 0) + 1;
    const ref = await tracked('save', 'addPage', () =>
      addDoc(collection(db, 'bookPages'), { ownerId: ownerId!, title, body: '', order, createdAt: now, updatedAt: now }),
    );
    return ref.id;
  },

  updatePage: async (id, patch) => {
    await tracked('save', 'updatePage', () => updateDoc(doc(db, 'bookPages', id), { ...patch, updatedAt: Date.now() }));
  },

  deletePage: async (id) => {
    await tracked('save', 'deletePage', () => deleteDoc(doc(db, 'bookPages', id)));
  },
}));
