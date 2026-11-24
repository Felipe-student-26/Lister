import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Eye, FileText, Send, Minus, Pencil, Printer, Save, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useData } from '../store/data';
import { useTherapistProfile } from '../store/therapistProfile';
import { latestCompleted, latestPending, useAnamnesis } from '../store/anamnesis';
import AnamnesisView from '../components/AnamnesisView';
import { toast } from '../store/toast';
import { EmptyState, Field, Skeleton } from '../components/ui';
import ClientFormModal from '../components/ClientFormModal';
import DeleteClientModal from '../components/DeleteClientModal';
import ClientHistoryPrint, { printFileTitle } from '../components/ClientHistoryPrint';
import type { ProgressState, SessionRecord } from '../lib/types';
import { todayISO } from '../lib/validation';

type Tab = 'consulta' | 'historial' | 'observaciones' | 'anamnesia' | 'datos';

const STATES: { value: ProgressState; label: string; icon: typeof Minus }[] = [
  { value: 'mejor', label: 'Mejor', icon: TrendingUp },
  { value: 'igual', label: 'Igual', icon: Minus },
  { value: 'peor', label: 'Peor', icon: TrendingDown },
];

export default function ClientDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clients, appointments, sessions, observations, loading, updateClient } = useData();
  const client = clients.find((c) => c.id === id);
  const [tab, setTab] = useState<Tab>(params.get('cita') ? 'consulta' : params.get('tab') === 'anamnesia' ? 'anamnesia' : 'historial');
  const anamnesisForms = useAnamnesis((s) => s.forms);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [printing, setPrinting] = useState(false);
  const therapist = useTherapistProfile((s) => s.profile);

  // Imprimir el historial: se monta el documento (portal en <body>, oculto en pantalla), se esperan las fuentes y se abre el diálogo
  // del sistema; ahí se elige "Guardar como PDF". El título de la página es el nombre sugerido del archivo.
  useEffect(() => {
    if (!printing) return;
    const previousTitle = document.title;
    let cancelled = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      document.title = previousTitle;
      setPrinting(false);
    };
    window.addEventListener('afterprint', finish);
    (async () => {
      try {
        // las fuentes del documento no se piden mientras está oculto: se cargan a propósito antes de imprimir
        await document.fonts?.load('400 24px "Bubblegum Sans"'); // el resto del documento usa Arial (del sistema)
      } catch {
        /* si una fuente no carga, se imprime con la de respaldo */
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;
      document.title = printFileTitle(useData.getState().clients.find((c) => c.id === id)?.fullName ?? 'paciente');
      window.print();
      // En Chromium/Electron print() espera a que se cierre el diálogo y luego llega afterprint. Donde no hay impresión (p. ej. un WebView
      // móvil) ese evento no llega: este respaldo desmonta el documento y vuelve a habilitar el botón.
      fallback = setTimeout(finish, 5000);
    })();
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      window.removeEventListener('afterprint', finish);
    };
  }, [printing, id]);

  const clientSessions = useMemo(
    () => sessions.filter((s) => s.clientId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, id],
  );

  if (loading) return <Skeleton className="mx-auto h-64 max-w-3xl" />;
  if (!client) {
    return (
      <EmptyState
        icon={<ClipboardList size={28} />}
        title="Paciente no encontrado"
        hint="Puede que haya sido eliminado."
        action={
          <Link to="/clientes" className="btn-primary">
            Volver a pacientes
          </Link>
        }
      />
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'consulta', label: 'Consulta de hoy' },
    { key: 'historial', label: 'Historial' },
    { key: 'observaciones', label: 'Observaciones' },
    { key: 'anamnesia', label: 'Anamnesia' },
    { key: 'datos', label: 'Datos' },
  ];

  const clientAppts = appointments
    .filter((a) => a.clientId === id && a.status !== 'cancelada')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft size={16} /> Pacientes
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-800">{client.fullName}</h1>
        <div className="flex gap-2">
          <button className="btn-soft" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Editar
          </button>
          <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Eliminar paciente
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-brand-100 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
              tab === t.key ? 'bg-white text-brand-800 shadow-softer' : 'text-brand-600 hover:text-brand-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'consulta' && (
        <SessionForm
          clientId={id}
          preselected={params.get('cita')}
          appointments={clientAppts.filter((a) => a.date <= todayISO() || a.id === params.get('cita'))}
          previous={clientSessions[0]}
          sessions={clientSessions}
          onSaved={() => setTab('historial')}
        />
      )}

      {tab === 'historial' && <History sessions={clientSessions} onPrint={() => setPrinting(true)} printing={printing} />}
      {tab === 'observaciones' && <Observations clientId={id} items={observations.filter((o) => o.clientId === id)} />}

      {tab === 'anamnesia' && <AnamnesisTab clientId={id} forms={anamnesisForms} />}

      {tab === 'datos' && (
        <div className="card space-y-3 p-5 text-sm">
          <Row k="Teléfono" v={client.phone} />
          <Row k="Correo" v={client.email} />
          <Row k="Nacimiento" v={client.birthDate} />
          <Row k="Información general" v={client.generalInfo} />
        </div>
      )}

      <ClientFormModal
        open={editing}
        client={client}
        onClose={() => setEditing(false)}
        onSave={async (data) => {
          try {
            await updateClient(id, data);
            toast.success('Paciente actualizado');
            setEditing(false);
          } catch (err) {
            toast.error('No se pudieron guardar los cambios. Inténtalo de nuevo.');
            throw err;
          }
        }}
      />

      <DeleteClientModal client={confirmDelete ? client : null} onClose={() => setConfirmDelete(false)} onDeleted={() => navigate('/clientes')} />

      {printing &&
        createPortal(
          <ClientHistoryPrint client={client} sessions={clientSessions} therapist={therapist} />,
          document.body,
        )}
    </div>
  );
}

