import type { ReactNode } from 'react';
import { BadgeCheck, Clock, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../store/auth';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="label !mb-0.5">{k}</p>
      <p className="break-all text-sm text-brand-800">{v.trim() || '—'}</p>
    </div>
  );
}

function CardBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5" aria-label={title}>
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-brand-800">
        <span className="text-brand-500">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** Fecha legible en español a partir de la cadena que entrega Firebase Auth (metadata); '' si no es válida. */
export function formatAuthDate(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
}

/**
 * Perfil del administrador de la plataforma: solo lectura. No tiene `therapistProfiles`; sus datos son los de su cuenta de
 * Firebase Authentication (la que se creó a mano en la consola). Nombre, correo y contraseña se cambian desde allí.
 */
export default function AdminProfile() {
  const user = useAuth((s) => s.user);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold text-brand-800">Perfil</h1>

      <CardBlock icon={<UserRound size={16} />} title="Cuenta">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row k="Nombre" v={user?.displayName ?? ''} />
          <Row k="Correo" v={user?.email ?? ''} />
          <Row k="Identificador (UID)" v={user?.uid ?? ''} />
        </div>
      </CardBlock>

      <CardBlock icon={<ShieldCheck size={16} />} title="Rol">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row k="Rol" v="Administrador de la plataforma" />
          <Row k="Permisos" v="Crea, edita y elimina terapeutas. No ve datos clínicos." />
        </div>
      </CardBlock>

      <CardBlock icon={<Clock size={16} />} title="Actividad">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row k="Cuenta creada" v={formatAuthDate(user?.metadata?.creationTime)} />
          <Row k="Último acceso" v={formatAuthDate(user?.metadata?.lastSignInTime)} />
          <div>
            <p className="label !mb-0.5">Correo verificado</p>
            <p className="flex items-center gap-1.5 text-sm text-brand-800">
              <BadgeCheck size={14} className="text-brand-500" /> {user?.emailVerified ? 'Sí' : 'No'}
            </p>
          </div>
        </div>
      </CardBlock>

      <p className="rounded-2xl bg-brand-50 px-4 py-3 text-xs text-brand-700">
        Estos datos son los de tu cuenta de Firebase. Para cambiar el nombre o el correo, hazlo en la consola de Firebase (Authentication); la contraseña
        se cambia desde Configuración.
      </p>
    </div>
  );
}
