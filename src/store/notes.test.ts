// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import { fs } from '../test/firestoreMock';
import { useNotes } from './notes';
import type { BookPage } from '../lib/types';

const page = (over: Partial<BookPage>): BookPage => ({ id: 'p1', ownerId: 'u1', title: '', body: '', order: 1, createdAt: 1, updatedAt: 1, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  useNotes.setState({ ownerId: 'u1', loading: false, notes: [], pages: [] });
});

describe('store de notas personales', () => {
  it('addNote escribe en `notes` con la propietaria y el color', async () => {
    const id = await useNotes.getState().addNote('Comprar café', 'rosa');
    expect(id).toBe('new-id');
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'notes' }, expect.objectContaining({ ownerId: 'u1', text: 'Comprar café', color: 'rosa' }));
  });

  it('updateNote y deleteNote apuntan al documento correcto', async () => {
    await useNotes.getState().updateNote('n1', { text: 'x' });
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'notes', id: 'n1' }, expect.objectContaining({ text: 'x' }));
    await useNotes.getState().deleteNote('n1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ name: 'notes', id: 'n1' });
  });

  it('addPage numera al final del libro: order = máximo + 1', async () => {
    useNotes.setState({ pages: [page({ id: 'a', order: 1 }), page({ id: 'b', order: 4 })] });
    await useNotes.getState().addPage();
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'bookPages' }, expect.objectContaining({ ownerId: 'u1', title: '', body: '', order: 5 }));
  });

  it('la primera página tiene order 1', async () => {
    await useNotes.getState().addPage('Hola');
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'bookPages' }, expect.objectContaining({ title: 'Hola', order: 1 }));
  });

  it('updatePage / deletePage usan `bookPages`', async () => {
    await useNotes.getState().updatePage('p1', { title: 'T', body: 'B' });
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'bookPages', id: 'p1' }, expect.objectContaining({ title: 'T', body: 'B' }));
    await useNotes.getState().deletePage('p1');
    expect(fs.deleteDoc).toHaveBeenCalledWith({ name: 'bookPages', id: 'p1' });
  });

  it('stop vacía los datos', () => {
    useNotes.setState({ notes: [{ id: 'n' } as never], pages: [page({})] });
    useNotes.getState().stop();
    expect(useNotes.getState()).toMatchObject({ ownerId: null, notes: [], pages: [] });
  });
});
