import { vi } from 'vitest';

/** Mocks compartidos de Firestore para tests de componentes que usan el store real (useData / useProfile). */
export const fs = {
  addDoc: vi.fn(async (..._a: unknown[]) => ({ id: 'new-id' })),
  updateDoc: vi.fn(async (..._a: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._a: unknown[]) => undefined),
  /** Operaciones de cada writeBatch: batchDelete se llama por cada ref; batchCommit una vez por lote. */
  batchDelete: vi.fn((..._a: unknown[]) => undefined),
  batchCommit: vi.fn(async () => undefined),
};

export const firestoreModule = () => ({
  addDoc: fs.addDoc,
  updateDoc: fs.updateDoc,
  deleteDoc: fs.deleteDoc,
  writeBatch: vi.fn(() => ({ delete: fs.batchDelete, commit: fs.batchCommit })),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ name, id })),
  query: vi.fn((c: unknown) => c),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
});
