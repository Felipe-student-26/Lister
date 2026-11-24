// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import { fs } from '../test/firestoreMock';
import Clients from './Clients';
import { useData } from '../store/data';
import { useProfile } from '../store/profile';
import { useToast } from '../store/toast';

const make = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    fullName: `Paciente ${String(i + 1).padStart(2, '0')}`,
    email: i === 4 ? 'cinco@correo.com' : '',
    phone: '',
  }));

function setup(count: number, extra: Partial<{ appointments: unknown[]; sessions: unknown[]; observations: unknown[] }> = {}) {
  useData.setState({ ownerId: 'u1', loading: false, clients: make(count) as never, appointments: [], sessions: [], observations: [], ...extra } as never);
  return render(
    <MemoryRouter>
      <Clients />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
  useProfile.setState({ role: 'therapist', ownerId: 'u1', ready: true });
});

describe('Clients', () => {
  it('sin pacientes muestra el estado vacío con acción', () => {
    setup(0);
    expect(screen.getByText('Todavía no hay pacientes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar paciente' })).toBeTruthy();
  });

  it('alta: valida inline nombre y correo; guarda con el ownerId y avisa', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo paciente' });

    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Escribe el nombre completo')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();

    const [name, , email] = within(dialog).getAllByRole('textbox'); // nombre, teléfono, correo, info
    await user.type(name, 'Luz Mora');
    await user.type(email, 'no-es-correo');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Correo no válido')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();

    await user.clear(email);
    await user.type(email, 'luz@correo.com');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(fs.addDoc).toHaveBeenCalledWith(
      { name: 'clients' },
      expect.objectContaining({ fullName: 'Luz Mora', email: 'luz@correo.com', ownerId: 'u1' }),
    );
    expect(useToast.getState().toasts.some((t) => t.message === 'Paciente registrado')).toBe(true);
  });

  it('búsqueda por nombre o correo y mensaje sin resultados', async () => {
    const user = userEvent.setup();
    setup(10);
    const box = screen.getByPlaceholderText('Buscar por nombre o correo');

    await user.type(box, 'Paciente 03');
    expect(screen.getAllByRole('listitem').length).toBe(1);
    expect(screen.getByText('Paciente 03')).toBeTruthy();

    await user.clear(box);
    await user.type(box, 'cinco@');
    expect(screen.getAllByRole('listitem').length).toBe(1);
    expect(screen.getByText('Paciente 05')).toBeTruthy();

    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.getByText(/Sin resultados para/)).toBeTruthy();
  });

  it('paginación de 8 en 8 y cambio de orden', async () => {
    const user = userEvent.setup();
    setup(10);
    expect(screen.getAllByRole('listitem').length).toBe(8);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getAllByRole('listitem').length).toBe(2);
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Paciente 01')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cambiar orden' }));
    expect(within(screen.getAllByRole('listitem')[0]).getByText('Paciente 10')).toBeTruthy();
  });

  it('con 8 pacientes o menos no hay paginador', () => {
    setup(8);
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).toBeNull();
  });
});

