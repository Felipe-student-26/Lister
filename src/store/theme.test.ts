// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { effectiveOf, initTheme, useTheme } from './theme';
import { shades, themeById, THEME_KEY } from '../lib/theme';

const saved = () => JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null');
const css = (name: string) => document.documentElement.style.getPropertyValue(name);

beforeEach(() => {
  localStorage.clear();
  useTheme.getState().resetAll();
  localStorage.clear();
});

describe('store de temas', () => {
  it('setPreset aplica y guarda el predeterminado', () => {
    useTheme.getState().setPreset('menta');
    expect(useTheme.getState().presetId).toBe('menta');
    expect(css('--brand-500')).toBe(shades(themeById('menta'))[500]);
    expect(saved()).toEqual({ v: 1, presetId: 'menta', overrides: {} });
  });

  it('setOverride cambia un ajuste y conserva todo lo demás del predeterminado', () => {
    const s = useTheme.getState();
    s.setPreset('cielo');
    s.setOverride('textColor', '#222222');
    const eff = effectiveOf(useTheme.getState());
    expect(eff.textColor).toBe('#222222');
    expect(eff.fontFamily).toBe('poppins');
    expect(eff.backgroundShape).toBe('waves');
    expect(eff.backgroundColor).toBe(themeById('cielo').backgroundColor);
    expect(useTheme.getState().overrides).toEqual({ textColor: '#222222' });
    expect(css('--ink-900')).toBe('34 34 34');
    expect(css('--font-sans')).toContain('Poppins');
  });

  it('un valor igual al del predeterminado no cuenta como personalización; uno inválido se ignora', () => {
    const s = useTheme.getState();
    s.setOverride('radius', 'pill');
    expect(useTheme.getState().overrides).toEqual({ radius: 'pill' });
    s.setOverride('radius', 'round'); // = el de Rosa clásico
    expect(useTheme.getState().overrides).toEqual({});
    s.setOverride('textColor', 'azul' as never);
    expect(useTheme.getState().overrides).toEqual({});
  });

  it('elegir otro predeterminado borra las personalizaciones', () => {
    const s = useTheme.getState();
    s.setOverride('textColor', '#222222');
    s.setPreset('lila');
    expect(useTheme.getState().overrides).toEqual({});
    expect(css('--ink-900')).toBe(''); // vuelve a seguir la paleta
  });

  it('resetOverrides conserva el predeterminado; resetAll vuelve a Rosa clásico', () => {
    const s = useTheme.getState();
    s.setPreset('durazno');
    s.setOverride('fontSize', 'large');
    s.resetOverrides();
    expect(useTheme.getState().presetId).toBe('durazno');
    expect(useTheme.getState().overrides).toEqual({});
    expect(css('--font-size')).toBe('100%');
    s.setOverride('fontSize', 'small');
    s.resetAll();
    expect(useTheme.getState().presetId).toBe('rosa');
    expect(useTheme.getState().overrides).toEqual({});
    expect(saved()).toEqual({ v: 1, presetId: 'rosa', overrides: {} });
  });

  it('aliases del Panel de control actual: themeId / setTheme / reset', () => {
    useTheme.getState().setTheme('menta');
    expect(useTheme.getState().themeId).toBe('menta');
    useTheme.getState().reset();
    expect(useTheme.getState().themeId).toBe('rosa');
  });

  it('initTheme aplica el tema del estado antes del primer render', () => {
    useTheme.setState({ presetId: 'lila', themeId: 'lila', overrides: { radius: 'square' } });
    initTheme();
    expect(css('--brand-500')).toBe(shades(themeById('lila'))[500]);
    expect(css('--radius')).toBe('0.125rem');
  });
});
