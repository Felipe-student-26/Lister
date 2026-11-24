/**
 * Roles (users/{uid}.role):
 *  - admin: administrador de la plataforma; gestiona terapeutas y NO ve datos clínicos.
 *  - therapist: dueña de sus datos (ownerId = su uid); crea, edita y elimina pacientes y citas.
 * Sin documento users/{uid} = sin acceso.
 */
export type Role = 'admin' | 'therapist';

/** therapistProfiles/{uid}: datos profesionales que llena el administrador. Todo es texto; solo fullName y email son obligatorios. */
export interface TherapistProfile {
  fullName: string;
  email: string;
  phone: string;
  idNumber: string; // documento de identidad
  birthDate: string; // YYYY-MM-DD o ''
  specialty: string;
  licenseNumber: string; // tarjeta / registro profesional
  officeAddress: string;
  city: string;
  yearsExperience: string; // número entero como texto o ''
  bio: string;
}

export type ProgressState = 'mejor' | 'igual' | 'peor';

export interface Client {
  id: string;
  ownerId: string;
  fullName: string;
  phone: string;
  email: string;
  birthDate: string; // YYYY-MM-DD
  generalInfo: string;
  createdAt: number;
  updatedAt: number;
}

export type AppointmentStatus = 'programada' | 'realizada' | 'cancelada';

export interface Appointment {
  id: string;
  ownerId: string;
  clientId: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: AppointmentStatus;
  /** Presente solo en citas creadas como reserva semanal repetida. */
  seriesId?: string;
  createdAt: number;
}

/** Registro clínico de una cita (se llena el mismo día de la consulta). */
export interface SessionRecord {
  id: string;
  ownerId: string;
  clientId: string;
  appointmentId: string;
  date: string; // YYYY-MM-DD
  sessionNotes: string; // notas tomadas durante la cita
  proposedGoals: string; // objetivos propuestos
  agreedTargets: string; // metas acordadas
  progressOnPrevious: string; // avances en objetivos de citas anteriores
  stateVsPrevious: ProgressState; // estado comparado con la cita anterior
  stateComment: string;
  createdAt: number;
  updatedAt: number;
}

/** Nota de observación independiente de las citas. */
export interface ObservationNote {
  id: string;
  ownerId: string;
  clientId: string;
  text: string;
  createdAt: number;
}

export const SLOT_HOURS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
] as const;

/** Colores de las notas del mural (pasteles fijos: no dependen del tema para que se vean como papelitos). */
export const NOTE_COLORS = ['amarillo', 'rosa', 'azul', 'verde', 'lila'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** Nota del mural de notas personales de la terapeuta (no es un dato clínico). */
export interface PersonalNote {
  id: string;
  ownerId: string;
  text: string;
  color: NoteColor;
  createdAt: number;
  updatedAt: number;
}

/** Página del libro de notas personales: título arriba y contenido libre abajo. `order` fija su número de página. */
export interface BookPage {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
