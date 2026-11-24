import { describe, expect, it } from 'vitest';
import { LOCK_MS, emailKey, normalizeEmail } from '../src/lock';
import { handleLoginAttempt, handleLoginGate, handleLoginSuccess, handleMfaFailure } from '../src/loginLogic';
import { verifyPassword } from '../src/identity';
import { fakeFetch, makeDeps } from './helpers';

const EMAIL = 'Ana@Correo.com';
const attempt = (d: ReturnType<typeof makeDeps>['deps'], password = 'x') => handleLoginAttempt(d, { email: EMAIL, password });

describe('clave del documento loginAttempts', () => {
  it('es sha256 del correo normalizado (sin mayúsculas ni espacios) y no contiene el correo', () => {
    expect(normalizeEmail('  Ana@Correo.COM ')).toBe('ana@correo.com');
    expect(emailKey('  Ana@Correo.COM ')).toBe(emailKey('ana@correo.com'));
    expect(emailKey('ana@correo.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(emailKey('ana@correo.com')).not.toContain('ana');
  });
});

describe('loginAttempt: bloqueo por fallos verificados en servidor', () => {
  it('cuenta fallos con los mismos mensajes que el cliente y bloquea al 5.º', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong') });
    for (const left of [4, 3, 2, 1]) {
      expect(await attempt(deps)).toEqual({
        result: 'wrong',
        message: `Credenciales incorrectas. Intentos restantes: ${left}.`,
        attemptsLeft: left,
      });
    }
    expect(await attempt(deps)).toMatchObject({ result: 'locked', message: 'Cuenta bloqueada 15 minutos por 5 intentos fallidos.' });
    expect(docs.get(emailKey(EMAIL))).toEqual({ attempts: 0, lockedUntil: 1_700_000_000_000 + LOCK_MS });
  });

  it('con bloqueo vigente no consulta a Identity Toolkit ni extiende el bloqueo', async () => {
    const fetchFn = fakeFetch('wrong');
    const { deps, docs, clock } = makeDeps({ fetchFn });
    for (let i = 0; i < 5; i++) await attempt(deps);
    const calls = fetchFn.mock.calls.length;
    const locked = docs.get(emailKey(EMAIL))!.lockedUntil;

    clock.t += 5 * 60 * 1000;
    expect(await attempt(deps)).toMatchObject({ result: 'locked', message: 'Demasiados intentos. Intenta de nuevo en 10 min.' });
    expect(fetchFn.mock.calls.length).toBe(calls);
    expect(docs.get(emailKey(EMAIL))!.lockedUntil).toBe(locked);
  });

  it('al vencer el bloqueo el contador empieza de nuevo', async () => {
    const { deps, clock } = makeDeps({ fetchFn: fakeFetch('wrong') });
    for (let i = 0; i < 5; i++) await attempt(deps);
    clock.t += LOCK_MS + 1;
    expect(await attempt(deps)).toMatchObject({ result: 'wrong', attemptsLeft: 4 });
  });

  it('una contraseña correcta reinicia el contador', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong', 'wrong', 'wrong', 'ok', 'wrong') });
    for (let i = 0; i < 3; i++) await attempt(deps);
    expect(docs.get(emailKey(EMAIL))?.attempts).toBe(3);
    expect(await attempt(deps)).toEqual({ result: 'ok', hasPasskey: false, hasTotp: false });
    expect(docs.has(emailKey(EMAIL))).toBe(false);
    expect(await attempt(deps)).toMatchObject({ attemptsLeft: 4 });
  });

  it('el correo se normaliza: mayúsculas y espacios comparten contador', async () => {
    const { deps } = makeDeps({ fetchFn: fakeFetch('wrong') });
    await handleLoginAttempt(deps, { email: 'ana@correo.com', password: 'x' });
    expect(await handleLoginAttempt(deps, { email: '  ANA@correo.com ', password: 'x' })).toMatchObject({ attemptsLeft: 3 });
  });

  it('INVALID_LOGIN_CREDENTIALS y EMAIL_NOT_FOUND también cuentan (sin revelar si el correo existe)', async () => {
    const { deps } = makeDeps({ fetchFn: fakeFetch('invalid-login', 'not-found') });
    expect(await attempt(deps)).toMatchObject({ result: 'wrong', attemptsLeft: 4 });
    expect(await attempt(deps)).toMatchObject({ result: 'wrong', attemptsLeft: 3 });
  });

  it('errores que no son de credenciales (red, cuenta deshabilitada) no cuentan', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('throw', 'disabled') });
    expect(await attempt(deps)).toMatchObject({ result: 'error' });
    expect(await attempt(deps)).toMatchObject({ result: 'error' });
    expect(docs.size).toBe(0);
  });

  it('rechaza entradas vacías o con correo inválido sin llamar a la API', async () => {
    const fetchFn = fakeFetch('ok');
    const { deps } = makeDeps({ fetchFn });
    expect(await handleLoginAttempt(deps, { email: 'no-es-correo', password: 'x' })).toMatchObject({ result: 'error' });
    expect(await handleLoginAttempt(deps, { email: EMAIL, password: '' })).toMatchObject({ result: 'error' });
    expect(await handleLoginAttempt(deps, {})).toMatchObject({ result: 'error' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('no existe forma de reportar "éxito" desde el cliente: un success:true inventado no reinicia nada', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong') });
    await attempt(deps);
    const forged = { email: EMAIL, password: 'x', success: true, ok: true, reset: true };
    expect(await handleLoginAttempt(deps, forged)).toMatchObject({ result: 'wrong', attemptsLeft: 3 });
    expect(docs.get(emailKey(EMAIL))?.attempts).toBe(2);
  });

  it('verifica la contraseña con signInWithPassword (URL, clave, cuerpo y Referer)', async () => {
    const fetchFn = fakeFetch('ok');
    const { deps } = makeDeps({ fetchFn, referer: 'https://lister.web.app' });
    await handleLoginAttempt(deps, { email: ' Ana@Correo.com ', password: 'Secreta#1' });
    const [url, init] = (fetchFn.mock.calls[0] as unknown) as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=API_KEY');
    expect(init.method).toBe('POST');
    expect(init.headers.Referer).toBe('https://lister.web.app');
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@correo.com', password: 'Secreta#1', returnSecureToken: true });
  });
});

describe('segundo factor pendiente', () => {
  it('contraseña correcta con TOTP responde mfa y NO reinicia el contador', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong', 'wrong', 'mfa') });
    await attempt(deps);
    await attempt(deps);
    expect(await attempt(deps)).toEqual({ result: 'mfa', hasPasskey: false, hasTotp: true });
    expect(docs.get(emailKey(EMAIL))?.attempts).toBe(2);
  });

  it('loginSuccess (solo con correo de sesión autenticada) lo reinicia; un correo inválido no hace nada', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong') });
    await attempt(deps);
    await handleLoginSuccess(deps, undefined);
    expect(docs.get(emailKey(EMAIL))?.attempts).toBe(1);
    await handleLoginSuccess(deps, 'ana@correo.com');
    expect(docs.has(emailKey(EMAIL))).toBe(false);
  });

  it('loginSuccess no levanta un bloqueo vigente', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong') });
    for (let i = 0; i < 5; i++) await attempt(deps);
    await handleLoginSuccess(deps, 'ana@correo.com');
    expect(docs.get(emailKey(EMAIL))!.lockedUntil).toBeGreaterThan(0);
  });

  it('con passkey registrado la contraseña sola no reinicia y se informa hasPasskey', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('wrong', 'ok'), account: { hasPasskey: true, hasTotp: false } });
    await attempt(deps);
    expect(await attempt(deps)).toEqual({ result: 'ok', hasPasskey: true, hasTotp: false });
    expect(docs.get(emailKey(EMAIL))?.attempts).toBe(1);
  });

  it('reportMfaFailure cuenta los códigos incorrectos y bloquea al 5.º', async () => {
    const { deps } = makeDeps({ fetchFn: fakeFetch('ok') });
    for (const left of [4, 3, 2, 1]) {
      expect(await handleMfaFailure(deps, { email: EMAIL })).toMatchObject({ result: 'wrong', attemptsLeft: left });
    }
    expect(await handleMfaFailure(deps, { email: EMAIL })).toMatchObject({ result: 'locked' });
    expect(await handleMfaFailure(deps, { email: EMAIL })).toMatchObject({ result: 'locked', message: 'Demasiados intentos. Intenta de nuevo en 15 min.' });
  });

  it('si falla la consulta de la cuenta no se rompe el login', async () => {
    const { deps } = makeDeps({ fetchFn: fakeFetch('ok') });
    deps.lookupAccount = async () => {
      throw new Error('auth/user-not-found');
    };
    expect(await attempt(deps)).toEqual({ result: 'ok', hasPasskey: false, hasTotp: false });
  });
});

