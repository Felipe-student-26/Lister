import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore simulado: addDoc/updateDoc controlables, onSnapshot no emite.
const fs = vi.hoisted(() => ({
  addDoc: vi.fn(async () => ({ id: 'new-id' })),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  batchDelete: vi.fn((..._a: unknown[]) => undefined),
  batchCommit: vi.fn(async () => undefined),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: fs.addDoc,
  updateDoc: fs.updateDoc,
  deleteDoc: fs.deleteDoc,
  writeBatch: vi.fn(() => ({ delete: fs.batchDelete, commit: fs.batchCommit })),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ name, id })),
  query: vi.fn((c: unknown) => c),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

import { MAX_BATCH_OPS, useData } from './data';
import { useMetrics } from './metrics';
import { errorRate } from '../lib/metrics';
import { useToast } from './toast';
import { useProfile } from './profile';

beforeEach(async () => {
  vi.clearAllMocks();
  await useMetrics.getState().start('owner-data-test');
  await useMetrics.getState().clear();
  useData.setState({ ownerId: 'u1', clients: [{ id: 'c1', fullName: 'Ana' } as never], appointments: [] });
  useToast.setState({ toasts: [] });
  useProfile.setState({ role: 'therapist', ownerId: 'u1', ready: true });
});

describe('store de datos (Firestore simulado)', () => {
  it('addClient escribe con ownerId y registra el guardado', async () => {
    const id = await useData.getState().addClient({ fullName: 'Luz', phone: '', email: '', birthDate: '', generalInfo: '' });
    expect(id).toBe('new-id');
    expect(fs.addDoc).toHaveBeenCalledWith({ name: 'clients' }, expect.objectContaining({ ownerId: 'u1', fullName: 'Luz' }));
    expect(errorRate(useMetrics.getState().events)).toMatchObject({ attempts: 1, failures: 0 });
  });

  it('rechaza una reserva en fecha pasada sin escribir', async () => {
    const ok = await useData.getState().bookAppointment({ clientId: 'c1', date: '2000-01-01', time: '10:00' });
    expect(ok).toBe(false);
    expect(fs.addDoc).not.toHaveBeenCalled();
    expect(useToast.getState().toasts[0].kind).toBe('error');
  });

  it('un fallo de guardado cuenta como error en las métricas', async () => {
    fs.updateDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(useData.getState().setAppointmentStatus('a1', 'cancelada')).rejects.toThrow('offline');
    expect(errorRate(useMetrics.getState().events, 'save')).toMatchObject({ attempts: 1, failures: 1, pct: 100 });
  });

  it('el administrador de la plataforma no elimina datos clínicos (no toca Firestore)', async () => {
    useProfile.setState({ role: 'admin' });
    await expect(useData.getState().deleteClient('c1')).rejects.toThrow('terapeuta');
    await expect(useData.getState().deleteObservation('o1')).rejects.toThrow('terapeuta');
    expect(fs.deleteDoc).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
  });

  it('sin rol (sin acceso) tampoco puede eliminar', async () => {
    useProfile.setState({ role: null });
    await expect(useData.getState().deleteClient('c1')).rejects.toThrow('terapeuta');
    expect(fs.deleteDoc).not.toHaveBeenCalled();
    expect(fs.batchCommit).not.toHaveBeenCalled();
  });

  it('la terapeuta sí puede eliminar', async () => {
    await useData.getState().deleteObservation('o1');
    expect(fs.deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('la terapeuta puede crear y editar', async () => {
    await useData.getState().updateClient('c1', { fullName: 'Ana M.' });
    expect(fs.updateDoc).toHaveBeenCalled();
  });
});

describe('crear, editar y eliminar pacientes', () => {
  const appt = (id: string, clientId: string, over: object = {}) => ({ id, clientId, date: '2999-01-01', time: '10:00', status: 'programada', ...over }) as never;
  const seed = () =>
    useData.setState({
      clients: [{ id: 'c1', fullName: 'Ana' }, { id: 'c2', fullName: 'Luz' }] as never,
      appointments: [appt('a1', 'c1'), appt('a2', 'c1', { seriesId: 's1' }), appt('a3', 'c1', { seriesId: 's1', status: 'cancelada' }), appt('a4', 'c2', { seriesId: 's2' })],
      sessions: [{ id: 's-1', clientId: 'c1' }, { id: 's-2', clientId: 'c2' }] as never,
      observations: [{ id: 'o-1', clientId: 'c1' }, { id: 'o-2', clientId: 'c2' }] as never,
    });
  const deleted = () => fs.batchDelete.mock.calls.map((c) => c[0] as { name: string; id: string });

  it('eliminar en cascada: un solo lote con las citas (también de series y canceladas), sesiones y observaciones del paciente, y el paciente al final', async () => {
    seed();
    await useData.getState().deleteClient('c1');
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    expect(deleted()).toEqual([
      { name: 'appointments', id: 'a1' },
      { name: 'appointments', id: 'a2' },
      { name: 'appointments', id: 'a3' },
      { name: 'sessions', id: 's-1' },
      { name: 'observations', id: 'o-1' },
      { name: 'clients', id: 'c1' },
    ]);
    expect(fs.deleteDoc).not.toHaveBeenCalled(); // nada fuera del lote
  });

  it('no toca los datos de otros pacientes', async () => {
    seed();
    await useData.getState().deleteClient('c1');
    const ids = deleted().map((d) => d.id);
    for (const other of ['a4', 's-2', 'o-2', 'c2']) expect(ids).not.toContain(other);
  });

  it('un paciente sin nada asociado solo borra su documento', async () => {
    seed();
    await useData.getState().deleteClient('c9');
    expect(deleted()).toEqual([{ name: 'clients', id: 'c9' }]);
  });

  it('si superan las 500 operaciones de Firestore se divide en lotes y el paciente va en el último', async () => {
    useData.setState({
      appointments: Array.from({ length: MAX_BATCH_OPS + 100 }, (_, i) => appt(`a${i}`, 'c1')),
      sessions: [],
      observations: [],
    });
    await useData.getState().deleteClient('c1');
    expect(fs.batchCommit).toHaveBeenCalledTimes(2);
    expect(fs.batchDelete).toHaveBeenCalledTimes(MAX_BATCH_OPS + 101);
    expect(deleted()[deleted().length - 1]).toEqual({ name: 'clients', id: 'c1' });
  });

  it('si el lote falla: lanza el error, no sigue con otros lotes y cuenta un fallo de guardado', async () => {
    seed();
    fs.batchCommit.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(useData.getState().deleteClient('c1')).rejects.toThrow('permission-denied');
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
    expect(errorRate(useMetrics.getState().events, 'save')).toMatchObject({ attempts: 1, failures: 1 });
  });

  it('eliminar se registra en las métricas igual que el resto de acciones', async () => {
    seed();
    await useData.getState().deleteClient('c1');
    const ev = useMetrics.getState().events.filter((e) => e.type === 'op_attempt');
    expect(ev.map((e) => e.name)).toContain('deleteClient');
    expect(errorRate(useMetrics.getState().events, 'save')).toMatchObject({ attempts: 1, failures: 0 });
  });

  it('crear: un fallo de guardado lanza el error y cuenta como fallo', async () => {
    fs.addDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(useData.getState().addClient({ fullName: 'Luz', phone: '', email: '', birthDate: '', generalInfo: '' })).rejects.toThrow('offline');
    expect(errorRate(useMetrics.getState().events, 'save')).toMatchObject({ attempts: 1, failures: 1 });
  });

  it('editar: escribe solo los campos enviados más updatedAt, y un fallo cuenta como error', async () => {
    await useData.getState().updateClient('c1', { phone: '300' });
    expect(fs.updateDoc).toHaveBeenCalledWith({ name: 'clients', id: 'c1' }, expect.objectContaining({ phone: '300', updatedAt: expect.any(Number) }));
    fs.updateDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(useData.getState().updateClient('c1', { phone: '1' })).rejects.toThrow('offline');
    expect(errorRate(useMetrics.getState().events, 'save')).toMatchObject({ attempts: 2, failures: 1 });
  });
});
