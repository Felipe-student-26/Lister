import { describe, expect, it } from 'vitest';
import { isNativeApp, shouldKeepSession } from './platform';

const native = { Capacitor: { isNativePlatform: () => true } };
const web = { Capacitor: { isNativePlatform: () => false } };
const ua = (userAgent: string) => ({ navigator: { userAgent } });

describe('política de sesión por plataforma', () => {
  it('app nativa (Capacitor) conserva la sesión', () => {
    expect(isNativeApp(native)).toBe(true);
    expect(shouldKeepSession(native)).toBe(true);
  });
  it('navegador móvil conserva la sesión', () => {
    expect(shouldKeepSession(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile'))).toBe(true);
    expect(shouldKeepSession(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari'))).toBe(true);
  });
  it('PC (Electron o navegador de escritorio) pide iniciar sesión al abrir', () => {
    expect(shouldKeepSession({ ...web, ...ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/33.0.0 Chrome/130') })).toBe(false);
    expect(shouldKeepSession(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'))).toBe(false);
    expect(shouldKeepSession(undefined)).toBe(false);
  });
  it('VITE_KEEP_SESSION fuerza el comportamiento', () => {
    expect(shouldKeepSession(ua('Windows NT 10.0'), 'true')).toBe(true);
    expect(shouldKeepSession(native, 'false')).toBe(false);
  });
});
