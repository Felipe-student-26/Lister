import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Repeat, XCircle } from 'lucide-react';
import type { Appointment } from '../lib/types';
import { capitalize, longDate, monthGrid, MONTHS_ES, shiftMonth, WEEKDAYS_ES } from '../lib/calendar';
import { todayISO } from '../lib/validation';
import { Modal } from './ui';

const SCRIPT_FONT = { fontFamily: '"Dancing Script", cursive' } as const;
/** Cuántas citas se escriben dentro de cada celda (el resto se resume en "+N más"). */
const MAX_IN_CELL = 2;
/** Milisegundos de pulsación para mostrar "Cancelar cita" en pantallas táctiles. */
const LONG_PRESS_MS = 500;

/**
 * Fila de una cita en el modal del día. El botón "Cancelar cita" va a la derecha y solo se ve:
 *  - PC: mientras el mouse está encima de la fila (o con el foco del teclado);
 *  - celular: tras mantener presionada la fila (se oculta al tocar fuera de ella).
 */
function DayAppointmentRow({ appt, onCancel }: { appt: Appointment; onCancel?: (id: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const canCancel = !!onCancel && appt.status === 'programada';

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stopTimer, []);

  // Con el botón a la vista (celular), tocar fuera de la fila lo vuelve a ocultar.
  useEffect(() => {
    if (!revealed) return;
    const onDown = (e: Event) => {
      if (!rowRef.current?.contains(e.target as Node)) setRevealed(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [revealed]);

  return (
    <li
      ref={rowRef}
      className={`group relative flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-2.5 ${canCancel ? '[@media(hover:none)]:select-none' : ''}`}
      // Pulsación larga: solo con dedo/lápiz (el mouse usa el hover)
      onPointerDown={canCancel ? (e) => {
        if (e.pointerType === 'mouse') return;
        stopTimer();
        timer.current = setTimeout(() => setRevealed(true), LONG_PRESS_MS);
      } : undefined}
      onPointerUp={canCancel ? stopTimer : undefined}
      onPointerCancel={canCancel ? stopTimer : undefined}
      onPointerMove={canCancel ? (e) => { if (e.pointerType !== 'mouse' && (e.movementX || e.movementY)) stopTimer(); } : undefined}
      // Evita el menú contextual del sistema al mantener presionado
      onContextMenu={canCancel ? (e) => e.preventDefault() : undefined}
    >
      <span className="w-14 shrink-0 text-sm font-extrabold text-brand-700">{appt.time}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-brand-800">{appt.clientName}</span>
      {appt.seriesId && <Repeat size={14} className="shrink-0 text-brand-500" aria-label="Reserva semanal" />}
      <span className="text-xs capitalize text-brand-500">{appt.status}</span>
      {canCancel && (
        <button
          type="button"
          onClick={() => {
            setRevealed(false);
            onCancel!(appt.id);
          }}
          className={`absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-clay-600 shadow-soft transition hover:bg-clay-50 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 ${
            revealed ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <XCircle size={14} /> Cancelar cita
        </button>
      )}
    </li>
  );
}

/**
 * Calendario mensual de la Agenda: cada día muestra sus citas (no canceladas); al tocarlo se abre un modal con las
 * horas y el nombre del paciente. Usa solo colores del tema (brand-*), así respeta el Panel de control.
 */
export default function CalendarView({
  appointments,
  onGoToDay,
  onCancelAppointment,
  cancelPending = false,
}: {
  appointments: Appointment[];
  onGoToDay: (iso: string) => void;
  /** Pide cancelar una cita (la confirmación y la escritura las hace quien usa el calendario). Sin esto no hay botón. */
  onCancelAppointment?: (id: string) => void;
  /** true mientras hay una confirmación de cancelación abierta encima: Esc/clic fuera solo cierran esa. */
  cancelPending?: boolean;
}) {
  const today = todayISO();
  const now = new Date();
  const [{ year, month }, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Una sola agrupación por fecha (se recalcula solo cuando cambian las citas).
  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (a.status === 'cancelada') continue;
      const list = map.get(a.date);
      if (list) list.push(a);
      else map.set(a.date, [a]);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [appointments]);

  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  const thisYear = now.getFullYear();
  const years = useMemo(() => {
    const from = Math.min(thisYear - 5, year);
    const to = Math.max(thisYear + 5, year);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [thisYear, year]);

  const go = (delta: number) => setView((v) => shiftMonth(v.year, v.month, delta));
  const goToday = () => setView({ year: now.getFullYear(), month: now.getMonth() });
  const showingToday = year === now.getFullYear() && month === now.getMonth();

  const dayAppts = openDay ? (byDate.get(openDay) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-between">
        <div className="flex items-center gap-2">
          <button className="btn-soft !p-2" onClick={() => go(-1)} aria-label="Mes anterior">
            <ChevronLeft size={18} />
          </button>
          <select
            className="input !w-auto"
            aria-label="Mes"
            value={month}
            onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
          >
            {MONTHS_ES.map((m, i) => (
              <option key={m} value={i}>
                {capitalize(m)}
              </option>
            ))}
          </select>
          <select
            className="input !w-auto"
            aria-label="Año"
            value={year}
            onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn-soft !p-2" onClick={() => go(1)} aria-label="Mes siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
        {!showingToday && (
          <button className="btn-soft" onClick={goToday}>
            Hoy
          </button>
        )}
      </div>

      <section
        aria-label={`Calendario de ${MONTHS_ES[month]} de ${year}`}
        className="relative overflow-hidden rounded-xl3 bg-brand-50 p-3 sm:p-6"
      >
        {/* Mancha de acuarela decorativa (abajo a la derecha), con el color del tema */}
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 z-10 h-56 w-56 rounded-full bg-brand-300/30 blur-2xl mix-blend-multiply sm:h-72 sm:w-72" />
        <div aria-hidden className="pointer-events-none absolute -bottom-6 right-24 z-10 h-28 w-40 rounded-full bg-brand-400/20 blur-2xl mix-blend-multiply" />

        <h2 className="mb-4 text-center text-4xl text-brand-900 sm:mb-6 sm:text-5xl" style={SCRIPT_FONT}>
          {capitalize(MONTHS_ES[month])} de {year}
        </h2>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAYS_ES.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] font-semibold tracking-widest text-brand-500 sm:text-xs">
              {w}
            </div>
          ))}
          {grid.map(({ iso, day, inMonth }) => {
            const list = byDate.get(iso) ?? [];
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setOpenDay(iso)}
                aria-label={`${longDate(iso)}${list.length ? `, ${list.length} ${list.length === 1 ? 'cita' : 'citas'}` : ''}`}
                className={`relative flex aspect-square min-h-0 flex-col items-start rounded-xl bg-white p-1 text-left transition hover:shadow-soft sm:aspect-auto sm:min-h-[5.5rem] sm:p-2 ${
                  inMonth ? '' : 'opacity-40'
                } ${isToday ? 'ring-2 ring-brand-500' : ''}`}
              >
                <span
                  className={`text-[11px] font-semibold sm:text-xs ${
                    isToday ? 'rounded-full bg-brand-600 px-1.5 py-0.5 text-white' : 'text-brand-700'
                  }`}
                >
                  {day}
                </span>

                {/* Celular: solo un punto con el número de citas */}
                {list.length > 0 && (
                  <span className="mt-auto self-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white sm:hidden">
                    {list.length}
                  </span>
                )}

                {/* PC/tablet: hora y paciente de las primeras citas */}
                <ul className="mt-1 hidden w-full min-w-0 space-y-0.5 sm:block">
                  {list.slice(0, MAX_IN_CELL).map((a) => (
                    <li key={a.id} className="truncate rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800">
                      {a.time} {a.clientName}
                    </li>
                  ))}
                  {list.length > MAX_IN_CELL && (
                    <li className="px-1 text-[11px] font-semibold text-brand-500">+{list.length - MAX_IN_CELL} más</li>
                  )}
                </ul>
              </button>
            );
          })}
        </div>
      </section>

      <Modal open={openDay !== null} title={openDay ? capitalize(longDate(openDay)) : ''} onClose={() => !cancelPending && setOpenDay(null)}>
        {dayAppts.length === 0 ? (
          <p className="mb-5 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-600">
            <CalendarDays size={16} /> No hay citas este día.
          </p>
        ) : (
          <ul className="mb-5 space-y-2">
            {dayAppts.map((a) => (
              <DayAppointmentRow key={a.id} appt={a} onCancel={onCancelAppointment} />
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-soft" onClick={() => setOpenDay(null)}>
            Cerrar
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              const d = openDay!;
              setOpenDay(null);
              onGoToDay(d);
            }}
          >
            Ver este día
          </button>
        </div>
      </Modal>
    </div>
  );
}
