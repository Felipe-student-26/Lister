import { useState, type FormEvent } from 'react';
import { Field, Modal } from './ui';
import type { Client } from '../lib/types';
import { EMAIL_RE } from '../lib/validation';

export type ClientFormData = Pick<Client, 'fullName' | 'phone' | 'email' | 'birthDate' | 'generalInfo'>;

const empty: ClientFormData = { fullName: '', phone: '', email: '', birthDate: '', generalInfo: '' };

/** Alta y edición de pacientes. `client` = edición (se precarga); sin `client` = "Nuevo paciente". `onSave` puede lanzar: el modal queda abierto. */
export default function ClientFormModal({
  open,
  client,
  onClose,
  onSave,
}: {
  open: boolean;
  client?: ClientFormData | null;
  onClose: () => void;
  onSave: (d: ClientFormData) => Promise<void>;
}) {
  return (
    <Modal open={open} title={client ? 'Editar paciente' : 'Nuevo paciente'} onClose={onClose}>
      {/* El formulario se monta al abrir: así cada apertura parte de los datos del paciente (o vacío). */}
      <ClientForm initial={client ?? empty} onClose={onClose} onSave={onSave} />
    </Modal>
  );
}

function ClientForm({ initial, onClose, onSave }: { initial: ClientFormData; onClose: () => void; onSave: (d: ClientFormData) => Promise<void> }) {
  const [f, setF] = useState<ClientFormData>({ ...empty, ...pick(initial) });
  const [errors, setErrors] = useState<{ fullName?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (f.fullName.trim().length < 3) er.fullName = 'Escribe el nombre completo';
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) er.email = 'Correo no válido';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await onSave({ ...f, fullName: f.fullName.trim(), email: f.email.trim(), phone: f.phone.trim() });
    } catch {
      /* quien guarda avisa del error; el modal queda abierto con lo escrito */
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nombre completo" error={errors.fullName}>
        <input className={`input ${errors.fullName ? 'input-error' : ''}`} aria-label="Nombre completo" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <input className="input" aria-label="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Nacimiento">
          <input type="date" className="input" aria-label="Nacimiento" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
        </Field>
      </div>
      <Field label="Correo" error={errors.email}>
        <input className={`input ${errors.email ? 'input-error' : ''}`} aria-label="Correo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Información general">
        <textarea className="input min-h-24" aria-label="Información general" value={f.generalInfo} onChange={(e) => setF({ ...f, generalInfo: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-soft" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

const pick = (c: ClientFormData): ClientFormData => ({ fullName: c.fullName ?? '', phone: c.phone ?? '', email: c.email ?? '', birthDate: c.birthDate ?? '', generalInfo: c.generalInfo ?? '' });
