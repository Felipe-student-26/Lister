import { createHash } from 'node:crypto';

/** Misma política y mensajes que el bloqueo local del cliente (src/store/auth.ts). */
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface LockState {
  attempts: number;
  lockedUntil: number;
}

export const MESSAGES = {
  locked: 'Cuenta bloqueada 15 minutos por 5 intentos fallidos.',
  wrong: (left: number) => `Credenciales incorrectas. Intentos restantes: ${left}.`,
  stillLocked: (mins: number) => `Demasiados intentos. Intenta de nuevo en ${mins} min.`,
};

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

/** Id del documento loginAttempts/{sha256(email normalizado)}: el correo nunca se guarda en claro. */
export function emailKey(email: unknown): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export const isLocked = (s: LockState, now: number) => s.lockedUntil > now;
export const minutesLeft = (lockedUntil: number, now: number) => Math.max(1, Math.ceil((lockedUntil - now) / 60000));

/**
 * Almacén con actualización atómica (transacción en Firestore). `fn` recibe el estado actual y devuelve
 * el siguiente (null = no escribir) y el resultado. Un estado vacío (0, 0) borra el documento.
 */
export interface LockStore {
  update<T>(key: string, fn: (cur: LockState) => { next: LockState | null; result: T }): Promise<T>;
}

export interface GateResult {
  locked: boolean;
  minutes: number;
  message: string;
}

export async function gate(store: LockStore, email: unknown, now: number): Promise<GateResult> {
  return store.update(emailKey(email), (cur) => ({
    next: null,
    result: isLocked(cur, now)
      ? { locked: true, minutes: minutesLeft(cur.lockedUntil, now), message: MESSAGES.stillLocked(minutesLeft(cur.lockedUntil, now)) }
      : { locked: false, minutes: 0, message: '' },
  }));
}

export interface FailureResult {
  status: 'wrong' | 'locked';
  message: string;
  attemptsLeft: number;
}

/** Cuenta un fallo (contraseña, código o aserción). Si ya hay bloqueo vigente no suma ni extiende. */
export async function registerFailure(store: LockStore, email: unknown, now: number): Promise<FailureResult> {
  return store.update(emailKey(email), (cur): { next: LockState | null; result: FailureResult } => {
    if (isLocked(cur, now)) {
      return {
        next: null,
        result: { status: 'locked', message: MESSAGES.stillLocked(minutesLeft(cur.lockedUntil, now)), attemptsLeft: 0 },
      };
    }
    // Un bloqueo vencido reinicia el contador (igual que el cliente).
    const attempts = (cur.lockedUntil && cur.lockedUntil <= now ? 0 : cur.attempts) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      return {
        next: { attempts: 0, lockedUntil: now + LOCK_MS },
        result: { status: 'locked', message: MESSAGES.locked, attemptsLeft: 0 },
      };
    }
    return {
      next: { attempts, lockedUntil: 0 },
      result: { status: 'wrong', message: MESSAGES.wrong(MAX_ATTEMPTS - attempts), attemptsLeft: MAX_ATTEMPTS - attempts },
    };
  });
}

/** Un acceso correcto reinicia el contador, pero nunca levanta un bloqueo vigente. */
export async function registerSuccess(store: LockStore, email: unknown, now: number): Promise<void> {
  await store.update(emailKey(email), (cur) => ({
    next: isLocked(cur, now) ? null : { attempts: 0, lockedUntil: 0 },
    result: undefined,
  }));
}
