import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins, resolveRp, RpError } from '../src/rp';

const allowed = parseAllowedOrigins('https://lister.web.app/, http://localhost:5173 ,https://localhost,');

describe('rpID por plataforma', () => {
  it('parsea la lista blanca ignorando espacios, barras finales y vacíos', () => {
    expect(allowed).toEqual(['https://lister.web.app', 'http://localhost:5173', 'https://localhost']);
  });
  it('web: rpID = hostname del hosting', () => {
    expect(resolveRp('https://lister.web.app', allowed)).toEqual({ origin: 'https://lister.web.app', rpID: 'lister.web.app' });
  });
  it('desarrollo y Capacitor Android (https://localhost) usan rpID localhost', () => {
    expect(resolveRp('http://localhost:5173', allowed).rpID).toBe('localhost');
    expect(resolveRp('https://localhost', allowed).rpID).toBe('localhost');
  });
  it('Electron (file://) y origen "null" se rechazan con mensaje claro', () => {
    expect(() => resolveRp('file://', allowed)).toThrow(/file:\/\//);
    expect(() => resolveRp('null', allowed)).toThrow(RpError);
    expect(() => resolveRp(undefined, allowed)).toThrow(RpError);
  });
  it('orígenes fuera de la lista blanca se rechazan', () => {
    expect(() => resolveRp('https://evil.example', allowed)).toThrow(/no está autorizado/);
    expect(() => resolveRp('capacitor://localhost', allowed)).toThrow(RpError);
  });
});
