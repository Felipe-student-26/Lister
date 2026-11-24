// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import { fs } from '../test/firestoreMock';
import Agenda from './Agenda';
import { useData } from '../store/data';
import { useProfile } from '../store/profile';
import { useToast } from '../store/toast';
import { todayISO } from '../lib/validation';
import type { Appointment } from '../lib/types';

const today = todayISO();
const appt = (over: Partial<Appointment>): Appointment => ({
  id: 'a1',
  ownerId: 'u1',
  clientId: 'c1',
  clientName: 'Ana Pérez',
  date: today,
  time: '09:00',
  status: 'programada',
  createdAt: 1,
  ...over,
});

function setup(appointments: Appointment[] = []) {
  useData.setState({
    ownerId: 'u1',
    loading: false,
    clients: [{ id: 'c1', fullName: 'Ana Pérez' } as never, { id: 'c2', fullName: 'Luz Mora' } as never],
    appointments,
  });
  return render(
    <MemoryRouter>
      <Agenda />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useToast.setState({ toasts: [] });
  useProfile.setState({ role: 'therapist', ownerId: 'u1', ready: true });
});

describe('Agenda', () => {
  it('sin pacientes muestra el estado vacío con guía', () => {
    useData.setState({ ownerId: 'u1', loading: false, clients: [], appointments: [] });
    render(
      <MemoryRouter>
        <Agenda />
      </MemoryRouter>,
    );
    expect(screen.getByText('Aún no tienes pacientes')).toBeTruthy();
  });

  it('reserva: exige paciente, escribe la cita y avisa con un toast', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole('button', { name: /Reservar/ })[0]);
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Reservar' }));
    expect(screen.getByText('Selecciona un paciente')).toBeTruthy();
    expect(fs.addDoc).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByRole('combobox'), 'c2');
    await user.click(within(dialog).getByRole('button', { name: 'Reservar' }));
    expect(fs.addDoc).toHaveBeenCalledWith(
      { name: 'appointments' },
      expect.objectContaining({ clientId: 'c2', date: today, time: '07:00', status: 'programada', ownerId: 'u1', clientName: 'Luz Mora' }),
    );
    expect(useToast.getState().toasts.some((t) => t.message === 'Cita reservada' && t.kind === 'success')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('los horarios ocupados no ofrecen reservar y muestran al paciente', () => {
    setup([appt({ time: '07:00' })]);
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    // 13 horarios − 1 ocupado
    expect(screen.getAllByRole('button', { name: /Reservar/ }).length).toBe(12);
  });

  it('conflicto: si otro dispositivo ocupa el horario con el modal abierto, avisa y no escribe', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getAllByRole('button', { name: /Reservar/ })[0]); // 07:00
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), 'c1');

    act(() => {
      useData.setState({ appointments: [appt({ id: 'otro', time: '07:00', clientId: 'c2', clientName: 'Luz Mora' })] });
    });
    expect(screen.getByText('Este horario ya está ocupado.')).toBeTruthy();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reservar' }));
    expect(fs.addDoc).not.toHaveBeenCalled();
    expect(useToast.getState().toasts.some((t) => t.message === 'Ya existe una cita en ese horario.')).toBe(true);
  });

  it('una cita cancelada libera el horario', () => {
    setup([appt({ status: 'cancelada', time: '07:00' })]);
    expect(screen.getAllByRole('button', { name: /Reservar/ }).length).toBe(13);
  });

  it('cancelar: pide confirmación y marca la cita como cancelada', async () => {
    const user = userEvent.setup();
    setup([appt({})]);
    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancelar cita' });
    // "Cancelar" (cerrar sin cancelar) no escribe
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(fs.updateDoc).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Cancelar cita' })).getByRole('button', { name: 'Cancelar cita' }));
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'appointments', id: 'a1' }, { status: 'cancelada' });
    expect(useToast.getState().toasts.some((t) => t.message === 'Cita cancelada')).toBe(true);
  });

  it('en una fecha pasada solo se consulta: no hay botones de reservar', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(screen.getByText(/Fecha pasada: solo consulta/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull();
  });
});