describe('Clients: editar y eliminar', () => {
  const appts = [
    { id: 'a1', clientId: 'c2', date: '2000-01-01', time: '10:00', status: 'realizada' },
    { id: 'a2', clientId: 'c2', date: '2999-01-01', time: '10:00', status: 'programada', seriesId: 's1' },
    { id: 'a3', clientId: 'c2', date: '2999-01-08', time: '10:00', status: 'programada', seriesId: 's1' },
    { id: 'a4', clientId: 'c1', date: '2999-01-01', time: '11:00', status: 'programada' },
  ];

  it('cada fila tiene Editar y Eliminar, y el botón de alta se llama "Nuevo paciente"', () => {
    setup(2);
    expect(screen.getByRole('button', { name: 'Nuevo paciente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar a Paciente 01' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar a Paciente 02' })).toBeTruthy();
  });

  it('editar: abre con los datos del paciente, valida y guarda con updateDoc', async () => {
    const user = userEvent.setup();
    setup(2);
    await user.click(screen.getByRole('button', { name: 'Editar a Paciente 02' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar paciente' });
    const name = within(dialog).getByLabelText('Nombre completo') as HTMLInputElement;
    expect(name.value).toBe('Paciente 02');

    await user.clear(name);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Escribe el nombre completo')).toBeTruthy();
    expect(fs.updateDoc).not.toHaveBeenCalled();

    await user.type(name, 'Paciente Dos');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'clients', id: 'c2' }, expect.objectContaining({ fullName: 'Paciente Dos' }));
    expect(useToast.getState().toasts.some((t) => t.message === 'Paciente actualizado')).toBe(true);
    expect(screen.queryByRole('dialog', { name: 'Editar paciente' })).toBeNull();
  });

  it('editar y "Nuevo paciente" no se mezclan: el alta abre vacía aunque antes se editara a alguien', async () => {
    const user = userEvent.setup();
    setup(2);
    await user.click(screen.getByRole('button', { name: 'Editar a Paciente 01' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Editar paciente' })).getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
    expect((within(screen.getByRole('dialog', { name: 'Nuevo paciente' })).getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('');
  });

  it('errores de guardado: avisa, el modal queda abierto con lo escrito y no se muestra éxito', async () => {
    const user = userEvent.setup();
    setup(2);
    fs.addDoc.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Nuevo paciente' }));
    const dialog = screen.getByRole('dialog', { name: 'Nuevo paciente' });
    await user.type(within(dialog).getByLabelText('Nombre completo'), 'Luz Mora');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo paciente' })).toBeTruthy();
    expect((within(dialog).getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Luz Mora');
    const msgs = useToast.getState().toasts.map((t) => t.message);
    expect(msgs).toContain('No se pudo registrar al paciente. Inténtalo de nuevo.');
    expect(msgs).not.toContain('Paciente registrado');

    fs.updateDoc.mockRejectedValueOnce(new Error('offline'));
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Editar a Paciente 01' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Editar paciente' })).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar paciente' })).toBeTruthy();
    expect(useToast.getState().toasts.map((t) => t.message)).toContain('No se pudieron guardar los cambios. Inténtalo de nuevo.');
  });

  it('eliminar: la confirmación dice qué se borra (citas, consultas, observaciones), avisa de citas futuras y de reservas semanales', async () => {
    const user = userEvent.setup();
    setup(2, { appointments: appts, sessions: [{ id: 's1', clientId: 'c2' }], observations: [{ id: 'o1', clientId: 'c2' }, { id: 'o2', clientId: 'c2' }] });
    await user.click(screen.getByRole('button', { name: 'Eliminar a Paciente 02' }));
    const dialog = screen.getByRole('dialog', { name: 'Eliminar paciente' });
    const text = dialog.textContent ?? '';
    expect(text).toContain('Paciente 02');
    expect(text).toContain('3 citas, 1 consulta, 2 observaciones');
    expect(text).toContain('2 citas futuras programadas');
    expect(text).toContain('reservas semanales (2)');
    expect(text).toContain('no se puede deshacer');
  });

  it('eliminar sin citas futuras no muestra el aviso de citas futuras', async () => {
    const user = userEvent.setup();
    setup(2, { appointments: [appts[0]] });
    await user.click(screen.getByRole('button', { name: 'Eliminar a Paciente 02' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar paciente' }).textContent).not.toContain('futura');
  });

  it('cancelar no borra nada; confirmar borra en cascada en un solo lote y avisa', async () => {
    const user = userEvent.setup();
    setup(2, { appointments: appts, sessions: [{ id: 's1', clientId: 'c2' }], observations: [{ id: 'o1', clientId: 'c2' }] });
    await user.click(screen.getByRole('button', { name: 'Eliminar a Paciente 02' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar paciente' })).getByRole('button', { name: 'Cancelar' }));
    expect(fs.batchCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Eliminar a Paciente 02' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar paciente' })).getByRole('button', { name: 'Eliminar' }));
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    const ids = fs.batchDelete.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(ids).toEqual(['a1', 'a2', 'a3', 's1', 'o1', 'c2']); // la cita a4 es de otro paciente
    expect(useToast.getState().toasts.some((t) => t.message === 'Paciente eliminado')).toBe(true);
  });

  it('si el borrado falla: avisa del error y no dice "Paciente eliminado"', async () => {
    const user = userEvent.setup();
    setup(2);
    fs.batchCommit.mockRejectedValueOnce(new Error('permission-denied'));
    await user.click(screen.getByRole('button', { name: 'Eliminar a Paciente 01' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Eliminar paciente' })).getByRole('button', { name: 'Eliminar' }));
    const msgs = useToast.getState().toasts.map((t) => t.message);
    expect(msgs).toContain('No se pudo eliminar al paciente. Inténtalo de nuevo.');
    expect(msgs).not.toContain('Paciente eliminado');
  });
});
