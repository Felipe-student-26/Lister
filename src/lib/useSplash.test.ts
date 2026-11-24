// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SPLASH_MAX_MS, SPLASH_MIN_MS, useSplash, type SplashInput } from './useSplash';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const base: SplashInput = { desktop: false, ready: false, hasUser: false, profileReady: false };
const run = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('useSplash — celular (al abrir la app)', () => {
  it('se ve hasta que hay sesión resuelta y pasó el tiempo mínimo', () => {
    const { result, rerender } = renderHook((p: SplashInput) => useSplash(p), { initialProps: base });
    expect(result.current).toBe(true);
    rerender({ ...base, ready: true }); // sin sesión: ya puede mostrarse el login, pero falta el mínimo
    expect(result.current).toBe(true);
    run(SPLASH_MIN_MS + 50);
    expect(result.current).toBe(false);
  });

  it('con sesión espera también al perfil', () => {
    const { result, rerender } = renderHook((p: SplashInput) => useSplash(p), { initialProps: { ...base, ready: true, hasUser: true } });
    run(SPLASH_MIN_MS + 50);
    expect(result.current).toBe(true);
    rerender({ ...base, ready: true, hasUser: true, profileReady: true });
    expect(result.current).toBe(false);
  });

  it('se cierra solo si algo no responde (tope)', () => {
    const { result } = renderHook((p: SplashInput) => useSplash(p), { initialProps: base });
    run(SPLASH_MAX_MS + 50);
    expect(result.current).toBe(false);
  });
});

describe('useSplash — PC (al iniciar sesión)', () => {
  const pc: SplashInput = { ...base, desktop: true, ready: true };

  it('al abrir la app (sin sesión) no se muestra: se ve el login', () => {
    const { result } = renderHook((p: SplashInput) => useSplash(p), { initialProps: pc });
    expect(result.current).toBe(false);
  });

  it('aparece en el mismo cambio en que entra el usuario y se va al cargar el perfil + tiempo mínimo', () => {
    const { result, rerender } = renderHook((p: SplashInput) => useSplash(p), { initialProps: pc });
    rerender({ ...pc, hasUser: true });
    expect(result.current).toBe(true);
    rerender({ ...pc, hasUser: true, profileReady: true });
    expect(result.current).toBe(true); // falta el mínimo
    run(SPLASH_MIN_MS + 50);
    expect(result.current).toBe(false);
  });

  it('si la sesión ya estaba al cargar (recarga) no se muestra', () => {
    const { result } = renderHook((p: SplashInput) => useSplash(p), { initialProps: { ...pc, hasUser: true, profileReady: true } });
    expect(result.current).toBe(false);
  });

  it('cerrar sesión y volver a entrar lo muestra otra vez', () => {
    const { result, rerender } = renderHook((p: SplashInput) => useSplash(p), { initialProps: pc });
    rerender({ ...pc, hasUser: true, profileReady: true });
    run(SPLASH_MIN_MS + 50);
    expect(result.current).toBe(false);
    rerender({ ...pc, hasUser: false });
    rerender({ ...pc, hasUser: true, profileReady: true });
    expect(result.current).toBe(true);
  });
});
