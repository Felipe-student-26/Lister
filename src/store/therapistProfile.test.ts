import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ cb: null as null | ((s: unknown) => void), err: null as null | (() => void), unsub: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  onSnapshot: vi.fn((_ref: unknown, ok: (s: unknown) => void, err: () => void) => {
    fs.cb = ok;
    fs.err = err;
    return fs.unsub;
  }),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));

import { toProfile, useTherapistProfile } from './therapistProfile';

beforeEach(() => {
  vi.clearAllMocks();
  useTherapistProfile.getState().reset();
});

describe('perfil de la terapeuta (solo lectura)', () => {
  it('antes de la primera respuesta no está listo', () => {
    useTherapistProfile.getState().load('t1');
    expect(useTherapistProfile.getState()).toMatchObject({ ready: false, profile: null });
  });

  it('con documento: normaliza todos los campos a texto', () => {
    useTherapistProfile.getState().load('t1');
    fs.cb!({ exists: () => true, data: () => ({ fullName: 'Ana Pérez', email: 'a@x.co', city: 'Manizales', yearsExperience: 5, extra: 'x' }) });
    const s = useTherapistProfile.getState();
    expect(s.ready).toBe(true);
    expect(s.profile).toMatchObject({ fullName: 'Ana Pérez', city: 'Manizales', yearsExperience: '', phone: '' });
    expect('extra' in s.profile!).toBe(false);
  });

  it('sin documento: listo y perfil null (estado vacío)', () => {
    useTherapistProfile.getState().load('t1');
    fs.cb!({ exists: () => false, data: () => undefined });
    expect(useTherapistProfile.getState()).toMatchObject({ ready: true, profile: null, error: false });
  });

  it('si Firestore falla: listo con error; reset cancela la escucha', () => {
    useTherapistProfile.getState().load('t1');
    fs.err!();
    expect(useTherapistProfile.getState()).toMatchObject({ ready: true, error: true, profile: null });
    useTherapistProfile.getState().reset();
    expect(fs.unsub).toHaveBeenCalled();
    expect(useTherapistProfile.getState().ready).toBe(false);
  });

  it('toProfile completa con vacíos lo que falta', () => {
    expect(toProfile({}).bio).toBe('');
  });
});