describe('Agenda · reservas semanales', () => {
  it('repite cada semana hasta la fecha final y omite horarios ocupados', async () => {
    const user = userEvent.setup();
    const next = (n: number) => {
      const [y, m, d] = today.split('-').map(Number);
      return todayISO(new Date(y, m - 1, d + n));
    };
    setup([appt({ id: 'x', date: next(7), time: '07:00', clientId: 'c2', clientName: 'Luz Mora' })]);
    await user.click(screen.getAllByRole('button', { name: /Reservar/ })[0]); // 07:00 hoy
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), 'c1');
    await user.click(within(dialog).getByRole('checkbox'));
    const untilInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(untilInput, next(21));
    await user.click(within(dialog).getByRole('button', { name: 'Reservar' }));
    // hoy, +7 (ocupado), +14, +21 → 3 creadas
    expect(fs.addDoc).toHaveBeenCalledTimes(3);
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'appointments' }, expect.objectContaining({ date: next(14), seriesId: expect.any(String) }));
  });

  it('cancelar una cita de serie ofrece "esta y las siguientes"', async () => {
    const user = userEvent.setup();
    const [y, m, d] = today.split('-').map(Number);
    const later = todayISO(new Date(y, m - 1, d + 7));
    setup([appt({ id: 's1', seriesId: 'S' }), appt({ id: 's2', seriesId: 'S', date: later })]);
    await user.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    await user.click(screen.getByRole('button', { name: 'Esta y las siguientes' }));
    expect(fs.updateDoc).toHaveBeenCalledTimes(2);
  });

  describe('modo calendario', () => {
    beforeEach(() => localStorage.removeItem('lister.agendaView'));

    it('el botón alterna a la vista de calendario y de vuelta, y recuerda la última vista', async () => {
      const user = userEvent.setup();
      const { unmount } = setup([appt({})]);
      expect(screen.queryByRole('region', { name: /Calendario de/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Cambiar a vista de calendario' }));
      expect(screen.getByRole('region', { name: /Calendario de/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Día anterior' })).toBeNull(); // la navegación por día es solo de la vista de día
      expect(localStorage.getItem('lister.agendaView')).toBe('month');
      unmount();

      setup([appt({})]); // al volver, abre en calendario
      expect(screen.getByRole('region', { name: /Calendario de/ })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Cambiar a vista de día' }));
      expect(screen.getByRole('button', { name: 'Día anterior' })).toBeTruthy();
      expect(localStorage.getItem('lister.agendaView')).toBe('day');
    });

    const openToday = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Cambiar a vista de calendario' }));
      await user.click(screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.includes('cita'))!);
      return screen.getByRole('dialog', { name: /de 20\d\d$/i });
    };

    it('cancelar desde el modal del día: pide confirmación y marca la cita como cancelada', async () => {
      const user = userEvent.setup();
      setup([appt({})]);
      const day = await openToday(user);
      await user.click(within(day).getByRole('button', { name: 'Cancelar cita' }));
      const confirm = screen.getByRole('dialog', { name: 'Cancelar cita' });
      await user.click(within(confirm).getByRole('button', { name: 'Cancelar' })); // cerrar sin cancelar
      expect(fs.updateDoc).not.toHaveBeenCalled();

      await user.click(within(day).getByRole('button', { name: 'Cancelar cita' }));
      await user.click(within(screen.getByRole('dialog', { name: 'Cancelar cita' })).getByRole('button', { name: 'Cancelar cita' }));
      expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'appointments', id: 'a1' }, { status: 'cancelada' });
      expect(useToast.getState().toasts.some((t) => t.message === 'Cita cancelada')).toBe(true);
    });

    it('en el modal del día, una cita de serie ofrece "Solo esta cita" / "Esta y las siguientes"', async () => {
      const user = userEvent.setup();
      const [y, m, d] = today.split('-').map(Number);
      const later = todayISO(new Date(y, m - 1, d + 7));
      setup([appt({ id: 's1', seriesId: 'S' }), appt({ id: 's2', seriesId: 'S', date: later })]);
      const day = await openToday(user);
      await user.click(within(day).getByRole('button', { name: 'Cancelar cita' }));
      expect(screen.getByRole('button', { name: 'Solo esta cita' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Esta y las siguientes' }));
      expect(fs.updateDoc).toHaveBeenCalledTimes(2);
    });

    it('Esc con la confirmación abierta cierra solo la confirmación, no el modal del día', async () => {
      const user = userEvent.setup();
      setup([appt({})]);
      const day = await openToday(user);
      await user.click(within(day).getByRole('button', { name: 'Cancelar cita' }));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Cancelar cita' })).toBeNull();
      expect(screen.getByRole('dialog', { name: /de 20\d\d$/i })).toBeTruthy();
    });

    it('"Ver este día" lleva a la vista de día de esa fecha', async () => {
      const user = userEvent.setup();
      setup([appt({ clientName: 'Ana Pérez' })]);
      await user.click(screen.getByRole('button', { name: 'Cambiar a vista de calendario' }));
      await user.click(screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.includes('1 cita'))!);
      await user.click(screen.getByRole('button', { name: 'Ver este día' }));
      expect(screen.queryByRole('region', { name: /Calendario de/ })).toBeNull();
      expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe(today);
      expect(screen.getByText('Ana Pérez')).toBeTruthy();
    });
  });
});
