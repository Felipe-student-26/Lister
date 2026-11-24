import { create } from 'zustand';
import { openLake, type Lake, type MetricEvent, type ModuleKey } from '../lib/lake';

const RETENTION_MS = 90 * 24 * 3600 * 1000;
const MAX_IN_MEMORY = 20_000;

export function moduleOfPath(path: string): ModuleKey {
  if (path === '/' || path === '') return 'agenda';
  if (path.startsWith('/clientes')) return 'pacientes';
  if (path.startsWith('/metricas')) return 'metricas';
  return 'otros';
}

interface MetricsState {
  ready: boolean;
  sessionId: string;
  events: MetricEvent[];
  start: (ownerId: string) => Promise<void>;
  stop: () => void;
  /** Registra un evento: actualiza el estado (tiempo real) y lo guarda en IndexedDB. */
  track: (e: Omit<MetricEvent, 'ts' | 'sessionId'>) => void;
  clear: () => Promise<void>;
}

let lake: Lake | null = null;
let generation = 0; // invalida start() asíncronos que quedaron atrás (StrictMode / logout rápido)
const newSessionId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useMetrics = create<MetricsState>((set, get) => ({
  ready: false,
  sessionId: newSessionId(),
  events: [],

  start: async (ownerId) => {
    get().stop();
    const mine = generation;
    lake = openLake(ownerId);
    const sessionId = newSessionId();
    set({ sessionId, ready: false, events: [] });
    try {
      await lake.prune(Date.now() - RETENTION_MS);
      const stored = await lake.all(Date.now() - RETENTION_MS);
      if (mine === generation) set({ events: stored.slice(-MAX_IN_MEMORY) });
    } catch {
      /* IndexedDB no disponible: se sigue en memoria */
    }
    if (mine !== generation) return; // otro start/stop ocurrió mientras se leía
    set({ ready: true });
    get().track({ type: 'session_start' });
  },

  stop: () => {
    generation += 1;
    lake = null;
    set({ ready: false, events: [] });
  },

  track: (e) => {
    const ev: MetricEvent = { ...e, ts: Date.now(), sessionId: get().sessionId };
    set((s) => ({ events: [...s.events.slice(-(MAX_IN_MEMORY - 1)), ev] }));
    lake?.add(ev).catch(() => undefined);
  },

  clear: async () => {
    await lake?.clear();
    set({ events: [] });
  },
}));

/** Atajos para registrar operaciones desde stores y páginas (nunca lanzan). */
export const metrics = {
  attempt: (kind: 'sync' | 'save', name: string) => useMetrics.getState().track({ type: 'op_attempt', kind, name }),
  fail: (kind: 'sync' | 'save', name: string) => useMetrics.getState().track({ type: 'op_fail', kind, name }),
  route: (path: string) => useMetrics.getState().track({ type: 'route', path, module: moduleOfPath(path) }),
  page: (module: ModuleKey, action: string) => useMetrics.getState().track({ type: 'page', module, name: action }),
};

/** Ejecuta una operación contando intento y fallo (el intento se cuenta al empezar: sirve también sin conexión). */
export async function tracked<T>(kind: 'sync' | 'save', name: string, fn: () => Promise<T>): Promise<T> {
  metrics.attempt(kind, name);
  try {
    return await fn();
  } catch (err) {
    metrics.fail(kind, name);
    throw err;
  }
}
