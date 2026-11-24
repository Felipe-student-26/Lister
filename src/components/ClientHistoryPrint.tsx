import type { ProgressState, SessionRecord } from '../lib/types';
import ListerLogo from './ListerLogo';
import './ClientHistoryPrint.css';

export interface PrintClient {
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  generalInfo: string;
}

export interface PrintTherapist {
  fullName: string;
  specialty?: string;
  licenseNumber?: string;
}

const STATE_LABEL: Record<ProgressState, string> = { mejor: 'Mejor', igual: 'Igual', peor: 'Peor' };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "2026-11-14" → "14 de noviembre de 2026" (sin pasar por UTC: evita el desfase de un día). */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "2026-11-14" → "Sábado, 14 de noviembre de 2026". */
export function fullDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return cap(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

/** Nombre sugerido del PDF (Chrome/Electron usan el título de la página al "Guardar como PDF"). */
export function printFileTitle(clientName: string): string {
  return `Historial - ${clientName}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Ondita decorativa rosa (un solo trazo, escala al ancho de la página). */
function Wave() {
  const d = `M0 6 q12.5 -6 25 0${' t25 0'.repeat(15)}`;
  return (
    <svg className="lp-wave" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="#f3a6c2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="lp-field">
      <p className="lp-label">{label}</p>
      <p className="lp-text">{value}</p>
    </div>
  );
}

/**
 * Documento imprimible del historial de un paciente. En pantalla está oculto (display: none); solo se ve al imprimir,
 * cuando el resto de la app se oculta (ver ClientHistoryPrint.css). Usa colores y fuentes fijos: no depende del tema elegido.
 * Títulos en letra bubble rosada; el contenido en una tipografía sobria (Inter) con detalles rosados.
 */
export default function ClientHistoryPrint({
  client,
  sessions,
  therapist,
  generatedAt = new Date(),
}: {
  client: PrintClient;
  sessions: SessionRecord[];
  therapist?: PrintTherapist | null;
  generatedAt?: Date;
}) {
  const dates = sessions.map((s) => s.date).sort();
  const count = (st: ProgressState) => sessions.filter((s) => s.stateVsPrevious === st).length;
  const pro = therapist?.fullName ? [therapist.fullName, therapist.specialty, therapist.licenseNumber ? `Reg. ${therapist.licenseNumber}` : ''].filter(Boolean).join(' · ') : '';

  return (
    <div className="lp-root" data-testid="print-sheet">
      <div className="lp-topbar" aria-hidden="true" />
      <div className="lp-footer">
        <span>Documento confidencial: contiene información clínica</span>
        <span className="lp-footer-brand">Lister</span>
      </div>

      {/* Tabla de marco: su thead/tfoot se repiten en cada página y dejan el espacio de la franja superior y del pie. */}
      <table className="lp-frame">
        <thead>
          <tr>
            <td>
              <div className="lp-space-top" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="lp-space-bottom" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="lp-body">
      <header className="lp-head">
        <ListerLogo />
        <p className="lp-gen">Generado el {generatedAt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </header>
      <Wave />

      <h1 className="lp-title">Historial del paciente</h1>

      <section className="lp-card lp-patient">
        <h2 className="lp-name">{client.fullName}</h2>
        <dl className="lp-grid">
          <div>
            <dt>Nacimiento</dt>
            <dd>{client.birthDate ? shortDate(client.birthDate) : '—'}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{client.phone || '—'}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{client.email || '—'}</dd>
          </div>
          {pro && (
            <div>
              <dt>Profesional</dt>
              <dd>{pro}</dd>
            </div>
          )}
        </dl>
        {client.generalInfo.trim() && (
          <div className="lp-general">
            <p className="lp-label">Información general</p>
            <p className="lp-text">{client.generalInfo}</p>
          </div>
        )}
      </section>

      <section className="lp-summary" aria-label="Resumen">
        <div className="lp-stat">
          <b>{sessions.length}</b>
          <span>{sessions.length === 1 ? 'consulta' : 'consultas'}</span>
        </div>
        {dates.length > 0 && (
          <>
            <div className="lp-stat">
              <b>{shortDate(dates[0])}</b>
              <span>primera consulta</span>
            </div>
            <div className="lp-stat">
              <b>{shortDate(dates[dates.length - 1])}</b>
              <span>última consulta</span>
            </div>
          </>
        )}
        <div className="lp-stat">
          <b>
            {count('mejor')} · {count('igual')} · {count('peor')}
          </b>
          <span>mejor · igual · peor</span>
        </div>
      </section>

      <h2 className="lp-h2">Consultas</h2>
      {sessions.map((s) => (
        <article key={s.id} className="lp-session">
          <div className="lp-session-head">
            <h3 className="lp-date">{fullDate(s.date)}</h3>
            <span className={`lp-chip lp-chip-${s.stateVsPrevious}`}>Estado: {STATE_LABEL[s.stateVsPrevious]}</span>
          </div>
          <Field label="Notas de la consulta" value={s.sessionNotes} />
          <Field label="Objetivos propuestos" value={s.proposedGoals} />
          <Field label="Metas acordadas" value={s.agreedTargets} />
          <Field label="Avances en objetivos anteriores" value={s.progressOnPrevious} />
          <Field label="Comentario del estado" value={s.stateComment} />
        </article>
      ))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
