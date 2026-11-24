import type { ReactNode } from 'react';
import { Briefcase, Building2, FileText, Mail, UserRound } from 'lucide-react';
import { useTherapistProfile } from '../store/therapistProfile';
import { EmptyState, Skeleton } from '../components/ui';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="label !mb-0.5">{k}</p>
      <p className="whitespace-pre-wrap text-sm text-brand-800">{v.trim() || '—'}</p>
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

/** Perfil de la terapeuta: solo lectura. Los datos los cambia el administrador. */
export default function Profile() {
  const { ready, profile, error } = useTherapistProfile();
  // Se lee al renderizar (no al importar) para poder cambiarlo en pruebas.
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold text-brand-800">Perfil</h1>

      {!ready ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-2xl bg-clay-400/20 px-4 py-3 text-sm text-clay-600">No se pudo cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.</p>
      ) : !profile ? (
        <EmptyState
          icon={<UserRound size={28} />}
          title="Aún no hay datos en tu perfil"
          hint="El administrador todavía no ha registrado tus datos profesionales."
        />
      ) : (
        <>
          <CardBlock icon={<UserRound size={16} />} title="Datos personales">
            <div className="grid gap-4 sm:grid-cols-2">
              <Row k="Nombre completo" v={profile.fullName} />
              <Row k="Documento de identidad" v={profile.idNumber} />
              <Row k="Teléfono" v={profile.phone} />
            </div>
          </CardBlock>

          <CardBlock icon={<Briefcase size={16} />} title="Datos profesionales">
            <div className="grid gap-4 sm:grid-cols-2">
              <Row k="Especialidad" v={profile.specialty} />
              <Row k="Tarjeta / registro profesional" v={profile.licenseNumber} />
              <Row k="Años de experiencia" v={profile.yearsExperience} />
            </div>
          </CardBlock>

          <CardBlock icon={<Building2 size={16} />} title="Consultorio">
            <div className="grid gap-4 sm:grid-cols-2">
              <Row k="Dirección" v={profile.officeAddress} />
              <Row k="Ciudad" v={profile.city} />
            </div>
          </CardBlock>

          <CardBlock icon={<FileText size={16} />} title="Descripción">
            <Row k="Sobre mí" v={profile.bio} />
          </CardBlock>
        </>
      )}

      <p className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-brand-50 px-4 py-3 text-xs text-brand-700">
        <Mail size={14} className="shrink-0" />
        <span>Para cambiar estos datos, contacta al administrador</span>
        {adminEmail && (
          <>
            :{' '}
            <a className="font-bold underline" href={`mailto:${adminEmail}`}>
              {adminEmail}
            </a>
          </>
        )}
        .
      </p>
    </div>
  );
}
