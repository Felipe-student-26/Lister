import { randomBytes } from 'node:crypto';
import { isValidEmail, normalizeEmail } from './lock';

export type TeamErrorCode = 'permission-denied' | 'invalid-argument' | 'not-found';
export class TeamError extends Error {
  constructor(
    public code: TeamErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ProfileDoc {
  role?: unknown;
  ownerId?: unknown;
}

/**
 * Comprueba que quien llama es administrador de la plataforma (users/{uid}.role === 'admin').
 * Sin documento = sin acceso: ya no existe el "sin documento = admin" del modelo anterior.
 */
export function assertAdmin(profile: ProfileDoc | undefined): void {
  if (!profile || profile.role !== 'admin') {
    throw new TeamError('permission-denied', 'Solo un administrador puede gestionar terapeutas.');
  }
}

/** Campos del perfil profesional (therapistProfiles/{uid}). Todos son texto; solo `fullName` y `email` son obligatorios. */
export const PROFILE_TEXT_FIELDS = ['phone', 'idNumber', 'birthDate', 'specialty', 'licenseNumber', 'officeAddress', 'city', 'yearsExperience', 'bio'] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];

export interface TherapistProfileData extends Record<ProfileTextField, string> {
  fullName: string;
  email: string;
}

const MAX_LEN: Record<string, number> = { fullName: 120, bio: 600, officeAddress: 200 };
const maxLen = (k: string) => MAX_LEN[k] ?? 80;

/**
 * Valida y normaliza lo que envía el administrador. Acepta `displayName` como alias antiguo de `fullName`.
 * Los campos opcionales vacíos se guardan como '' (así "borrar un campo" es simplemente dejarlo vacío).
 */
export function validateTherapistInput(data: Record<string, unknown> | undefined): TherapistProfileData {
  const email = normalizeEmail(data?.email);
  if (!isValidEmail(email)) throw new TeamError('invalid-argument', 'Correo no válido.');
  const str = (k: string) => (typeof data?.[k] === 'string' ? (data[k] as string).trim() : '');
  const fullName = str('fullName') || str('displayName');
  if (fullName.length < 3) throw new TeamError('invalid-argument', 'Escribe el nombre completo.');
  const out = { fullName: fullName.slice(0, maxLen('fullName')), email } as TherapistProfileData;
  for (const k of PROFILE_TEXT_FIELDS) out[k] = str(k).slice(0, maxLen(k));
  if (out.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.birthDate)) throw new TeamError('invalid-argument', 'Fecha de nacimiento no válida.');
  if (out.yearsExperience && !/^\d{1,2}$/.test(out.yearsExperience)) throw new TeamError('invalid-argument', 'Años de experiencia no válidos.');
  return out;
}

/** El objetivo de removeTherapist / therapistResetLink debe ser una terapeuta: un admin no puede borrar a otro admin ni a sí mismo. */
export function assertTherapist(profile: ProfileDoc | undefined): void {
  if (!profile || profile.role !== 'therapist') {
    throw new TeamError('not-found', 'Esa terapeuta no existe.');
  }
}

/** Contraseña aleatoria inicial: nadie la ve; la persona define la suya con el enlace de restablecimiento. */
export function randomPassword(): string {
  return `${randomBytes(24).toString('base64url')}aA1!`;
}