function AnamnesisTab({ clientId, forms }: { clientId: string; forms: ReturnType<typeof useAnamnesis.getState>['forms'] }) {
  const done = latestCompleted(forms, clientId);
  const pending = latestPending(forms, clientId);

  if (!done) {
    return (
      <EmptyState
        icon={<FileText size={28} />}
        title={pending ? 'Formulario enviado, aún sin respuesta' : 'Sin anamnesis'}
        hint={
          pending
            ? 'Cuando el paciente lo llene y pulse «Enviar», sus respuestas aparecerán aquí automáticamente.'
            : 'Genera el formulario y envíaselo al paciente: sus respuestas se guardarán aquí.'
        }
        action={
          <Link to={`/anamnesia?cliente=${clientId}`} className="btn-primary">
            <Send size={16} /> {pending ? 'Ver el formulario' : 'Crear y enviar formulario'}
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-700">
          Respondida el {new Date(done.submittedAt ?? done.createdAt).toLocaleString('es')}
          {pending && ' · hay un formulario nuevo pendiente'}
        </p>
        <Link to={`/anamnesia?cliente=${clientId}`} className="btn-soft">
          <Send size={16} /> Enviar uno nuevo
        </Link>
      </div>
      <AnamnesisView answers={done.answers} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="label !mb-0.5">{k}</p>
      <p className="whitespace-pre-wrap text-brand-800">{v || '—'}</p>
    </div>
  );
}

function SessionForm({
  clientId,
  preselected,
  appointments,
  previous,
  sessions,
  onSaved,
}: {
  clientId: string;
  preselected: string | null;
  appointments: { id: string; date: string; time: string }[];
  previous?: SessionRecord;
  sessions: SessionRecord[];
  onSaved: () => void;
}) {
  const { saveSession } = useData();
  const [apptId, setApptId] = useState(preselected ?? appointments[0]?.id ?? '');
  const existing = sessions.find((s) => s.appointmentId === apptId);
  const blank = {
    sessionNotes: '',
    proposedGoals: '',
    agreedTargets: '',
    progressOnPrevious: '',
    stateVsPrevious: 'igual' as ProgressState,
    stateComment: '',
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState('');

  useEffect(() => {
    setF(existing ? { ...blank, ...existing } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptId, existing?.id]);

  const appt = appointments.find((a) => a.id === apptId);
  // La cita anterior a la actual (para comparar estado)
  const prior = sessions.filter((s) => (appt ? s.date < appt.date : true)).sort((a, b) => b.date.localeCompare(a.date))[0] ?? previous;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!appt) {
      setError('Selecciona la cita de esta consulta');
      return;
    }
    if (!f.sessionNotes.trim()) {
      setError('Escribe al menos las notas de la consulta');
      return;
    }
    await saveSession(
      { clientId, appointmentId: appt.id, date: appt.date, ...f },
      existing?.id,
    );
    toast.success('Consulta guardada');
    onSaved();
  };

  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={28} />}
        title="No hay citas para registrar"
        hint="Reserva una cita desde la agenda; el expediente de la consulta se llena el mismo día."
        action={
          <Link to="/" className="btn-primary">
            Ir a la agenda
          </Link>
        }
      />
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
      <Field label="Cita" error={error}>
        <select className="input" value={apptId} onChange={(e) => { setApptId(e.target.value); setError(''); }}>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.date} · {a.time}
            </option>
          ))}
        </select>
      </Field>

      {prior && (
        <div className="rounded-2xl bg-brand-50 p-4 text-sm">
          <p className="label">Consulta anterior ({prior.date})</p>
          <p className="text-brand-700"><b>Metas acordadas:</b> {prior.agreedTargets || '—'}</p>
          <p className="text-brand-700"><b>Estado:</b> {prior.stateVsPrevious}</p>
        </div>
      )}

      <Field label="Notas de la consulta">
        <textarea className="input min-h-28" value={f.sessionNotes} onChange={(e) => setF({ ...f, sessionNotes: e.target.value })} />
      </Field>
      <Field label="Objetivos propuestos">
        <textarea className="input min-h-20" value={f.proposedGoals} onChange={(e) => setF({ ...f, proposedGoals: e.target.value })} />
      </Field>
      <Field label="Metas acordadas">
        <textarea className="input min-h-20" value={f.agreedTargets} onChange={(e) => setF({ ...f, agreedTargets: e.target.value })} />
      </Field>
      <Field label="Avances en objetivos de citas anteriores">
        <textarea className="input min-h-20" value={f.progressOnPrevious} onChange={(e) => setF({ ...f, progressOnPrevious: e.target.value })} />
      </Field>

      <Field label="Estado vs. cita anterior">
        <div className="grid grid-cols-3 gap-2">
          {STATES.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              onClick={() => setF({ ...f, stateVsPrevious: value })}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-2.5 text-sm font-bold transition ${
                f.stateVsPrevious === value
                  ? 'border-brand-600 bg-brand-100 text-brand-800'
                  : 'border-brand-200 text-brand-600 hover:bg-brand-50'
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Comentario del estado">
        <textarea className="input min-h-16" value={f.stateComment} onChange={(e) => setF({ ...f, stateComment: e.target.value })} />
      </Field>

      <button className="btn-primary w-full">
        <Save size={16} /> Guardar consulta
      </button>
    </form>
  );
}

