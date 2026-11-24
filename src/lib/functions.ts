import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { app } from './firebase';

/** true = el bloqueo de intentos lo lleva el servidor (Cloud Functions). Sin activar se usa el bloqueo local. */
export const serverLockEnabled = import.meta.env.VITE_USE_SERVER_LOCK === 'true';

let fns: Functions | null = null;

/** Se crea al primer uso (los tests de componentes no necesitan Firebase real). */
export function getFns(): Functions {
  if (!fns) {
    fns = getFunctions(app, (import.meta.env.VITE_FUNCTIONS_REGION as string | undefined) || 'us-central1');
    if (import.meta.env.VITE_FUNCTIONS_EMULATOR === 'true') connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  return fns;
}

export async function callFn<I, O>(name: string, data?: I): Promise<O> {
  const res = await httpsCallable<I, O>(getFns(), name)(data);
  return res.data;
}

/** Mensaje legible de un error de Cloud Functions (HttpsError conserva el texto enviado por el servidor). */
export function fnErrorMessage(err: unknown, fallback = 'No se pudo completar la operación.'): string {
  const e = err as { code?: string; message?: string };
  const code = e.code ?? '';
  if (code === 'functions/unavailable' || code === 'functions/internal' || code === 'functions/not-found') {
    return 'No se pudo contactar el servidor. Revisa tu conexión o que las funciones estén desplegadas.';
  }
  if (code.startsWith('functions/') && e.message && e.message !== 'internal') return e.message;
  return fallback;
}

// ── Bloqueo de intentos en servidor ──────────────────────────────────────────────────────────────────────────────

export type LoginAttemptResponse =
  | { result: 'locked'; message: string; attemptsLeft: number }
  | { result: 'wrong'; message: string; attemptsLeft: number }
  | { result: 'error'; message: string }
  | { result: 'ok'; hasPasskey: boolean; hasTotp: boolean }
  | { result: 'mfa'; hasPasskey: boolean; hasTotp: boolean };

export interface LoginGateResponse {
  locked: boolean;
  minutes: number;
  message: string;
}

export const serverLoginGate = (email: string) => callFn<{ email: string }, LoginGateResponse>('loginGate', { email });

export const serverLoginAttempt = (email: string, password: string) =>
  callFn<{ email: string; password: string }, LoginAttemptResponse>('loginAttempt', { email, password });

export const serverMfaFailure = (email: string) =>
  callFn<{ email: string }, LoginAttemptResponse>('reportMfaFailure', { email });

/** Se llama con la sesión ya iniciada: el servidor toma el correo del token, no de lo que diga el cliente. */
export const serverLoginSuccess = () => callFn<undefined, { ok: boolean }>('loginSuccess');
