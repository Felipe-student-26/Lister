// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import ClientHistoryPrint, { fullDate, printFileTitle, shortDate } from './ClientHistoryPrint';
import ListerLogo from './ListerLogo';
import type { SessionRecord } from '../lib/types';

const client = { fullName: 'Ana Pérez', phone: '300 111 2233', email: 'ana@correo.com', birthDate: '1990-03-07', generalInfo: 'Ansiedad laboral.' };
const ses = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', ownerId: 'u', clientId: 'c1', appointmentId: 'a1', date: '2026-11-12', createdAt: 1, updatedAt: 1,
  sessionNotes: 'Notas de hoy', proposedGoals: 'Objetivo A', agreedTargets: 'Meta B', progressOnPrevious: '', stateVsPrevious: 'mejor', stateComment: '',
  ...over,
});

describe('ClientHistoryPrint', () => {
  it('muestra el logo, el título, los datos del paciente y el profesional', () => {
    render(<ClientHistoryPrint client={client} sessions={[ses()]} therapist={{ fullName: 'Laura Gómez', specialty: 'Psicología', licenseNumber: '123' }} generatedAt={new Date(2026, 10, 15)} />);
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getByRole('img', { name: 'Lister' })).toBeTruthy();
    expect(within(sheet).getByRole('heading', { level: 1, name: 'Historial del paciente' })).toBeTruthy();
    expect(within(sheet).getByRole('heading', { name: 'Ana Pérez' })).toBeTruthy();
    expect(sheet.textContent).toContain('7 de marzo de 1990');
    expect(sheet.textContent).toContain('300 111 2233');
    expect(sheet.textContent).toContain('ana@correo.com');
    expect(sheet.textContent).toContain('Ansiedad laboral.');
    expect(sheet.textContent).toContain('Laura Gómez · Psicología · Reg. 123');
    expect(sheet.textContent).toContain('Generado el 15 de noviembre de 2026');
  });

  it('resume las consultas: cantidad, primera, última y estados', () => {
    const sessions = [ses({ id: '1', date: '2026-11-12', stateVsPrevious: 'mejor' }), ses({ id: '2', date: '2026-10-01', stateVsPrevious: 'peor' }), ses({ id: '3', date: '2026-10-20', stateVsPrevious: 'igual' }), ses({ id: '4', date: '2026-10-27', stateVsPrevious: 'mejor' })];
    render(<ClientHistoryPrint client={client} sessions={sessions} />);
    const summary = screen.getByLabelText('Resumen');
    expect(summary.textContent).toContain('4consultas');
    expect(summary.textContent).toContain('1 de octubre de 2026primera consulta');
    expect(summary.textContent).toContain('12 de noviembre de 2026última consulta');
    expect(summary.textContent).toContain('2 · 1 · 1');
  });

  it('cada consulta lleva su fecha larga, su estado y solo los campos que tienen contenido', () => {
    render(<ClientHistoryPrint client={client} sessions={[ses({ progressOnPrevious: '', stateComment: 'Más tranquila' })]} />);
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getByRole('heading', { level: 3, name: 'Jueves, 12 de noviembre de 2026' })).toBeTruthy();
    expect(sheet.textContent).toContain('Estado: Mejor');
    expect(sheet.textContent).toContain('Notas de la consulta');
    expect(sheet.textContent).toContain('Notas de hoy');
    expect(sheet.textContent).toContain('Comentario del estado');
    expect(sheet.textContent).toContain('Más tranquila');
    expect(sheet.textContent).not.toContain('Avances en objetivos anteriores'); // vacío: no se imprime
  });

  it('sin teléfono, correo ni fecha de nacimiento pone un guion y no inventa información', () => {
    render(<ClientHistoryPrint client={{ ...client, phone: '', email: '', birthDate: '', generalInfo: '  ' }} sessions={[ses()]} />);
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getAllByText('—')).toHaveLength(3);
    expect(sheet.textContent).not.toContain('Información general');
    expect(sheet.textContent).not.toContain('Profesional');
  });
});

describe('ListerLogo', () => {
  it('es "Liste" + una r dibujada con una flecha hacia abajo', () => {
    const { container } = render(<ListerLogo />);
    expect(screen.getByRole('img', { name: 'Lister' })).toBeTruthy();
    expect(container.textContent).toBe('Liste');
    const paths = container.querySelectorAll('svg.lister-logo-r path');
    expect(paths.length).toBe(3); // arco, palo y punta de flecha
  });
});

describe('formato de fechas y nombre del archivo', () => {
  it('shortDate y fullDate no se corren un día (sin pasar por UTC)', () => {
    expect(shortDate('2026-01-01')).toBe('1 de enero de 2026');
    expect(fullDate('2026-11-12')).toBe('Jueves, 12 de noviembre de 2026');
    expect(shortDate('no-es-fecha')).toBe('no-es-fecha');
  });

  it('el título sugerido del PDF no trae caracteres que los sistemas de archivos rechazan', () => {
    expect(printFileTitle('Ana Pérez')).toBe('Historial - Ana Pérez');
    expect(printFileTitle('A/B: "C"?')).toBe('Historial - A B C');
  });
});

describe('hoja de estilos de impresión', () => {
  const css = readFileSync('src/components/ClientHistoryPrint.css', 'utf8');
  it('el documento está oculto en pantalla y al imprimir se oculta la app', () => {
    expect(css).toMatch(/^\.lp-root\s*\{\s*display:\s*none;/m);
    expect(css).toMatch(/@media print[\s\S]*body > #root\s*\{\s*display:\s*none !important/);
  });
  it('títulos y contenido en Arial; solo el logo Lister conserva la fuente bubble', () => {
    expect(css).toMatch(/\.lp-title,[\s\S]*?\{[^}]*font-family:\s*Arial/);
    expect(css).not.toMatch(/\.lp-title,[\s\S]*?\{[^}]*Bubblegum/);
    expect(css).toMatch(/\.lp-root\s*\{[^}]*font-family:\s*Arial/);
    expect(css).toMatch(/\.lp-footer-brand\s*\{[^}]*Bubblegum Sans/);
  });
  it('fuerza imprimir los colores de fondo (los detalles rosados)', () => {
    expect(css).toContain('print-color-adjust: exact');
  });
});
