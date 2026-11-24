import { verifyPassword, type FetchLike } from './identity';
import { gate, isValidEmail, normalizeEmail, registerFailure, registerSuccess, type LockStore } from './lock';

export interface AccountInfo {
  hasPasskey: boolean;
  hasTotp: boolean;
}

export interface LoginDeps {
  store: LockStore;
  fetchFn: FetchLike;
  apiKey: string;
  referer?: string;
  now: () => number;
  /** Segundos factores de la cuenta (solo se consulta tras verificar la contraseña). */
  lookupAccount?: (email: string) => Promise<AccountInfo>;
}

export interface GateResponse {
  locked: boolean;
  minutes: number;
  message: string;
}

export type AttemptResponse =
  | { result: 'locked' | 'wrong'; message: string; attemptsLeft: number }
  | { result: 'error'; message: string }
  | { result: 'ok' | 'mfa'; hasPasskey: boolean; hasTotp: boolean };

const BAD_INPUT = 'Correo o contraseña no válidos.';
const UNAVAILABLE = 'No se pudo verificar el acceso. Inténtalo de nuevo.';

export async function handleLoginGate(deps: LoginDeps, data: { email?: unknown }): Promise<GateResponse> {
  const email = normalizeEmail(data?.email);
  if (!isValidEmail(email)) return { locked: false, minutes: 0, message: '' };
  return gate(deps.store, email, deps.now());
}

/**
 * Verifica correo + contraseña en servidor y cuenta los fallos. Es la única vía que puede reiniciar el contador
 * por contraseña correcta; el cliente nunca informa "éxito". Compartido con el login por passkey.
 */
export async function checkCredentials(
  deps: LoginDeps,
  emailRaw: unknown,
  password: unknown,
): Promise<{ ok: true; email: string; check: 'ok' | 'mfa' } | { ok: false; response: AttemptResponse }> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return { ok: false, response: { result: 'error', message: BAD_INPUT } };
  }
  const g = await gate(deps.store, email, deps.now());
  if (g.locked) return { ok: false, response: { result: 'locked', message: g.message, attemptsLeft: 0 } };

  const check = await verifyPassword(deps.fetchFn, deps.apiKey, email, password, deps.referer);
  if (check === 'error') return { ok: false, response: { result: 'error', message: UNAVAILABLE } };
  if (check === 'wrong') {
    const f = await registerFailure(deps.store, email, deps.now());
    return { ok: false, response: { result: f.status, message: f.message, attemptsLeft: f.attemptsLeft } };
  }
  return { ok: true, email, check };
}

export async function lookupSafe(deps: LoginDeps, email: string): Promise<AccountInfo> {
  try {
    return (await deps.lookupAccount?.(email)) ?? { hasPasskey: false, hasTotp: false };
  } catch {
    return { hasPasskey: false, hasTotp: false };
  }
}

export async function handleLoginAttempt(
  deps: LoginDeps,
  data: { email?: unknown; password?: unknown },
): Promise<AttemptResponse> {
  const r = await checkCredentials(deps, data?.email, data?.password);
  if (!r.ok) return r.response;

  const account = await lookupSafe(deps, r.email);
  const hasTotp = account.hasTotp || r.check === 'mfa';
  // Con segundo factor pendiente el contador NO se reinicia aquí: se reinicia en loginSuccess (sesión autenticada),
  // para que quien conozca la contraseña no pueda resetearlo y adivinar el código indefinidamente.
  if (!hasTotp && !account.hasPasskey) await registerSuccess(deps.store, r.email, deps.now());
  return { result: hasTotp ? 'mfa' : 'ok', hasPasskey: account.hasPasskey, hasTotp };
}

/** Se llama con el correo de la sesión ya autenticada por Firebase (request.auth), nunca con uno enviado por el cliente. */
export async function handleLoginSuccess(deps: LoginDeps, authedEmail: string | undefined): Promise<void> {
  const email = normalizeEmail(authedEmail);
  if (!isValidEmail(email)) return;
  await registerSuccess(deps.store, email, deps.now());
}

/** El código TOTP lo valida Firebase en el cliente; aquí solo se contabiliza el fallo (frena fuerza bruta del código). */
export async function handleMfaFailure(deps: LoginDeps, data: { email?: unknown }): Promise<AttemptResponse> {
  const email = normalizeEmail(data?.email);
  if (!isValidEmail(email)) return { result: 'error', message: BAD_INPUT };
  const g = await gate(deps.store, email, deps.now());
  if (g.locked) return { result: 'locked', message: g.message, attemptsLeft: 0 };
  const f = await registerFailure(deps.store, email, deps.now());
  return { result: f.status, message: f.message, attemptsLeft: f.attemptsLeft };
}
