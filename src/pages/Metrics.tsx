import { useMemo, useState } from 'react';
import { Activity, BarChart3, Minus, Radio, Trash2, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { useMetrics } from '../store/metrics';
import { toast } from '../store/toast';
import { BarChart, LineChart } from '../components/charts';
import { ConfirmModal, EmptyState, Skeleton } from '../components/ui';
import {
  dailyErrorRate,
  dailyMinutes,
  dayKeys,
  errorRate,
  moduleUsage,
  sessionMinutes,
  summarize,
  trend,
  type Num,
  type TrendDir,
} from '../lib/metrics';

const DAYS = 14;
const fmt = (v: Num, d = 1) => (v === null ? '—' : v.toFixed(d).replace(/\.0+$/, ''));

const MODULE_LABEL = { agenda: 'Agenda', pacientes: 'Pacientes', metricas: 'Métricas', otros: 'Otros' } as const;

function TrendBadge({ dir, badWhenUp = false }: { dir: TrendDir; badWhenUp?: boolean }) {
  const map = {
    sube: { Icon: TrendingUp, text: 'Al alza' },
    baja: { Icon: TrendingDown, text: 'A la baja' },
    estable: { Icon: Minus, text: 'Estable' },
    sin_datos: { Icon: Minus, text: 'Datos insuficientes' },
  } as const;
  const { Icon, text } = map[dir];
  const bad = (dir === 'sube' && badWhenUp) || (dir === 'baja' && !badWhenUp);
  const tone = dir === 'sin_datos' || dir === 'estable' ? 'bg-brand-100 text-brand-700' : bad ? 'bg-clay-400/30 text-clay-600' : 'bg-brand-200 text-brand-800';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      <Icon size={13} /> {text}
    </span>
  );
}

function Kpi({
  title,
  value,
  unit,
  mean,
  median,
  badge,
  note,
}: {
  title: string;
  value: string;
  unit: string;
  mean: Num;
  median: Num;
  badge: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="label !mb-0">{title}</p>
        {badge}
      </div>
      <p className="text-3xl font-extrabold text-brand-800">
        {value}
        <span className="ml-1 text-base font-bold text-brand-500">{unit}</span>
      </p>
      <div className="flex gap-4 text-xs text-brand-600">
        <span>
          Media <b className="text-brand-800">{fmt(mean)}</b>
        </span>
        <span>
          Mediana <b className="text-brand-800">{fmt(median)}</b>
        </span>
      </div>
      {note && <p className="text-xs text-brand-500">{note}</p>}
    </div>
  );
}

