import type { MetricEvent, ModuleKey } from './lake';
import { todayISO } from './validation';

export type Num = number | null;

export function mean(v: number[]): Num {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function median(v: number[]): Num {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Summary {
  mean: Num;
  median: Num;
  /** valores válidos usados en el cálculo */
  count: number;
  /** valores nulos / NaN detectados en la serie */
  nulls: number;
  /** posiciones de los nulos (para marcar huecos en los gráficos) */
  nullIdx: number[];
}

/** Resume una serie ignorando (y reportando) nulos, undefined y NaN. */
export function summarize(series: Num[]): Summary {
  const nullIdx: number[] = [];
  const valid: number[] = [];
  series.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) nullIdx.push(i);
    else valid.push(v);
  });
  return { mean: mean(valid), median: median(valid), count: valid.length, nulls: nullIdx.length, nullIdx };
}

export type TrendDir = 'sube' | 'baja' | 'estable' | 'sin_datos';

/** Tendencia por regresión lineal sobre los puntos válidos (cambio relativo total > 10% = sube/baja). */
export function trend(series: Num[]): { dir: TrendDir; slope: number } {
  const pts = series
    .map((v, i) => [i, v] as const)
    .filter((p): p is readonly [number, number] => p[1] !== null && !Number.isNaN(p[1]));
  if (pts.length < 3) return { dir: 'sin_datos', slope: 0 };
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const avg = sy / n;
  const span = pts[n - 1][0] - pts[0][0];
  const change = Math.abs(avg) < 1e-9 ? Math.abs(slope * span) : Math.abs((slope * span) / avg);
  if (change < 0.1) return { dir: 'estable', slope };
  return { dir: slope > 0 ? 'sube' : 'baja', slope };
}

/** Últimos `n` días (ISO, el más antiguo primero). */
export function dayKeys(n: number, now: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) =>
    todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))),
  );
}

export interface SessionMinutes {
  sessionId: string;
  start: number;
  minutes: number;
}

/** Tiempo activo = minutos totales de uso por sesión. */
export function sessionMinutes(events: MetricEvent[]): SessionMinutes[] {
  const map = new Map<string, SessionMinutes>();
  for (const e of events) {
    const s = map.get(e.sessionId) ?? { sessionId: e.sessionId, start: e.ts, minutes: 0 };
    s.start = Math.min(s.start, e.ts);
    if (e.type === 'active') s.minutes += (e.seconds ?? 0) / 60;
    map.set(e.sessionId, s);
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

export interface ModuleUsage {
  module: ModuleKey;
  count: number;
  /** % sobre el total de accesos (null si no hay accesos) */
  pct: Num;
}

/** Uso por módulo = accesos a agenda o pacientes / total de accesos (%). */
export function moduleUsage(events: MetricEvent[]): { total: number; rows: ModuleUsage[] } {
  const routes = events.filter((e) => e.type === 'route');
  const total = routes.length;
  const rows = (['agenda', 'pacientes', 'metricas', 'otros'] as ModuleKey[]).map((module) => {
    const count = routes.filter((e) => (e.module ?? 'otros') === module).length;
    return { module, count, pct: total ? (count / total) * 100 : null };
  });
  return { total, rows };
}

export interface ErrorRate {
  attempts: number;
  failures: number;
  /** Errores = fallos de sincronización o guardado / operaciones intentadas (%) */
  pct: Num;
}

export function errorRate(events: MetricEvent[], kind?: 'sync' | 'save'): ErrorRate {
  const ops = events.filter((e) => (e.type === 'op_attempt' || e.type === 'op_fail') && (!kind || e.kind === kind));
  const attempts = ops.filter((e) => e.type === 'op_attempt').length;
  const failures = ops.filter((e) => e.type === 'op_fail').length;
  // Un fallo sin intento registrado (p. ej. error repetido del listener) cuenta como intento.
  const denom = Math.max(attempts, failures);
  return { attempts: denom, failures, pct: denom ? (failures / denom) * 100 : null };
}

const dayOf = (ts: number) => todayISO(new Date(ts));

/** Minutos activos por día; null si ese día no hubo uso. */
export function dailyMinutes(events: MetricEvent[], days: string[]): Num[] {
  return days.map((d) => {
    const secs = events.filter((e) => e.type === 'active' && dayOf(e.ts) === d).reduce((a, e) => a + (e.seconds ?? 0), 0);
    return secs > 0 ? secs / 60 : null;
  });
}

/** % de errores por día; null si no hubo operaciones. */
export function dailyErrorRate(events: MetricEvent[], days: string[]): Num[] {
  return days.map((d) => errorRate(events.filter((e) => dayOf(e.ts) === d)).pct);
}
