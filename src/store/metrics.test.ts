import { beforeEach, describe, expect, it } from 'vitest';
import { errorRate, moduleUsage, sessionMinutes } from '../lib/metrics';
import { metrics, moduleOfPath, tracked, useMetrics } from './metrics';

beforeEach(async () => {
  await useMetrics.getState().start('owner-test');
  await useMetrics.getState().clear();
});

describe('store de métricas', () => {
  it('mapea rutas a módulos', () => {
    expect(moduleOfPath('/')).toBe('agenda');
    expect(moduleOfPath('/clientes/abc')).toBe('pacientes');
    expect(moduleOfPath('/metricas')).toBe('metricas');
    expect(moduleOfPath('/otra')).toBe('otros');
  });

  it('registra eventos en tiempo real y los persiste en el lake', async () => {
    metrics.route('/');
    metrics.route('/clientes');
    useMetrics.getState().track({ type: 'active', seconds: 60 });
    const { events } = useMetrics.getState();
    expect(events).toHaveLength(3);
    expect(moduleUsage(events).total).toBe(2);
    expect(sessionMinutes(events)[0].minutes).toBe(1);

    // reiniciar = reabrir el lake: lo guardado sigue ahí
    await new Promise((r) => setTimeout(r, 0));
    await useMetrics.getState().start('owner-test');
    expect(useMetrics.getState().events.filter((e) => e.type === 'route')).toHaveLength(2);
  });

  it('tracked cuenta intento y fallo, y relanza el error', async () => {
    await tracked('save', 'ok', async () => 1);
    await expect(
      tracked('save', 'mal', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(errorRate(useMetrics.getState().events).pct).toBe(50);
  });
});