describe('loginGate', () => {
  it('informa si hay bloqueo vigente y cuántos minutos faltan', async () => {
    const { deps, clock } = makeDeps({ fetchFn: fakeFetch('wrong') });
    expect(await handleLoginGate(deps, { email: EMAIL })).toMatchObject({ locked: false });
    for (let i = 0; i < 5; i++) await attempt(deps);
    clock.t += 14 * 60 * 1000 + 30_000;
    expect(await handleLoginGate(deps, { email: EMAIL })).toEqual({
      locked: true,
      minutes: 1,
      message: 'Demasiados intentos. Intenta de nuevo en 1 min.',
    });
    clock.t += 60_000;
    expect(await handleLoginGate(deps, { email: EMAIL })).toMatchObject({ locked: false });
  });

  it('un correo inválido no consulta el almacén', async () => {
    const { deps, docs } = makeDeps({ fetchFn: fakeFetch('ok') });
    expect(await handleLoginGate(deps, { email: 42 })).toMatchObject({ locked: false });
    expect(docs.size).toBe(0);
  });
});

describe('verifyPassword (Identity Toolkit simulado)', () => {
  it('mapea respuestas: ok, mfa, wrong y error', async () => {
    expect(await verifyPassword(fakeFetch('ok'), 'k', 'a@b.co', 'x')).toBe('ok');
    expect(await verifyPassword(fakeFetch('mfa'), 'k', 'a@b.co', 'x')).toBe('mfa');
    expect(await verifyPassword(fakeFetch('wrong'), 'k', 'a@b.co', 'x')).toBe('wrong');
    expect(await verifyPassword(fakeFetch('disabled'), 'k', 'a@b.co', 'x')).toBe('error');
    expect(await verifyPassword(fakeFetch('throw'), 'k', 'a@b.co', 'x')).toBe('error');
  });
});
