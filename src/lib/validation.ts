import type { Appointment, ObservationNote, SessionRecord, TherapistProfile } from './types';

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Solo se puede reservar del día actual en adelante. */
export function isDateBookable(date: string, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayISO(now);
}

/** No se puede reservar dos citas para la misma fecha y hora (las canceladas liberan el horario). */
export function hasConflict(
  appointments: Appointment[],
  date: string,
  time: string,
  ignoreId?: string,
): boolean {
  return appointments.some(
    (a) => a.id !== ignoreId && a.status !== 'cancelada' && a.date === date && a.time === time,
  );
}

/** Máximo de citas que se crean de una sola vez en una reserva semanal. */
export const MAX_SERIES = 60;

/** Fechas semanales desde `start` hasta `end` (ambas incluidas), siempre el mismo día de la semana. */
export function weeklyDates(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return [];
  const [y, m, d] = start.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i <= MAX_SERIES; i++) {
    const iso = todayISO(new Date(y, m - 1, d + i * 7));
    if (iso > end) break;
    out.push(iso);
  }
  return out;
}

export type BookingError = 'fecha_pasada' | 'horario_ocupado' | 'datos_incompletos';

export function validateBooking(
  appointments: Appointment[],
  input: { clientId: string; date: string; time: string },
  now: Date = new Date(),
): BookingError | null {
  if (!input.clientId || !input.date || !input.time) return 'datos_incompletos';
  if (!isDateBookable(input.date, now)) return 'fecha_pasada';
  if (hasConflict(appointments, input.date, input.time)) return 'horario_ocupado';
  return null;
}

export const BOOKING_MESSAGES: Record<BookingError, string> = {
  fecha_pasada: 'Solo se puede reservar desde el día de hoy en adelante.',
  horario_ocupado: 'Ya existe una cita en ese horario.',
  datos_incompletos: 'Completa paciente, fecha y hora.',
};

/** Política de contraseña fuerte: 10+ caracteres, mayúscula, minúscula, número y símbolo. */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push('Mínimo 10 caracteres');
  if (!/[a-z]/.test(pw)) issues.push('Una minúscula');
  if (!/[A-Z]/.test(pw)) issues.push('Una mayúscula');
  if (!/\d/.test(pw)) issues.push('Un número');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('Un símbolo');
  return issues;
}

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const emptyTherapistProfile = (): TherapistProfile => ({
  fullName: '', email: '', phone: '', idNumber: '', birthDate: '', specialty: '',
  licenseNumber: '', officeAddress: '', city: '', yearsExperience: '', bio: '',
});

export type TherapistProfileErrors = Partial<Record<'fullName' | 'email' | 'phone' | 'birthDate' | 'yearsExperience', string>>;

/** Validación del perfil de terapeuta: obligatorios nombre y correo; los demás pueden quedar vacíos pero, si se llenan, deben ser válidos. */
export function validateTherapistProfile(f: TherapistProfile, now: Date = new Date()): TherapistProfileErrors {
  const e: TherapistProfileErrors = {};
  if (f.fullName.trim().length < 3) e.fullName = 'Escribe el nombre completo';
  if (!f.email.trim()) e.email = 'Escribe el correo';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Correo no válido';
  if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 7) e.phone = 'Teléfono no válido';
  if (f.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate) || f.birthDate > todayISO(now))) e.birthDate = 'Fecha de nacimiento no válida';
  if (f.yearsExperience.trim() && !/^\d{1,2}$/.test(f.yearsExperience.trim())) e.yearsExperience = 'Escribe un número entre 0 y 99';
  return e;
}

export interface ClientImpact {
  /** Todas las citas del paciente (incluye canceladas y las de reservas semanales). */
  appointments: number;
  /** Citas programadas de hoy en adelante. */
  future: number;
  /** De las citas, cuántas pertenecen a una reserva semanal (seriesId). */
  series: number;
  sessions: number;
  observations: number;
}

/** Qué se borra al eliminar a un paciente (cascada): se usa para avisar antes de confirmar. */
export function clientImpact(
  clientId: string,
  data: { appointments: Appointment[]; sessions: SessionRecord[]; observations: ObservationNote[] },
  now: Date = new Date(),
): ClientImpact {
  const today = todayISO(now);
  const appts = data.appointments.filter((a) => a.clientId === clientId);
  return {
    appointments: appts.length,
    future: appts.filter((a) => a.status === 'programada' && a.date >= today).length,
    series: appts.filter((a) => a.seriesId).length,
    sessions: data.sessions.filter((x) => x.clientId === clientId).length,
    observations: data.observations.filter((o) => o.clientId === clientId).length,
  };
}
