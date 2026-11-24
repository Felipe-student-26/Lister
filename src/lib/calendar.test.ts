import { describe, expect, it } from 'vitest';
import { capitalize, longDate, monthGrid, shiftMonth } from './calendar';

describe('monthGrid', () => {
  it('octubre de 2026 empieza en jueves: 4 días de septiembre, 31 de octubre, 5 semanas', () => {
    const g = monthGrid(2026, 9);
    expect(g).toHaveLength(35);
    expect(g[0]).toEqual({ iso: '2026-09-27', day: 27, inMonth: false });
    expect(g[4]).toEqual({ iso: '2026-10-01', day: 1, inMonth: true });
    expect(g[34]).toEqual({ iso: '2026-10-31', day: 31, inMonth: true });
  });

  it('un mes que ocupa 6 semanas devuelve 42 celdas (agosto de 2026 empieza en sábado)', () => {
    const g = monthGrid(2026, 7);
    expect(g).toHaveLength(42);
    expect(g[6].iso).toBe('2026-08-01');
    expect(g[41].inMonth).toBe(false);
  });

  it('febrero de 2026 (empieza en domingo, 28 días) ocupa exactamente 4 semanas', () => {
    const g = monthGrid(2026, 1);
    expect(g).toHaveLength(28);
    expect(g.every((d) => d.inMonth)).toBe(true);
  });

  it('año bisiesto: febrero de 2028 tiene el día 29', () => {
    expect(monthGrid(2028, 1).some((d) => d.iso === '2028-02-29')).toBe(true);
  });

  it('cada semana empieza en domingo', () => {
    for (let i = 0; i < 12; i++) {
      const g = monthGrid(2026, i);
      const [y, m, d] = g[0].iso.split('-').map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(0);
    }
  });
});

describe('shiftMonth', () => {
  it('cruza de año en ambos sentidos', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
  });
});

describe('textos', () => {
  it('capitalize y longDate', () => {
    expect(capitalize('octubre')).toBe('Octubre');
    expect(capitalize('')).toBe('');
    expect(longDate('2026-10-31')).toContain('31 de octubre de 2026');
  });
});
