import { vi } from 'vitest';
import type { FetchLike } from '../src/identity';
import type { LockState, LockStore } from '../src/lock';
import type { AccountInfo, LoginDeps } from '../src/loginLogic';

/** Firestore simulado: Map clave → estado, con la misma semántica que firestoreLockStore (vacío = borrado). */
export function fakeStore() {
  const docs = new Map<string, LockState>();
  const store: LockStore = {
    async update(key, fn) {
      const cur = docs.get(key) ?? { attempts: 0, lockedUntil: 0 };
      const { next, result } = fn({ ...cur });
      if (next) {
        if (next.attempts === 0 && next.lockedUntil === 0) docs.delete(key);
        else docs.set(key, { ...next });
      }
      return result;
    },
  };
  return { store, docs };
}

export type IdentityReply = 'ok' | 'mfa' | 'wrong' | 'invalid-login' | 'not-found' | 'disabled' | 'throw';

/** fetch simulado de Identity Toolkit; `replies` se consume en orden (la última se repite). */
export function fakeFetch(...replies: IdentityReply[]) {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r === 'throw') throw new Error('network');
    if (r === 'ok') return { ok: true, status: 200, json: async () => ({ idToken: 'x', localId: 'u1' }) };
    if (r === 'mfa') return { ok: true, status: 200, json: async () => ({ mfaPendingCredential: 'p', mfaInfo: [{}] }) };
    const message = { wrong: 'INVALID_PASSWORD', 'invalid-login': 'INVALID_LOGIN_CREDENTIALS', 'not-found': 'EMAIL_NOT_FOUND', disabled: 'USER_DISABLED' }[r];
    return { ok: false, status: 400, json: async () => ({ error: { code: 400, message } }) };
  });
  return fn as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

export function makeDeps(opts: {
  fetchFn: FetchLike;
  now?: { t: number };
  account?: AccountInfo;
  referer?: string;
}) {
  const { store, docs } = fakeStore();
  const clock = opts.now ?? { t: 1_700_000_000_000 };
  const deps: LoginDeps = {
    store,
    fetchFn: opts.fetchFn,
    apiKey: 'API_KEY',
    referer: opts.referer,
    now: () => clock.t,
    lookupAccount: opts.account ? async () => opts.account! : undefined,
  };
  return { deps, docs, clock };
}
