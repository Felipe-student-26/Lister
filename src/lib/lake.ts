/**
 * "Data lake" local: eventos de uso/errores guardados en IndexedDB.
 * Un archivo por propietaria (nombre de BD con uid). Si IndexedDB no existe
 * (tests en node, navegadores restringidos) cae a memoria sin romper la app.
 */
export type ModuleKey = 'agenda' | 'pacientes' | 'metricas' | 'otros';
export type EventType = 'session_start' | 'active' | 'route' | 'op_attempt' | 'op_fail' | 'page';

export interface MetricEvent {
  id?: number;
  ts: number;
  sessionId: string;
  type: EventType;
  /** segundos activos (type = active) */
  seconds?: number;
  module?: ModuleKey;
  path?: string;
  /** 'sync' = sincronización, 'save' = guardado (type = op_*) */
  kind?: 'sync' | 'save';
  name?: string;
}

export interface Lake {
  add: (e: MetricEvent) => Promise<void>;
  all: (sinceTs?: number) => Promise<MetricEvent[]>;
  clear: () => Promise<void>;
  prune: (beforeTs: number) => Promise<void>;
}

const STORE = 'events';

function memoryLake(): Lake {
  let rows: MetricEvent[] = [];
  let seq = 0;
  return {
    add: async (e) => void rows.push({ ...e, id: ++seq }),
    all: async (since = 0) => rows.filter((r) => r.ts >= since).map((r) => ({ ...r })),
    clear: async () => void (rows = []),
    prune: async (before) => void (rows = rows.filter((r) => r.ts >= before)),
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function idbLake(dbName: string): Lake {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('ts', 'ts');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    add: async (e) => void (await req((await store('readwrite')).add(e))),
    all: async (since = 0) =>
      req((await store('readonly')).index('ts').getAll(IDBKeyRange.lowerBound(since))) as Promise<MetricEvent[]>,
    clear: async () => void (await req((await store('readwrite')).clear())),
    prune: async (before) => {
      const s = await store('readwrite');
      // índice por ts: borra con cursor todo lo anterior a `before`
      await new Promise<void>((res, rej) => {
        const c = s.index('ts').openCursor(IDBKeyRange.upperBound(before, true));
        c.onsuccess = () => {
          const cur = c.result;
          if (!cur) return res();
          cur.delete();
          cur.continue();
        };
        c.onerror = () => rej(c.error);
      });
    },
  };
}

const memoryLakes = new Map<string, Lake>();

export function openLake(ownerId: string): Lake {
  if (typeof indexedDB !== 'undefined') return idbLake(`lister-lake-${ownerId}`);
  if (!memoryLakes.has(ownerId)) memoryLakes.set(ownerId, memoryLake());
  return memoryLakes.get(ownerId)!;
}