function History({ sessions, onPrint, printing }: { sessions: SessionRecord[]; onPrint: () => void; printing: boolean }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList size={28} />}
        title="Sin consultas registradas"
        hint="Las consultas guardadas aparecerán aquí, de la más reciente a la más antigua."
      />
    );
  }
  const badge = { mejor: 'bg-brand-200 text-brand-800', igual: 'bg-cream-200 text-brand-700', peor: 'bg-clay-400/30 text-clay-600' };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className="btn-soft" onClick={onPrint} disabled={printing} title="Abre la impresión: elige «Guardar como PDF» como destino">
          <Printer size={16} /> Imprimir PDF
        </button>
      </div>
      <ul className="space-y-3">
        {sessions.map((s) => (
          <li key={s.id} className="card space-y-2 p-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-brand-800">{s.date}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${badge[s.stateVsPrevious]}`}>{s.stateVsPrevious}</span>
            </div>
            <Row k="Notas" v={s.sessionNotes} />
            <Row k="Objetivos propuestos" v={s.proposedGoals} />
            <Row k="Metas acordadas" v={s.agreedTargets} />
            <Row k="Avances" v={s.progressOnPrevious} />
            {s.stateComment && <Row k="Comentario de estado" v={s.stateComment} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Observations({
  clientId,
  items,
}: {
  clientId: string;
  items: { id: string; text: string; createdAt: number }[];
}) {
  const { addObservation, deleteObservation } = useData();
  const [text, setText] = useState('');
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      <form
        className="card space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await addObservation(clientId, text.trim());
          setText('');
          toast.success('Observación guardada');
        }}
      >
        <Field label="Nueva nota de observación">
          <textarea className="input min-h-20" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button className="btn-primary" disabled={!text.trim()}>
          Agregar
        </button>
      </form>
      {sorted.length === 0 ? (
        <EmptyState icon={<Eye size={28} />} title="Sin observaciones" hint="Aquí van las notas que escribas aparte de las citas." />
      ) : (
        <ul className="space-y-3">
          {sorted.map((o) => (
            <li key={o.id} className="card flex gap-3 p-4 text-sm">
              <div className="flex-1">
                <p className="mb-1 text-xs font-semibold text-brand-500">{new Date(o.createdAt).toLocaleString('es')}</p>
                <p className="whitespace-pre-wrap text-brand-800">{o.text}</p>
              </div>
              <button onClick={() => deleteObservation(o.id)} className="self-start text-brand-400 hover:text-clay-600" aria-label="Eliminar observación">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
