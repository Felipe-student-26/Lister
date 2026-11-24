import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, FileText, XCircle } from 'lucide-react';
import { useData } from '../store/data';
import { toast } from '../store/toast';
import { metrics } from '../store/metrics';
import { ConfirmModal, EmptyState, Field, Modal, Skeleton } from '../components/ui';
import CalendarView from '../components/CalendarView';
import { SLOT_HOURS } from '../lib/types';
import { hasConflict, isDateBookable, todayISO, weeklyDates, MAX_SERIES } from '../lib/validation';

const VIEW_KEY = 'lister.agendaView'; // 'day' | 'month'
type AgendaView = 'day' | 'month';

function readView(): AgendaView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'day';
  } catch {
    return 'day';
  }
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function Agenda() {
  const { appointments, clients, loading, bookAppointment, bookWeekly, setAppointmentStatus, cancelSeriesFrom } = useData();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [view, setViewState] = useState<AgendaView>(readView);
  const [slot, setSlot] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [toCancel, setToCancel] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState('');
  const cancelAppt = appointments.find((a) => a.id === toCancel);
  const cancelHasSeries =
    !!cancelAppt?.seriesId &&
    appointments.some((a) => a.seriesId === cancelAppt.seriesId && a.id !== cancelAppt.id && a.date > cancelAppt.date && a.status === 'programada');

  const dayAppts = useMemo(
    () =>
      appointments
        .filter((a) => a.date === date && a.status !== 'cancelada')
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, date],
  );

  const bookable = isDateBookable(date);
  const isPast = date < today;

  useEffect(() => {
    metrics.page('agenda', 'ver_dia');
  }, [date]);

  const setView = (v: AgendaView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* sin almacenamiento: la vista solo dura esta sesión */
    }
    if (v === 'month') metrics.page('agenda', 'ver_calendario');
  };

  const openSlot = (time: string) => {
    metrics.page('agenda', 'abrir_reserva');
    setSlot(time);
    setClientId('');
    setError('');
    setRepeat(false);
    setUntil('');
  };

  const confirmBooking = async () => {
    if (!clientId) {
      setError('Selecciona un paciente');
      return;
    }
    if (repeat) {
      if (!until || until < date) {
        setError('Elige una fecha final igual o posterior a la inicial');
        return;
      }
      const res = await bookWeekly({ clientId, date, time: slot!, until });
      if (res) {
        toast.success(
          res.skipped.length
            ? `${res.created} citas reservadas. ${res.skipped.length} ya estaban ocupadas y se omitieron.`
            : `${res.created} citas reservadas`,
        );
        setSlot(null);
      }
      return;
    }
    const ok = await bookAppointment({ clientId, date, time: slot! });
    if (ok) {
      toast.success('Cita reservada');
      setSlot(null);
    }
  };

  return (
    <div className={`mx-auto space-y-5 ${view === 'month' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-800">Agenda</h1>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'day' && (
            <div className="flex items-center gap-2">
              <button
                className="btn-soft !p-2"
                onClick={() => setDate(shiftDate(date, -1))}
                aria-label="Día anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                type="date"
                className="input !w-auto"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-label="Fecha"
              />
              <button className="btn-soft !p-2" onClick={() => setDate(shiftDate(date, 1))} aria-label="Día siguiente">
                <ChevronRight size={18} />
              </button>
              {date !== today && (
                <button className="btn-soft" onClick={() => setDate(today)}>
                  Hoy
                </button>
            )}
          </div>
          )}
          <button
            className={`btn-soft !p-2 ${view === 'month' ? '!bg-brand-600 !text-white' : ''}`}
            onClick={() => setView(view === 'month' ? 'day' : 'month')}
            aria-label={view === 'month' ? 'Cambiar a vista de día' : 'Cambiar a vista de calendario'}
            aria-pressed={view === 'month'}
            title={view === 'month' ? 'Vista de día' : 'Vista de calendario'}
          >
            <Calendar size={18} />
          </button>
        </div>
      </div>

      {view === 'month' ? (
        loading ? (
          <Skeleton className="h-96" />
        ) : (
          <CalendarView
            appointments={appointments}
            onCancelAppointment={setToCancel}
            cancelPending={toCancel !== null}
            onGoToDay={(d) => {
              setDate(d);
              setView('day');
            }}
          />
        )
      ) : (
        <>
          <p className="text-sm font-semibold capitalize text-brand-600">{prettyDate(date)}</p>

          {isPast && (
            <p className="rounded-2xl bg-clay-400/20 px-4 py-3 text-sm text-clay-600">
              Fecha pasada: solo consulta. No se pueden crear reservas.
            </p>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={28} />}
              title="Aún no tienes pacientes"
              hint="Primero registra un paciente para poder reservar su cita."
              action={
                <Link to="/clientes" className="btn-primary">
                  Ir a pacientes
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {SLOT_HOURS.map((time) => {
                const appt = dayAppts.find((a) => a.time === time);
                return (
                  <div key={time} className="card flex items-center gap-4 p-3 sm:p-4">
                    <span className="w-14 shrink-0 text-sm font-extrabold text-brand-700">{time}</span>
                    {appt ? (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-brand-800">{appt.clientName}</p>
                          <p className="text-xs capitalize text-brand-500">{appt.status}</p>
                        </div>
                        <Link
                          to={`/clientes/${appt.clientId}?cita=${appt.id}`}
                          className="btn-soft !px-3 !py-2"
                          title="Registrar consulta"
                        >
                          <FileText size={16} />
                          <span className="hidden sm:inline">Consulta</span>
                        </Link>
                        {appt.status === 'programada' && (
                          <button
                            className="btn-soft !px-3 !py-2 text-clay-600"
                            onClick={() => setToCancel(appt.id)}
                            aria-label="Cancelar cita"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="flex-1 text-sm text-brand-400">Disponible</p>
                        {bookable && (
                          <button className="btn-soft !px-3 !py-2" onClick={() => openSlot(time)}>
                            <CalendarPlus size={16} /> Reservar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={slot !== null} title={`Reservar ${slot ?? ''} · ${date}`} onClose={() => setSlot(null)}>
        <div className="space-y-4">
          <Field label="Paciente" error={error}>
            <select
              className={`input ${error ? 'input-error' : ''}`}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setError('');
              }}
            >
              <option value="">Selecciona…</option>
              {[...clients]
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-700">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Repetir cada semana ({prettyDate(date).split(' ')[0]})
          </label>
          {repeat && (
            <Field label="Repetir hasta (inclusive)">
              <input type="date" className="input" min={date} value={until} onChange={(e) => setUntil(e.target.value)} />
              {until && until >= date && (
                <p className="mt-1 text-xs text-brand-500">
                  {weeklyDates(date, until).length} citas
                  {weeklyDates(date, until).length > MAX_SERIES ? ` (máximo ${MAX_SERIES})` : ''}
                </p>
              )}
            </Field>
          )}
          {slot && hasConflict(appointments, date, slot) && !repeat && (
            <p className="field-error">Este horario ya está ocupado.</p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-soft" onClick={() => setSlot(null)}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={confirmBooking}>
              Reservar
            </button>
          </div>
        </div>
      </Modal>

      {cancelHasSeries ? (
        <Modal open={toCancel !== null} title="Cancelar cita" onClose={() => setToCancel(null)}>
          <p className="mb-5 text-sm text-brand-700">
            Esta cita es parte de una reserva semanal. ¿Qué quieres cancelar?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button className="btn-soft" onClick={() => setToCancel(null)}>
              Volver
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                await setAppointmentStatus(toCancel!, 'cancelada');
                toast.info('Cita cancelada');
                setToCancel(null);
              }}
            >
              Solo esta cita
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                const n = await cancelSeriesFrom(toCancel!);
                toast.info(`${n} citas canceladas`);
                setToCancel(null);
              }}
            >
              Esta y las siguientes
            </button>
          </div>
        </Modal>
      ) : (
        <ConfirmModal
          open={toCancel !== null}
          title="Cancelar cita"
          message="La cita se cancelará y el horario quedará libre. ¿Continuar?"
          confirmLabel="Cancelar cita"
          onClose={() => setToCancel(null)}
          onConfirm={async () => {
            await setAppointmentStatus(toCancel!, 'cancelada');
            toast.info('Cita cancelada');
          }}
        />
      )}
    </div>
  );
}
