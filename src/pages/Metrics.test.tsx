// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MetricEvent } from '../lib/lake';

vi.mock('firebase/firestore', async () => (await import('../test/firestoreMock')).firestoreModule());
vi.mock('../lib/firebase', () => ({ db: {} }));

import Metrics from './Metrics';
import { useMetrics } from '../store/metrics';
import { useProfile, type Role } from '../store/profile';

const now = Date.now();
const ev = (e: Partial<MetricEvent> & Pick<MetricEvent, 'type'>): MetricEvent => ({ ts: now, sessionId: 's1', ...e });

function setup(events: MetricEvent[], opts: { ready?: boolean; role?: Role } = {}) {
  useProfile.setState({ role: opts.role ?? 'therapist', ownerId: 'u1', ready: true });
  useMetrics.setState({ ready: opts.ready ?? true, events });
  return render(<Metrics />);
}

beforeEach(() => {
  useMetrics.setState({ ready: true, events: [] });
});

describe('Metrics', () => {
  it('estado vacío: sin eventos muestra la guía y ningún KPI', () => {
    setup([]);
    expect(screen.getByText('Todavía no hay datos')).toBeTruthy();
    expect(screen.queryByText('Tiempo activo por sesión')).toBeNull();
  });

  it('mientras carga el lake no muestra el estado vacío', () => {
    setup([], { ready: false });
    expect(screen.queryByText('Todavía no hay datos')).toBeNull();
  });

  it('KPIs: tiempo activo, uso agenda+pacientes y tasa de errores', () => {
    setup([
      ev({ type: 'session_start' }),
      ev({ type: 'active', seconds: 120 }),
      ev({ type: 'route', module: 'agenda', path: '/' }),
      ev({ type: 'route', module: 'agenda', path: '/' }),
      ev({ type: 'route', module: 'agenda', path: '/' }),
      ev({ type: 'route', module: 'pacientes', path: '/clientes' }),
      ...Array.from({ length: 4 }, () => ev({ type: 'op_attempt', kind: 'save' as const, name: 'x' })),
      ev({ type: 'op_fail', kind: 'save', name: 'x' }),
    ]);
    expect(screen.getByText('Tiempo activo por sesión')).toBeTruthy();
    expect(screen.getByText('Uso agenda + pacientes')).toBeTruthy();
    expect(screen.getByText('Errores')).toBeTruthy();
    expect(screen.getByText(/1 fallos \/ 4 operaciones/)).toBeTruthy();
    expect(screen.getByText('4 accesos')).toBeTruthy();
    expect(screen.getByText('1 sesiones registradas')).toBeTruthy();
  });

  it('nulos: los días sin uso ni operaciones se reportan como huecos, no como cero', () => {
    setup([ev({ type: 'session_start' }), ev({ type: 'active', seconds: 60 }), ev({ type: 'route', module: 'agenda', path: '/' })]);
    expect(screen.getByText(/Valores nulos detectados/)).toBeTruthy();
    expect(screen.getByText(/13 de 14 días sin tiempo de uso/)).toBeTruthy();
    expect(screen.getByText(/14 sin operaciones/)).toBeTruthy();
    // sin operaciones registradas la tasa de errores no es 0 %: es "—"
    expect(screen.getByText(/0 fallos \/ 0 operaciones/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('series con pocos puntos muestran "Datos insuficientes" en la tendencia', () => {
    setup([ev({ type: 'session_start' }), ev({ type: 'route', module: 'agenda', path: '/' })]);
    expect(screen.getAllByText('Datos insuficientes').length).toBeGreaterThan(0);
  });

  it('la terapeuta puede borrar sus métricas', () => {
    setup([ev({ type: 'session_start' })], { role: 'therapist' });
    expect(screen.getByRole('button', { name: 'Borrar datos de métricas' })).toBeTruthy();
  });
});
