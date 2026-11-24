import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Copy, Download, Eye, FilePlus2, MessageCircle, Users } from 'lucide-react';
import { useData } from '../store/data';
import { latestCompleted, latestPending, useAnamnesis } from '../store/anamnesis';
import { toast } from '../store/toast';
import { EmptyState, Field, Skeleton } from '../components/ui';
import { downloadName, formLink, whatsappMessage, whatsappUrl, type AnamnesisForm } from '../lib/anamnesis';
import { buildAnamnesisHtml } from '../lib/anamnesisHtml';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;

function download(form: AnamnesisForm) {
  const html = buildAnamnesisHtml({ token: form.id, projectId, apiKey, clientName: form.clientName });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName(form.clientName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Anamnesis() {
  const { clients, loading: loadingClients } = useData();
  const { forms, loading: loadingForms, create } = useAnamnesis();
  const [params, setParams] = useSearchParams();
  const clientId = params.get('cliente') ?? '';
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);

  const sorted = useMemo(() => [...clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [clients]);
  const client = clients.find((c) => c.id === clientId);
  const pending = client ? latestPending(forms, client.id) : undefined;
  const completed = client ? latestCompleted(forms, client.id) : undefined;
  const hasAny = Boolean(pending || completed);

  const generate = async () => {
    if (!client || creating.current) return;
    creating.current = true;
    setBusy(true);
    try {
      await create(client);
    } catch {
      toast.error('No se pudo crear el formulario. Inténtalo de nuevo.');
    } finally {
      creating.current = false;
      setBusy(false);
    }
  };

  // Al elegir un paciente que nunca ha recibido el formulario, se crea el enlace solo.
  useEffect(() => {
    if (client && !loadingForms && !hasAny) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, loadingForms, hasAny]);

  if (loadingClients || loadingForms) return <Skeleton className="mx-auto h-64 max-w-3xl" />;

  const link = pending ? formLink(pending.id) : '';
  const wa = pending && client ? whatsappUrl(client.phone, whatsappMessage(client.fullName, link)) : '';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-800">Anamnesia</h1>
        <p className="mt-1 text-sm text-brand-600">
          Elige un paciente para generar su formulario de anamnesis. Se lo envías por WhatsApp (o le pasas el archivo) y, cuando lo llene y pulse «Enviar», sus respuestas aparecen solas en la pestaña Anamnesia de su ficha.
        </p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="Aún no tienes pacientes"
          hint="Crea un paciente para poder enviarle su formulario."
          action={
            <Link to="/clientes" className="btn-primary">
              Ir a pacientes
            </Link>
          }
        />
      ) : (
        <div className="card p-5">
          <Field label="Paciente">
            <select className="input" value={clientId} onChange={(e) => setParams(e.target.value ? { cliente: e.target.value } : {}, { replace: true })}>
              <option value="">Selecciona un paciente…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {client && completed && !pending && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-300 p-5">
          <div className="flex items-start gap-3 text-sm text-brand-800">
            <CheckCircle2 className="mt-0.5 shrink-0 text-brand-600" size={20} />
            <p>
              <b>{client.fullName}</b> ya respondió el {new Date(completed.submittedAt ?? completed.createdAt).toLocaleDateString('es')}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/clientes/${client.id}?tab=anamnesia`} className="btn-soft">
              <Eye size={16} /> Ver anamnesia
            </Link>
            <button className="btn-primary" onClick={generate} disabled={busy}>
              <FilePlus2 size={16} /> Enviar uno nuevo
            </button>
          </div>
        </div>
      )}

      {client && pending && (
        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-brand-800">Formulario listo para {client.fullName}</h2>
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">Esperando respuesta</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button className="btn-soft" onClick={() => download(pending)}>
                <Download size={16} /> Descargar HTML
              </button>
              <a className="btn-primary" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={16} /> Enviar por WhatsApp
              </a>
              <button
                className="btn-soft"
                onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success('Enlace copiado'), () => toast.error('No se pudo copiar'))}
              >
                <Copy size={16} /> Copiar enlace
              </button>
            </div>
            {!client.phone.trim() && (
              <p className="text-xs text-brand-600">Este paciente no tiene teléfono guardado: WhatsApp te dejará elegir el contacto al abrir.</p>
            )}
            <p className="break-all rounded-2xl bg-brand-50 px-3 py-2 text-xs text-brand-700">{link}</p>
            <p className="text-xs text-brand-600">
              El enlace es personal y solo sirve para este paciente. Funciona una sola vez: al enviarlo, el formulario se cierra.
            </p>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand-200 px-5 py-3 text-sm font-bold text-brand-800">
              <span className="flex items-center gap-2">
                <ClipboardList size={16} /> Vista previa (no envía nada)
              </span>
            </div>
            <iframe
              title="Vista previa del formulario"
              className="h-[560px] w-full border-0 bg-white"
              srcDoc={buildAnamnesisHtml({ token: pending.id, projectId, apiKey, clientName: pending.clientName, preview: true })}
            />
          </div>
        </div>
      )}

      {client && !hasAny && busy && <Skeleton className="h-40" />}
    </div>
  );
}
