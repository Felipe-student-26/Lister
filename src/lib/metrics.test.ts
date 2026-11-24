import { describe, expect, it } from 'vitest';
import type { MetricEvent } from './lake';
import { dailyErrorRate, errorRate, mean, median, moduleUsage, sessionMinutes, summarize, trend } from './metrics';

const ev = (over: Partial<MetricEvent>): MetricEvent => ({ ts: 1_700_000_000_000, sessionId: 's1', type: 'route', ...over });

describe('estadística', () => {
  it('media y mediana (par, impar y vacío)', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('detecta valores nulos y NaN sin contaminar la media', () => {
    const s = summarize([10, null, 20, NaN, 30]);
    expect(s.nulls).toBe(2);
    expect(s.nullIdx).toEqual([1, 3]);
    expect(s.mean).toBe(20);
    expect(s.median).toBe(20);
  });

  it('tendencia sube / baja / estable / sin datos', () => {
    expect(trend([1, 2, 3, 4, 5]).dir).toBe('sube');
    expect(trend([5, 4, 3, 2, 1]).dir).toBe('baja');
    expect(trend([5, 5, 5, 5]).dir).toBe('estable');
    expect(trend([1, null, 2]).dir).toBe('sin_datos');
    expect(trend([1, null, 2, null, 3, 4]).dir).toBe('sube');
  });
});

describe('KPIs', () => {
  it('tiempo activo por sesión (minutos)', () => {
    const r = sessionMinutes([
      ev({ type: 'session_start' }),
      ev({ type: 'active', seconds: 30 }),
      ev({ type: 'active', seconds: 90 }),
      ev({ sessionId: 's2', type: 'active', seconds: 60, ts: 1_700_000_100_000 }),
    ]);
    expect(r.map((x) => x.minutes)).toEqual([2, 1]);
  });

  it('uso por módulo en %', () => {
    const { total, rows } = moduleUsage([
      ev({ module: 'agenda' }),
      ev({ module: 'agenda' }),
      ev({ module: 'pacientes' }),
      ev({ module: 'metricas' }),
    ]);
    expect(total).toBe(4);
    expect(rows.find((r) => r.module === 'agenda')!.pct).toBe(50);
    expect(rows.find((r) => r.module === 'pacientes')!.pct).toBe(25);
    expect(moduleUsage([]).rows[0].pct).toBeNull();
  });

  it('errores = fallos / operaciones intentadas', () => {
    const events = [
      ev({ type: 'op_attempt', kind: 'save' }),
      ev({ type: 'op_attempt', kind: 'save' }),
      ev({ type: 'op_attempt', kind: 'sync' }),
      ev({ type: 'op_attempt', kind: 'sync' }),
      ev({ type: 'op_fail', kind: 'sync' }),
    ];
    expect(errorRate(events).pct).toBe(25);
    expect(errorRate(events, 'save').pct).toBe(0);
    expect(errorRate(events, 'sync').pct).toBe(50);
    expect(errorRate([]).pct).toBeNull();
  });

  it('días sin operaciones quedan como nulos', () => {
    const day = new Date(1_700_000_000_000);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    expect(dailyErrorRate([ev({ type: 'op_attempt', kind: 'save' })], [iso, '2000-01-01'])).toEqual([0, null]);
  });
});
