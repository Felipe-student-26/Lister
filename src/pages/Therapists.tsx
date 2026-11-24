import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, KeyRound, Pencil, Plus, Search, Trash2, UserCog } from 'lucide-react';
import { toast } from '../store/toast';
import { saveTherapistProfile, watchTherapists, type Therapist } from '../lib/team';
import { createTherapistAccount, removeTherapistAccount, sendTherapistPasswordLink, therapistErrorMessage } from '../lib/therapistAdmin';
import type { TherapistProfile } from '../lib/types';
import { emptyTherapistProfile, todayISO, validateTherapistProfile, type TherapistProfileErrors } from '../lib/validation';
import { ConfirmModal, EmptyState, Field, Modal, Skeleton } from '../components/ui';

const PAGE_SIZE = 8;

/** Gestión de terapeutas (solo administrador de la plataforma). Todo corre en el cliente (plan Spark, sin Cloud Functions): la barrera real son las reglas de Firestore. */
export default function Therapists() {
  const [rows, setRows] = useState<Therapist[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState('');
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; therapist: Therapist } | null>(null);
  const [created, setCreated] = useState<{ email: string; emailSent: boolean } | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Therapist | null>(null);

  useEffect(
    () =>
      watchTherapists(
        (r) => {
          setRows(r);
          setLoadError(false);
        },
        () => setLoadError(true),
      ),
    [],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((t) => !term || [t.fullName, t.email, t.phone].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => (asc ? 1 : -1) * (a.fullName || a.email).localeCompare(b.fullName || b.email));
  }, [rows, q, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const sendPasswordEmail = async (t: Therapist) => {
    setSendingTo(t.uid);
    try {
      await sendTherapistPasswordLink(t.email);
      toast.success(`Correo de contraseña enviado a ${t.email}`);
    } catch (err) {
      toast.error(therapistErrorMessage(err, 'No se pudo enviar el correo.'));
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-800">Terapeutas</h1>
          <p className="text-xs text-brand-600">Cada terapeuta es dueña de sus datos. Al crearla se le envía un correo para que defina su contraseña.</p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setForm({ mode: 'create' })}>
          <Plus size={16} /> Crear terapeuta
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400" />
          <input
            className="input !pl-10"
            placeholder="Buscar por nombre, correo o teléfono"
            aria-label="Buscar terapeutas"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button className="btn-soft" onClick={() => setAsc(!asc)} aria-label="Cambiar orden">
          {asc ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}
        </button>
      </div>

      {loadError ? (
        <p className="rounded-2xl bg-clay-400/20 px-4 py-3 text-sm text-clay-600">No se pudieron cargar las terapeutas.</p>
      ) : rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserCog size={28} />}
          title="Aún no hay terapeutas"
          hint="Crea la primera terapeuta: recibirá un correo para definir su contraseña."
          action={
            <button className="btn-primary" onClick={() => setForm({ mode: 'create' })}>
              Crear terapeuta
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-brand-500">Sin resultados para “{q}”.</p>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-xs uppercase tracking-wide text-brand-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Correo</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Teléfono</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {visible.map((t) => {
                  const who = t.fullName || t.email;
                  return (
                    <tr key={t.uid} className="bg-trow">
                      <td className="max-w-0 px-4 py-3">
                        <p className="truncate font-bold text-brand-800">{t.fullName || <span className="font-semibold text-brand-500">Sin nombre</span>}</p>
                        <p className="truncate text-xs text-brand-500 md:hidden">{t.email}</p>
                      </td>
                      <td className="hidden max-w-0 truncate px-4 py-3 text-brand-700 md:table-cell">{t.email}</td>
                      <td className="hidden px-4 py-3 text-brand-700 sm:table-cell">{t.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button className="btn-soft !p-2" title="Ver / editar" aria-label={`Ver o editar a ${who}`} onClick={() => setForm({ mode: 'edit', therapist: t })}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn-soft !p-2" title="Enviar correo de contraseña" aria-label={`Enviar correo de contraseña a ${who}`} disabled={sendingTo === t.uid} onClick={() => sendPasswordEmail(t)}>
                            <KeyRound size={14} />
                          </button>
                          <button className="btn-soft !p-2 text-clay-600" title="Eliminar" aria-label={`Eliminar a ${who}`} onClick={() => setRemoving(t)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-soft !p-2" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Página anterior">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-brand-600">
                {current + 1} / {pages}
              </span>
              <button className="btn-soft !p-2" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={form !== null} title={form?.mode === 'edit' ? 'Perfil de la terapeuta' : 'Crear terapeuta'} onClose={() => setForm(null)}>
        {form && (
          <TherapistForm
            key={form.mode === 'edit' ? form.therapist.uid : 'new'}
            therapist={form.mode === 'edit' ? form.therapist : null}
            onCancel={() => setForm(null)}
            onCreated={(email, emailSent) => {
              setForm(null);
              setCreated({ email, emailSent });
              toast.success('Terapeuta creada');
            }}
            onSaved={() => {
              setForm(null);
              toast.success('Perfil actualizado');
            }}
          />
        )}
      </Modal>

      <Modal open={created !== null} title="Terapeuta creada" onClose={() => setCreated(null)}>
        {created && (
          <div className="space-y-3">
            {created.emailSent ? (
              <p className="text-sm text-brand-700">{`Se envió un correo a ${created.email} para que defina su contraseña.`}</p>
            ) : (
              <p className="text-sm text-clay-600" role="alert">
                {`La cuenta de ${created.email} se creó, pero no se pudo enviar el correo. Usa "Enviar correo de contraseña" en su fila para reintentarlo.`}
              </p>
            )}
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setCreated(null)}>
                Listo
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={removing !== null}
        title="Eliminar terapeuta"
        message={`Se eliminará el acceso de ${removing?.fullName || removing?.email || ''} y su perfil: ya no podrá entrar a la app. Sus datos clínicos (pacientes, citas, sesiones) NO se borran automáticamente. Su cuenta de acceso en Firebase Authentication tampoco se borra desde aquí: si quieres liberar el correo, bórrala a mano en la consola (Authentication). ¿Continuar?`}
        confirmLabel="Eliminar"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await removeTherapistAccount(removing!.uid);
            toast.info('Terapeuta eliminada');
          } catch (err) {
            toast.error(therapistErrorMessage(err, 'No se pudo eliminar a la terapeuta.'));
          }
        }}
      />
    </div>
  );
}

function TherapistForm({
  therapist,
  onCancel,
  onCreated,
  onSaved,
}: {
  therapist: Therapist | null;
  onCancel: () => void;
  onCreated: (email: string, emailSent: boolean) => void;
  onSaved: () => void;
}) {
  const editing = therapist !== null;
  const [f, setF] = useState<TherapistProfile>(() => {
    if (!therapist) return emptyTherapistProfile();
    const { uid: _uid, hasProfile: _has, ...profile } = therapist;
    return profile;
  });
  const [errors, setErrors] = useState<TherapistProfileErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof TherapistProfile) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
    setErrors((prev) => ({ ...prev, [k]: undefined }));
    setFormError('');
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const er = validateTherapistProfile(f);
    setErrors(er);
    if (Object.values(er).some(Boolean)) return;
    setBusy(true);
    setFormError('');
    try {
      if (therapist) {
        await saveTherapistProfile(therapist.uid, f);
        onSaved();
      } else {
        const res = await createTherapistAccount({ email: f.email.trim(), profile: { ...f, fullName: f.fullName.trim(), email: f.email.trim() } });
        onCreated(res.email, res.emailSent);
      }
    } catch (err) {
      setFormError(therapistErrorMessage(err, therapist ? 'No se pudo guardar el perfil.' : 'No se pudo crear la terapeuta.'));
    } finally {
      setBusy(false);
    }
  };

  const text = (k: keyof TherapistProfile, label: string, opts: { type?: string; error?: string; readOnly?: boolean; max?: string } = {}) => (
    <Field label={label} error={opts.error}>
      <input
        className={`input ${opts.error ? 'input-error' : ''} ${opts.readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
        type={opts.type ?? 'text'}
        autoComplete="off"
        max={opts.max}
        readOnly={opts.readOnly}
        aria-label={label}
        value={f[k]}
        onChange={set(k)}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {text('fullName', 'Nombre completo *', { error: errors.fullName })}
      <div className="grid gap-3 sm:grid-cols-2">
        {text('email', 'Correo *', { type: 'email', error: errors.email, readOnly: editing })}
        {text('phone', 'Teléfono', { type: 'tel', error: errors.phone })}
        {text('idNumber', 'Documento de identidad')}
        {text('birthDate', 'Fecha de nacimiento', { type: 'date', error: errors.birthDate, max: todayISO() })}
        {text('specialty', 'Especialidad')}
        {text('licenseNumber', 'Tarjeta / registro profesional')}
        {text('city', 'Ciudad')}
        {text('yearsExperience', 'Años de experiencia', { type: 'number', error: errors.yearsExperience })}
      </div>
      {text('officeAddress', 'Dirección del consultorio')}
      <Field label="Descripción breve">
        <textarea className="input min-h-20" aria-label="Descripción breve" maxLength={600} value={f.bio} onChange={set('bio')} />
      </Field>
      {editing && <p className="text-xs text-brand-500">El correo es el de inicio de sesión de la terapeuta y no se cambia desde aquí.</p>}
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-soft" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : editing ? 'Guardar' : 'Crear terapeuta'}
        </button>
      </div>
    </form>
  );
}
