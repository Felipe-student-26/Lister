/** Verificación de contraseña en servidor con la REST API de Identity Toolkit. */
export type PasswordCheck = 'ok' | 'mfa' | 'wrong' | 'error';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

export const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/** Errores que significan "credenciales incorrectas" y por tanto cuentan como fallo. */
const WRONG = ['INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS'];

export async function verifyPassword(
  fetchFn: FetchLike,
  apiKey: string,
  email: string,
  password: string,
  referer?: string,
): Promise<PasswordCheck> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (referer) headers.Referer = referer;
    const res = await fetchFn(`${SIGN_IN_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      mfaPendingCredential?: string;
      error?: { message?: string };
    };
    if (res.ok) return body.mfaPendingCredential ? 'mfa' : 'ok';
    const msg = String(body.error?.message ?? '');
    return WRONG.some((w) => msg.startsWith(w)) ? 'wrong' : 'error';
  } catch {
    return 'error';
  }
}
