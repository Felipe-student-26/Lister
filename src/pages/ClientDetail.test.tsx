// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import { fs } from '../test/firestoreMock';
import ClientDetail from './ClientDetail';
import { useData } from '../store/data';
import { useProfile, type Role } from '../store/profile';
import { useToast } from '../store/toast';

function setup(role: Role, withClient = true) {
  useProfile.setState({ role, ownerId: 'u1', ready: true });
  useData.setState({
    ownerId: 'u1',
    loading: false,
    clients: withClient
      ? [{ id: 'c1', fullName: 'Ana Pérez', phone: '300', email: 'ana@correo.com', birthDate: '1990-01-01', generalInfo: 'Info' } as never]
      : [],
    appointments: [],
    sessions: [],
    observations: [{ id: 'o1', clientId: 'c1', text: 'Se la vio tranquila', ownerId: 'u1', createdAt: 1 } as never],
  });
  return render(
    <MemoryRouter initialEntries={['/clientes/c1']}>
      <Routes>
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="clientes" element={<p>Lista de pacientes</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
});

describe('ClientDetail: editar y eliminar (terapeuta)', () => {
  it('Editar y Eliminar paciente están en el encabezado, en cualquier pestaña', async () => {
    const user = userEvent.setup();
    setup('therapist');
    expect(screen.getByRole('button', { name: /Eliminar paciente/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Editar/ })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Datos' }));
    expect(screen.getAllByRole('button', { name: /Eliminar paciente/ })).toHaveLength(1);
  });

  it('editar: precarga los datos, valida y guarda', async () => {
    const user = userEvent.setup();
    setup('therapist');
    await user.click(screen.getByRole('button', { name: /Editar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Editar paciente' });
    expect((within(dialog).getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Ana Pérez');
    expect((within(dialog).getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@correo.com');
    await user.clear(within(dialog).getByLabelText('Correo'));
    await user.type(within(dialog).getByLabelText('Correo'), 'mal');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Correo no válido')).toBeTruthy();
    expect(fs.updateDoc).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByLabelText('Correo'));
    await user.type(within(dialog).getByLabelText('Correo'), 'nuevo@correo.com');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'clients', id: 'c1' }, expect.objectContaining({ email: 'nuevo@correo.com', fullName: 'Ana Pérez' }));
    expect(useToast.getState().toasts.some((t) => t.message === 'Paciente actualizado')).toBe(true);
  });

  it('editar con error de guardado: avisa y deja el modal abierto', async () => {
    const user = userEvent.setup();
    setup('therapist');
    fs.updateDoc.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: /Editar/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Editar paciente' })).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar paciente' })).toBeTruthy();
    expect(useToast.getState().toasts.map((t) => t.message)).toContain('No se pudieron guardar los cambios. Inténtalo de nuevo.');
  });

  it('eliminar: confirma qué se borra, borra en cascada en un lote y vuelve a la lista', async () => {
    const user = userEvent.setup();
    setup('therapist');
    useData.setState({
      appointments: [{ id: 'a1', clientId: 'c1', date: '2999-01-01', time: '09:00', status: 'programada', seriesId: 's1' }, { id: 'a2', clientId: 'c1', date: '2999-01-08', time: '09:00', status: 'programada', seriesId: 's1' }] as never,
      sessions: [{ id: 'x1', clientId: 'c1' }] as never,
    });
    await user.click(screen.getByRole('button', { name: /Eliminar paciente/ }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar paciente' });
    expect(dialog.textContent).toContain('2 citas, 1 consulta, 1 observación');
    expect(dialog.textContent).toContain('2 citas futuras programadas');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    expect(fs.batchDelete.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['a1', 'a2', 'x1', 'o1', 'c1']);
    expect(await screen.findByText('Lista de pacientes')).toBeTruthy();
  });

  it('eliminar con error: avisa, no navega y el paciente sigue ahí', async () => {
    const user = userEvent.setup();
    setup('therapist');
    fs.batchCommit.mockRejectedValueOnce(new Error('permission-denied'));
    await user.click(screen.getByRole('button', { name: /Eliminar paciente/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar paciente' })).getByRole('button', { name: 'Eliminar' }));
    expect(useToast.getState().toasts.map((t) => t.message)).toContain('No se pudo eliminar al paciente. Inténtalo de nuevo.');
    expect(screen.queryByText('Lista de pacientes')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
  });

  it('la terapeuta puede eliminar observaciones', async () => {
    const user = userEvent.setup();
    setup('therapist');
    await user.click(screen.getByRole('tab', { name: 'Observaciones' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar observación' }));
    expect(fs.deleteDoc).toHaveBeenCalledWith({ name: 'observations', id: 'o1' });
  });

  it('un paciente inexistente muestra el estado "no encontrado"', () => {
    setup('therapist', false);
    expect(screen.getByText('Paciente no encontrado')).toBeTruthy();
  });
});

describe('ClientDetail: imprimir el historial en PDF', () => {
  const session = (over: Record<string, unknown> = {}) => ({
    id: 's1', clientId: 'c1', ownerId: 'u1', appointmentId: 'a1', date: '2026-11-12', createdAt: 1, updatedAt: 1,
    sessionNotes: 'Se trabajó la respiración.', proposedGoals: 'Registrar pensamientos', agreedTargets: 'Una salida social', progressOnPrevious: '', stateVsPrevious: 'mejor', stateComment: '',
    ...over,
  });
  let printSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    printSpy = vi.fn();
    window.print = printSpy as unknown as typeof window.print;
    document.title = 'Lister';
  });

  it('el botón "Imprimir PDF" está en el Historial y solo si hay consultas', async () => {
    setup('therapist');
    expect(screen.queryByRole('button', { name: /Imprimir PDF/ })).toBeNull(); // sin consultas no hay nada que imprimir
    act(() => useData.setState({ sessions: [session()] as never }));
    expect(await screen.findByRole('button', { name: /Imprimir PDF/ })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Datos' }));
    expect(screen.queryByRole('button', { name: /Imprimir PDF/ })).toBeNull();
  });

  it('al pulsarlo monta el documento (nombre y consultas del paciente), abre la impresión y pone el nombre del archivo', async () => {
    const user = userEvent.setup();
    setup('therapist');
    act(() => useData.setState({ sessions: [session(), session({ id: 's2', clientId: 'otro', sessionNotes: 'DE OTRO PACIENTE' })] as never }));
    expect(screen.queryByTestId('print-sheet')).toBeNull();
    await user.click(await screen.findByRole('button', { name: /Imprimir PDF/ }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    const sheet = screen.getByTestId('print-sheet');
    expect(sheet.parentElement).toBe(document.body); // en <body>, fuera de #root: así el resto de la app se oculta al imprimir
    expect(within(sheet).getByRole('heading', { name: 'Historial del paciente' })).toBeTruthy();
    expect(within(sheet).getByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
    expect(sheet.textContent).toContain('Se trabajó la respiración.');
    expect(sheet.textContent).not.toContain('DE OTRO PACIENTE');
    expect(document.title).toBe('Historial - Ana Pérez');
  });

  it('al terminar la impresión (afterprint) quita el documento y restaura el título', async () => {
    const user = userEvent.setup();
    setup('therapist');
    act(() => useData.setState({ sessions: [session()] as never }));
    await user.click(await screen.findByRole('button', { name: /Imprimir PDF/ }));
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(screen.getByTestId('print-sheet')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(screen.queryByTestId('print-sheet')).toBeNull();
    expect(document.title).toBe('Lister');
    expect((screen.getByRole('button', { name: /Imprimir PDF/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