export default function Metrics() {
  const { events, ready, clear } = useMetrics();
  const [confirmClear, setConfirmClear] = useState(false);

  const m = useMemo(() => {
    const days = dayKeys(DAYS);
    const labels = days.map((d) => d.slice(5).replace('-', '/'));
    const sessions = sessionMinutes(events);
    const lastSessions = sessions.slice(-DAYS);
    const sessionSeries: Num[] = lastSessions.map((s) => s.minutes);
    const minutesDay = dailyMinutes(events, days);
    const errDay = dailyErrorRate(events, days);
    return {
      labels,
      sessions,
      lastSessions,
      sessionSeries,
      sessionStats: summarize(sessions.map((s) => s.minutes)),
      minutesDay,
      minutesStats: summarize(minutesDay),
      minutesTrend: trend(minutesDay),
      usage: moduleUsage(events),
      err: errorRate(events),
      errDay,
      errStats: summarize(errDay),
      errTrend: trend(errDay),
      errSync: errorRate(events, 'sync'),
      errSave: errorRate(events, 'save'),
    };
  }, [events]);

  const usageRows = m.usage.rows.filter((r) => r.module !== 'otros' || r.count > 0);
  const totalNulls = m.minutesStats.nulls + m.errStats.nulls + (m.usage.total === 0 ? 1 : 0);
  const currentMinutes = m.sessions.length ? m.sessions[m.sessions.length - 1].minutes : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-800">Métricas</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
            <Radio size={14} className="animate-pulse" /> En vivo · datos locales
          </span>
          <button className="btn-soft !px-3 !py-2" onClick={() => setConfirmClear(true)} aria-label="Borrar datos de métricas">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : m.sessions.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="Todavía no hay datos"
          hint="Usa la agenda y los expedientes: las métricas se llenan solas y se guardan solo en este dispositivo."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi
              title="Tiempo activo por sesión"
              value={fmt(currentMinutes)}
              unit="min (sesión actual)"
              mean={m.sessionStats.mean}
              median={m.sessionStats.median}
              badge={<TrendBadge dir={m.minutesTrend.dir} />}
              note={`${m.sessions.length} sesiones registradas`}
            />
            <Kpi
              title="Uso agenda + pacientes"
              value={fmt(
                (m.usage.rows.find((r) => r.module === 'agenda')?.pct ?? 0) +
                  (m.usage.rows.find((r) => r.module === 'pacientes')?.pct ?? 0),
                0,
              )}
              unit="% de accesos"
              mean={summarize(m.usage.rows.map((r) => r.pct)).mean}
              median={summarize(m.usage.rows.map((r) => r.pct)).median}
              badge={<span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{m.usage.total} accesos</span>}
              note="Media y mediana entre módulos."
            />
            <Kpi
              title="Errores"
              value={fmt(m.err.pct)}
              unit="% de operaciones"
              mean={m.errStats.mean}
              median={m.errStats.median}
              badge={<TrendBadge dir={m.errTrend.dir} badWhenUp />}
              note={`${m.err.failures} fallos / ${m.err.attempts} operaciones (sync ${fmt(m.errSync.pct)}% · guardado ${fmt(m.errSave.pct)}%)`}
            />
          </div>

          {totalNulls > 0 && (
            <div className="flex gap-3 rounded-2xl bg-clay-400/20 px-4 py-3 text-sm text-clay-600">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <p>
                Valores nulos detectados: {m.minutesStats.nulls} de {DAYS} días sin tiempo de uso y {m.errStats.nulls} sin operaciones.
                No se tratan como cero: quedan como huecos (marcas rojizas) y se excluyen de media y mediana.
              </p>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card space-y-2 p-5">
              <h2 className="flex items-center gap-2 font-extrabold text-brand-800">
                <Activity size={18} /> Minutos activos por sesión
              </h2>
              <LineChart
                values={m.sessionSeries}
                labels={m.lastSessions.map((s) => new Date(s.start).toLocaleDateString('es', { day: '2-digit', month: '2-digit' }))}
                unit=" min"
                label="Minutos activos por sesión"
              />
            </section>
            <section className="card space-y-2 p-5">
              <h2 className="font-extrabold text-brand-800">Uso por módulo (%)</h2>
              <BarChart
                values={usageRows.map((r) => r.pct)}
                labels={usageRows.map((r) => MODULE_LABEL[r.module])}
                unit="%"
                max={100}
                label="Uso por módulo"
              />
            </section>
            <section className="card space-y-2 p-5">
              <h2 className="font-extrabold text-brand-800">Minutos activos por día</h2>
              <BarChart values={m.minutesDay} labels={m.labels} unit=" min" label="Minutos activos por día" />
            </section>
            <section className="card space-y-2 p-5">
              <h2 className="font-extrabold text-brand-800">Errores por día (%)</h2>
              <LineChart values={m.errDay} labels={m.labels} unit="%" label="Porcentaje de errores por día" />
            </section>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmClear}
        title="Borrar métricas"
        message="Se eliminarán todos los eventos de uso guardados en este dispositivo. Tus pacientes y citas no se tocan."
        confirmLabel="Borrar métricas"
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await clear();
          toast.info('Métricas borradas');
        }}
      />
    </div>
  );
}
