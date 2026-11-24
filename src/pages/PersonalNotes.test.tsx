// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import { fs } from '../test/firestoreMock';
import PersonalNotes from './PersonalNotes';
import { useNotes } from '../store/notes';
import { useToast } from '../store/toast';
import type { BookPage, PersonalNote } from '../lib/types';

const note = (over: Partial<PersonalNote>): PersonalNote => ({ id: 'n1', ownerId: 'u1', text: 'Llamar a la clínica', color: 'amarillo', createdAt: 1, updatedAt: 1, ...over });
const page = (over: Partial<BookPage>): BookPage => ({ id: 'p1', ownerId: 'u1', title: 'Ideas', body: 'Texto', order: 1, createdAt: 1, updatedAt: 1, ...over });

function setup(over: Partial<{ notes: PersonalNote[]; pages: BookPage[] }> = {}) {
  useNotes.setState({ ownerId: 'u1', loading: false, notes: [], pages: [], ...over });
  return render(<PersonalNotes />);
}
const toggle = () => screen.getByRole('switch', { name: 'Mostrar el libro' });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('lister.notesMode');
  useToast.setState({ toasts: [] });
});

describe('Notas personales · mural', () => {
  it('empieza en el mural y, sin notas, muestra el estado vacío', () => {
    setup();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Tu mural está vacío')).toBeTruthy();
  });

  it('"Pegar nota" guarda texto y color elegido, y limpia el campo; vacío no se puede pegar', async () => {
    const user = userEvent.setup();
    setup();
    const paste = screen.getByRole('button', { name: /Pegar nota/ }) as HTMLButtonElement;
    expect(paste.disabled).toBe(true);
    await user.type(screen.getByLabelText('Nueva nota'), '  Revisar agenda  ');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Color de la nueva nota' })).getByRole('radio', { name: 'azul' }));
    await user.click(paste);
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'notes' }, expect.objectContaining({ ownerId: 'u1', text: 'Revisar agenda', color: 'azul' }));
    expect((screen.getByLabelText('Nueva nota') as HTMLTextAreaElement).value).toBe('');
  });

  it('edita una nota en el sitio (al salir del campo) y no guarda si no cambió', async () => {
    const user = userEvent.setup();
    setup({ notes: [note({})] });
    const area = screen.getByLabelText('Texto de la nota');
    await user.click(area);
    await user.tab();
    expect(fs.updateDoc).not.toHaveBeenCalled();
    await user.clear(area);
    await user.type(area, 'Nuevo texto');
    await user.tab();
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'notes', id: 'n1' }, expect.objectContaining({ text: 'Nuevo texto' }));
  });

  it('una nota no puede quedar vacía: se restaura el texto guardado', async () => {
    const user = userEvent.setup();
    setup({ notes: [note({})] });
    const area = screen.getByLabelText('Texto de la nota') as HTMLTextAreaElement;
    await user.clear(area);
    await user.tab();
    expect(fs.updateDoc).not.toHaveBeenCalled();
    expect(area.value).toBe('Llamar a la clínica');
  });

  it('cambia el color y elimina con confirmación', async () => {
    const user = userEvent.setup();
    setup({ notes: [note({})] });
    await user.click(within(screen.getByRole('radiogroup', { name: 'Color de la nota' })).getByRole('radio', { name: 'verde' }));
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'notes', id: 'n1' }, expect.objectContaining({ color: 'verde' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar nota' }));
    expect(fs.deleteDoc).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(fs.deleteDoc).toHaveBeenCalledWith({ name: 'notes', id: 'n1' });
  });
});

describe('Notas personales · libro', () => {
  it('el interruptor abre el libro por la portada y recuerda el modo', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({})] });
    await user.click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Portada del libro')).toBeTruthy();
    expect(screen.getByText('Mis notas')).toBeTruthy();
    expect(localStorage.getItem('lister.notesMode')).toBe('book');
  });

  it('sin páginas, "Escribir la primera página" crea la página 1', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Escribir la primera página' }));
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'bookPages' }, expect.objectContaining({ order: 1, title: '', body: '' }));
  });

  it('"Abrir libro" muestra la primera hoja con título arriba y texto abajo', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({}), page({ id: 'p2', title: 'Segunda', body: 'Otra', order: 2 })] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    expect((screen.getByLabelText('Título de la página') as HTMLInputElement).value).toBe('Ideas');
    expect((screen.getByLabelText('Contenido de la página') as HTMLTextAreaElement).value).toBe('Texto');
  });

  it('el select (abajo a la derecha) lista portada y "número · título" y navega', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({}), page({ id: 'p2', title: 'Segunda', order: 2 }), page({ id: 'p3', title: '  ', order: 3 })] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    const select = screen.getByLabelText('Ir a la página') as HTMLSelectElement;
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Portada', '1 · Ideas', '2 · Segunda', '3 · Sin título']);
    await user.selectOptions(select, 'p2');
    expect((screen.getByLabelText('Título de la página') as HTMLInputElement).value).toBe('Segunda');
    await user.selectOptions(select, 'cover');
    expect(screen.getByLabelText('Portada del libro')).toBeTruthy();
  });

  it('anterior/siguiente recorren las hojas; la anterior de la primera es la portada', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({}), page({ id: 'p2', title: 'Segunda', order: 2 })] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect((screen.getByLabelText('Título de la página') as HTMLInputElement).value).toBe('Segunda');
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByLabelText('Portada del libro')).toBeTruthy();
  });

  it('se guarda sola tras escribir (y no antes)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup({ pages: [page({})] });
      await user.click(toggle());
      await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
      await user.type(screen.getByLabelText('Contenido de la página'), ' más');
      expect(fs.updateDoc).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(fs.updateDoc).toHaveBeenCalledTimes(1);
      expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'bookPages', id: 'p1' }, expect.objectContaining({ title: 'Ideas', body: 'Texto más' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('al cambiar de página guarda lo pendiente de la anterior', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({}), page({ id: 'p2', title: 'Segunda', order: 2 })] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    await user.type(screen.getByLabelText('Título de la página'), '!');
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'bookPages', id: 'p1' }, expect.objectContaining({ title: 'Ideas!' }));
  });

  it('nueva página: se crea al final del libro', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({})] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    await user.click(screen.getByRole('button', { name: /Nueva página/ }));
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'bookPages' }, expect.objectContaining({ order: 2 }));
  });

  it('eliminar pide confirmación y "Cancelar" no borra nada', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({})] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar página' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(fs.deleteDoc).not.toHaveBeenCalled();
  });

  it('eliminar una página la borra tras confirmar', async () => {
    const user = userEvent.setup();
    setup({ pages: [page({}), page({ id: 'p2', title: 'Segunda', order: 2 })] });
    await user.click(toggle());
    await user.click(screen.getByRole('button', { name: 'Abrir libro' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar página' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(fs.deleteDoc).toHaveBeenCalledWith({ name: 'bookPages', id: 'p1' });
  });
});
