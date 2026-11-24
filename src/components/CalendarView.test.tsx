// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarView from './CalendarView';
import { MONTHS_ES, capitalize } from '../lib/calendar';
import type { Appointment } from '../lib/types';

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth();
const iso = (day: number) => `${Y}-${String(M + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const appt = (over: Partial<Appointment>): Appointment => ({
  id: 'a1',
  ownerId: 'u1',
  clientId: 'c1',
  clientName: 'Ana Pérez',
  date: iso(15),
  time: '09:00',
  status: 'programada',
  createdAt: 1,
  ...over,
});
const title = () => screen.getByRole('heading', { level: 2 }).textContent;
/** Celda de un día del mes mostrado (el botón cuyo nombre accesible empieza por la fecha larga). */
const cell = (day: number) => screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.includes(` ${day} de ${MONTHS_ES[M]} de ${Y}`))!;

describe('CalendarView', () => {
  it('muestra el mes actual con título "Mes de año" y la cabecera DOM…SÁB', () => {
    render(<CalendarView appointments={[]} onGoToDay={() => undefined} />);
    expect(title()).toBe(`${capitalize(MONTHS_ES[M])} de ${Y}`);
    for (const w of ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']) expect(screen.getByText(w)).toBeTruthy();
  });

  it('pone las citas en su día, ordenadas, y omite las canceladas', () => {
    render(
      <CalendarView
        appointments={[
          appt({ id: 'a2', time: '11:00', clientName: 'Luz Mora' }),
          appt({ id: 'a1' }),
          appt({ id: 'a3', time: '10:00', clientName: 'Cancelada', status: 'cancelada' }),
          appt({ id: 'a4', date: iso(16), clientName: 'Otro Día' }),
        ]}
        onGoToDay={() => undefined}
      />,
    );
    const c = cell(15);
    expect(c.getAttribute('aria-label')).toContain('2 citas');
    const items = within(c).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['09:00 Ana Pérez', '11:00 Luz Mora']);
    expect(c.textContent).not.toContain('Cancelada');
    expect(cell(16).getAttribute('aria-label')).toContain('1 cita');
    expect(within(cell(16)).getByText('09:00 Otro Día')).toBeTruthy();
  });

  it('con más de 2 citas resume el resto en "+N más"', () => {
    render(
      <CalendarView
        appointments={[appt({ id: 'a1' }), appt({ id: 'a2', time: '10:00' }), appt({ id: 'a3', time: '11:00' }), appt({ id: 'a4', time: '12:00' })]}
        onGoToDay={() => undefined}
      />,
    );
    expect(within(cell(15)).getByText('+2 más')).toBeTruthy();
  });

  it('flechas, selector de mes y de año cambian el título', async () => {
    const user = userEvent.setup();
    render(<CalendarView appointments={[]} onGoToDay={() => undefined} />);
    await user.selectOptions(screen.getByLabelText('Mes'), '0');
    expect(title()).toBe(`Enero de ${Y}`);
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(title()).toBe(`Diciembre de ${Y - 1}`); // cruza de año
    await user.selectOptions(screen.getByLabelText('Año'), String(Y + 2));
    expect(title()).toBe(`Diciembre de ${Y + 2}`);
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(title()).toBe(`Enero de ${Y + 3}`);
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(title()).toBe(`${capitalize(MONTHS_ES[M])} de ${Y}`);
    expect(screen.queryByRole('button', { name: 'Hoy' })).toBeNull();
  });

  it('el rango de años va de −5 a +5 respecto al actual', () => {
    render(<CalendarView appointments={[]} onGoToDay={() => undefined} />);
    const years = within(screen.getByLabelText('Año')).getAllByRole('option').map((o) => o.textContent);
    expect(years[0]).toBe(String(Y - 5));
    expect(years[years.length - 1]).toBe(String(Y + 5));
  });

  it('al tocar un día abre un modal con la hora y el paciente; "Ver este día" avisa la fecha', async () => {
    const user = userEvent.setup();
    const onGoToDay = vi.fn();
    render(
      <CalendarView appointments={[appt({ id: 'a1' }), appt({ id: 'a2', time: '14:00', clientName: 'Luz Mora', seriesId: 's1' })]} onGoToDay={onGoToDay} />,
    );
    await user.click(cell(15));
    const dialog = screen.getByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toContain('09:00');
    expect(rows[0]).toContain('Ana Pérez');
    expect(rows[1]).toContain('14:00');
    expect(rows[1]).toContain('Luz Mora');
    expect(within(dialog).getByLabelText('Reserva semanal')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Ver este día' }));
    expect(onGoToDay).toHaveBeenCalledWith(iso(15));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('un día sin citas muestra el aviso y se cierra con "Cerrar" o Esc', async () => {
    const user = userEvent.setup();
    render(<CalendarView appointments={[]} onGoToDay={() => undefined} />);
    await user.click(cell(10));
    expect(screen.getByText('No hay citas este día.')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Cerrar' }).find((b) => b.textContent === 'Cerrar')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(cell(10));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('cancelar desde el modal del día', () => {
    const open = async (onCancel = vi.fn(), list = [appt({ id: 'a1' })]) => {
      const user = userEvent.setup();
      render(<CalendarView appointments={list} onGoToDay={() => undefined} onCancelAppointment={onCancel} />);
      await user.click(cell(15));
      return { user, onCancel, dialog: screen.getByRole('dialog') };
    };
    const visible = (b: HTMLElement) => b.className.includes('opacity-100') && !b.className.includes('opacity-0');

    it('PC: el botón está a la derecha de la fila y oculto hasta pasar el mouse (CSS group-hover)', async () => {
      const { dialog } = await open();
      const btn = within(dialog).getByRole('button', { name: 'Cancelar cita' });
      expect(dialog.querySelector('li')!.contains(btn)).toBe(true);
      expect(btn.className).toContain('opacity-0'); // sin mouse encima no se ve
      expect(btn.className).toContain('pointer-events-none');
      expect(btn.className).toContain('group-hover:opacity-100'); // con el mouse encima se muestra
      expect(btn.className).toContain('right-2');
    });

    it('celular: mantener presionada la cita muestra el botón; un toque corto no', async () => {
      const { dialog } = await open(); // se abre con tiempo real (userEvent se cuelga con temporizadores falsos)
      vi.useFakeTimers();
      try {
        const row = dialog.querySelector('li')!;
        const btn = within(dialog).getByRole('button', { name: 'Cancelar cita' });
        fireEvent.pointerDown(row, { pointerType: 'touch' });
        act(() => void vi.advanceTimersByTime(200));
        fireEvent.pointerUp(row, { pointerType: 'touch' }); // toque corto
        act(() => void vi.advanceTimersByTime(1000));
        expect(visible(btn)).toBe(false);

        fireEvent.pointerDown(row, { pointerType: 'touch' }); // pulsación larga
        act(() => void vi.advanceTimersByTime(600));
        expect(visible(btn)).toBe(true);

        fireEvent.pointerDown(document.body); // tocar fuera la oculta
        expect(visible(btn)).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('al pulsar "Cancelar cita" avisa el id de la cita y vuelve a ocultarse', async () => {
      const { user, onCancel, dialog } = await open(vi.fn(), [appt({ id: 'a1' }), appt({ id: 'a2', time: '14:00', clientName: 'Luz Mora' })]);
      const btns = within(dialog).getAllByRole('button', { name: 'Cancelar cita' });
      expect(btns.length).toBe(2);
      await user.click(btns[1]);
      expect(onCancel).toHaveBeenCalledWith('a2');
    });

    it('solo las citas programadas se pueden cancelar, y sin la propiedad no hay botón', async () => {
      const { dialog } = await open(vi.fn(), [appt({ id: 'a1', status: 'realizada' })]);
      expect(within(dialog).queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    });

    it('sin onCancelAppointment el modal no muestra el botón', async () => {
      const user = userEvent.setup();
      render(<CalendarView appointments={[appt({})]} onGoToDay={() => undefined} />);
      await user.click(cell(15));
      expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    });
  });
});
