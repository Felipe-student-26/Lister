import { describe, expect, it } from 'vitest';
import { clientImpact, emptyTherapistProfile, hasConflict, isDateBookable, passwordIssues, validateBooking, validateTherapistProfile } from './validation';
import type { Appointment } from './types';

const now = new Date(2026, 10, 10, 14, 0); // 2026-11-10

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  ownerId: 'u',
  clientId: 'c1',
  clientName: 'Ana',
  date: '2026-11-12',
  time: '10:00',
  status: 'programada',
  createdAt: 0,
  ...over,
});

describe('reservas', () => {
  it('permite hoy y fechas futuras, rechaza pasadas', () => {
    expect(isDateBookable('2026-11-10', now)).toBe(true);
    expect(isDateBookable('2026-11-11', now)).toBe(true);
    expect(isDateBookable('2026-11-09', now)).toBe(false);
  });

  it('detecta cruce de horario', () => {
    expect(hasConflict([appt()], '2026-11-12', '10:00')).toBe(true);
    expect(hasConflict([appt()], '2026-11-12', '11:00')).toBe(false);
  });

  it('una cita cancelada libera el horario', () => {
    expect(hasConflict([appt({ status: 'cancelada' })], '2026-11-12', '10:00')).toBe(false);
  });

  it('al editar se ignora la propia cita', () => {
    expect(hasConflict([appt()], '2026-11-12', '10:00', 'a1')).toBe(false);
  });

  it('validateBooking devuelve el error correcto', () => {
    const input = { clientId: 'c1', date: '2026-11-12', time: '10:00' };
    expect(validateBooking([appt()], input, now)).toBe('horario_ocupado');
    expect(validateBooking([], { ...input, date: '2026-11-01' }, now)).toBe('fecha_pasada');
    expect(validateBooking([], { ...input, clientId: '' }, now)).toBe('datos_incompletos');
    expect(validateBooking([], input, now)).toBeNull();
  });
});

describe('contraseña', () => {
  it('rechaza débiles y acepta fuertes', () => {
    expect(passwordIssues('abc').length).toBeGreaterThan(0);
    expect(passwordIssues('Terapia#2026ok')).toEqual([]);
  });
});

describe('validateTherapistProfile', () => {
  const ok = { ...emptyTherapistProfile(), fullName: 'Luz Gómez', email: 'luz@correo.com' };
  it('solo nombre y correo son obligatorios', () => {
    expect(validateTherapistProfile(ok, now)).toEqual({});
    expect(validateTherapistProfile(emptyTherapistProfile(), now)).toEqual({ fullName: 'Escribe el nombre completo', email: 'Escribe el correo' });
  });
  it('los opcionales, si se llenan, deben ser válidos', () => {
    const e = validateTherapistProfile({ ...ok, email: 'x', phone: '12', birthDate: '2030-01-01', yearsExperience: 'ocho' }, now);
    expect(Object.keys(e).sort()).toEqual(['birthDate', 'email', 'phone', 'yearsExperience']);
    expect(validateTherapistProfile({ ...ok, phone: '+57 300 123 4567', birthDate: '1990-05-01', yearsExperience: '8' }, now)).toEqual({});
  });
});

describe('clientImpact (qué se borra al eliminar un paciente)', () => {
  const a = (id: string, over: Partial<Appointment> = {}) => appt({ id, clientId: 'c1', ...over });
  const data = {
    appointments: [
      a('1', { date: '2026-11-09' }), // pasada
      a('2', { date: '2026-11-10' }), // hoy
      a('3', { date: '2026-11-17', seriesId: 's' }),
      a('4', { date: '2026-11-24', seriesId: 's', status: 'cancelada' }),
      a('5', { clientId: 'otro', date: '2026-12-01' }),
    ],
    sessions: [{ clientId: 'c1' }, { clientId: 'otro' }] as never,
    observations: [{ clientId: 'c1' }, { clientId: 'c1' }, { clientId: 'otro' }] as never,
  };
  it('cuenta citas (con las de series y canceladas), futuras programadas, sesiones y observaciones solo de ese paciente', () => {
    expect(clientImpact('c1', data, now)).toEqual({ appointments: 4, future: 2, series: 2, sessions: 1, observations: 2 });
  });
  it('un paciente sin datos da todo en cero', () => {
    expect(clientImpact('nadie', data, now)).toEqual({ appointments: 0, future: 0, series: 0, sessions: 0, observations: 0 });
  });
});
