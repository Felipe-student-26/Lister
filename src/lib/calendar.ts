import { todayISO } from './validation';

export const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Cabecera de la rejilla: semana de domingo a sábado. */
export const WEEKDAYS_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface CalendarDay {
  /** YYYY-MM-DD (hora local). */
  iso: string;
  day: number;
  /** false = día de un mes vecino que solo completa la semana. */
  inMonth: boolean;
}

/**
 * Rejilla de un mes (domingo a sábado): 5 o 6 semanas completas.
 * `month` va de 0 (enero) a 11 (diciembre).
 */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const lead = first.getDay(); // 0 = domingo
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const out: CalendarDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(year, month, 1 - lead + i);
    out.push({ iso: todayISO(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return out;
}

/** Mes anterior/siguiente (delta ±1, también cruza de año). */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** "sábado, 14 de noviembre de 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
