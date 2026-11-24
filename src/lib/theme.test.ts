import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyTheme, BACKGROUND_COLORS, backgroundCss, BG_SHAPES, contrastRatio, DEFAULT_THEME_ID, effectiveTheme, FONTS, inkVars, loadTheme, normalizeValue, parseSaved,
  PRESETS, previewColors, pruneOverrides, RADII, sanitizeOverrides, serializeSelection, SHADES, shades, swatchHex, TABLE_COLORS, TEXT_COLORS, themeById, themeVars,
  THEME_KEY, TOKEN_KEYS, type ThemeSelection,
} from './theme';

// Vitest sustituye los .css por '' (también con ?raw) salvo que se active test.css; se lee el archivo real.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const config = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8');

describe('temas predeterminados', () => {
  it('hay 6, el primero es Rosa clásico y es el predeterminado', () => {
    expect(PRESETS).toHaveLength(6);
    expect(PRESETS.map((p) => p.name)).toEqual(['Rosa clásico', 'Acuarela', 'Lila suave', 'Menta', 'Cielo', 'Durazno']);
    expect(DEFAULT_THEME_ID).toBe('rosa');
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(6);
  });

  it('cada predeterminado define TODOS los tokens con valores válidos', () => {
    for (const p of PRESETS) {
      for (const key of TOKEN_KEYS) expect(normalizeValue(key, p[key]), `${p.id}.${key}`).toBe(p[key]);
    }
  });

  it('las variables por defecto de index.css coinciden con Rosa clásico (el aspecto actual)', () => {
    const { set, remove } = themeVars(themeById('rosa'));
    for (const [name, value] of Object.entries(set)) expect(css, name).toContain(`${name}: ${value};`);
    // Sin color de letra personalizado no hay --ink-*: el texto sigue la paleta brand.
    for (const name of remove) expect(css).not.toContain(`${name}:`);
  });

  it('el tema por defecto conserva los valores de siempre (cream-100, blanco, rosa, radio 1rem, sin fondo decorativo)', () => {
    const r = themeById('rosa');
    expect(r.backgroundColor).toBe('#f8f7f7');
    expect(r.radius).toBe('round');
    expect(RADII.round.rem).toBe('1rem');
    expect(r.backgroundShape).toBe('plain');
    expect(r.fontFamily).toBe('system');
    expect(r.fontSize).toBe('normal');
    expect(r.tableColor).toBe('#f8c9da'); // rosa marcado: header, sidebar y encabezado de tablas
  });

  it('cada tema genera 10 tonos "r g b" válidos, de claro a oscuro', () => {
    for (const t of PRESETS) {
      const v = shades(t);
      const lum = SHADES.map((s) => {
        const [r, g, b] = v[s].split(' ').map(Number);
        expect([r, g, b].every((c) => Number.isInteger(c) && c >= 0 && c <= 255)).toBe(true);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
      for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1]);
    }
  });

  it('swatchHex devuelve #rrggbb y un id desconocido cae en el predeterminado', () => {
    for (const t of PRESETS) expect(swatchHex(t)).toMatch(/^#[0-9a-f]{6}$/);
    expect(themeById('no-existe').id).toBe('rosa');
    expect(themeById(null).id).toBe('rosa');
    expect(themeById('lila').id).toBe('lila');
  });
});

describe('contraste legible en los 6 predeterminados', () => {
  it('la letra se lee (≥ 4.5:1) sobre fondo, header, sidebar y tablas', () => {
    for (const p of PRESETS) {
      for (const surface of ['backgroundColor', 'tableColor'] as const) {
        expect(contrastRatio(p.textColor, p[surface]), `${p.id}: letra sobre ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(p.textColor, '#ffffff'), `${p.id}: letra sobre las filas`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el texto de acento (brand-700, etiquetas y enlaces) se lee sobre el fondo y el blanco', () => {
    for (const p of PRESETS) {
      const [r, g, b] = shades(p)[700].split(' ').map(Number);
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      expect(contrastRatio(hex, p.backgroundColor), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hex, '#ffffff'), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('los botones (letra blanca sobre brand-600) llegan al menos a 3:1', () => {
    for (const p of PRESETS) {
      const [r, g, b] = shades(p)[600].split(' ').map(Number);
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      expect(contrastRatio('#ffffff', hex), p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('contrastRatio: negro/blanco = 21, igual = 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('predeterminado + personalizaciones', () => {
  it('tema efectivo = { ...predeterminado, ...overrides }: cambiar un ajuste conserva el resto', () => {
    const sel: ThemeSelection = { presetId: 'menta', overrides: { textColor: '#222222' } };
    const eff = effectiveTheme(sel);
    const base = themeById('menta');
    expect(eff.textColor).toBe('#222222');
    for (const key of TOKEN_KEYS.filter((k) => k !== 'textColor')) expect(eff[key], key).toBe(base[key]);
    expect(eff.id).toBe('menta');
  });

  it('pruneOverrides descarta lo que iguala al predeterminado', () => {
    const base = themeById('cielo');
    expect(pruneOverrides('cielo', { textColor: base.textColor, radius: 'pill' })).toEqual({ radius: 'pill' });
  });

  it('normalizeValue / sanitizeOverrides rechazan valores inválidos y ajustan rangos', () => {
    expect(normalizeValue('textColor', '#ABCDEF')).toBe('#abcdef');
    expect(normalizeValue('textColor', 'rojo')).toBeUndefined();
    expect(normalizeValue('radius', 'enorme')).toBeUndefined();
    expect(normalizeValue('fontFamily', 'comic')).toBeUndefined();
    expect(normalizeValue('brandHue', 400)).toBe(360);
    expect(normalizeValue('brandSaturation', -5)).toBe(0);
    expect(sanitizeOverrides({ textColor: '#111111', radius: 'x', basura: 1 })).toEqual({ textColor: '#111111' });
    expect(sanitizeOverrides(null)).toEqual({});
  });

  it('las opciones de cada token existen', () => {
    expect(Object.keys(FONTS)).toHaveLength(6);
    expect(Object.keys(RADII)).toEqual(['square', 'soft', 'round', 'pill']);
    expect(Object.keys(BG_SHAPES)).toHaveLength(5);
  });

  it('previewColors devuelve letra, tablas y fondo', () => {
    const t = themeById('acuarela');
    expect(previewColors(t)).toEqual({ texto: t.textColor, tablas: t.tableColor, fondo: t.backgroundColor });
  });
});

describe('Tablas: un solo color para header, sidebar y encabezado de tablas', () => {
  it('los tres se escriben con el mismo color y las filas son blancas', () => {
    for (const p of PRESETS) {
      const { set } = themeVars({ ...p, tableColor: '#eef7f3' });
      expect(set['--header']).toBe('238 247 243');
      expect(set['--sidebar']).toBe(set['--header']);
      expect(set['--thead']).toBe(set['--header']);
      expect(set['--trow']).toBe('255 255 255');
    }
  });

  it('cada predeterminado usa un color de la paleta de Tablas y todos los de la paleta son válidos y legibles', () => {
    const colors = TABLE_COLORS.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const p of PRESETS) expect(colors, p.id).toContain(p.tableColor);
    for (const c of TABLE_COLORS) {
      expect(normalizeValue('tableColor', c.color), c.name).toBe(c.color);
      for (const p of PRESETS) expect(contrastRatio(p.textColor, c.color), `${p.id} sobre ${c.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('los colores de letra de la paleta se leen sobre blanco', () => {
    for (const c of TEXT_COLORS) expect(contrastRatio(c.color, '#ffffff'), c.name).toBeGreaterThanOrEqual(4.5);
  });

  it('los ajustes guardados con el modelo anterior (header, sidebar, tabla suelta) se descartan sin romper nada', () => {
    const raw = JSON.stringify({ v: 1, presetId: 'lila', overrides: { headerColor: '#ff0000', sidebarColor: '#00ff00', tableHeaderColor: '#0000ff', tableRowColor: '#111111', radius: 'square' } });
    expect(parseSaved(raw)).toEqual({ presetId: 'lila', overrides: { radius: 'square' } });
  });
});

describe('Color de fondo', () => {
  it('cada predeterminado usa un color de la paleta y todos los de la paleta son válidos, distintos y legibles', () => {
    const colors = BACKGROUND_COLORS.map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    for (const p of PRESETS) expect(colors, p.id).toContain(p.backgroundColor);
    for (const c of BACKGROUND_COLORS) {
      expect(normalizeValue('backgroundColor', c.color), c.name).toBe(c.color);
      for (const p of PRESETS) expect(contrastRatio(p.textColor, c.color), `${p.id} sobre ${c.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('persistencia y migración (lister.theme)', () => {
  it('sin guardado: predeterminado', () => {
    expect(parseSaved(null)).toEqual({ presetId: 'rosa', overrides: {} });
    expect(parseSaved('')).toEqual({ presetId: 'rosa', overrides: {} });
  });

  it('formato nuevo: ida y vuelta', () => {
    const sel: ThemeSelection = { presetId: 'lila', overrides: { textColor: '#333333', radius: 'square' } };
    expect(parseSaved(serializeSelection(sel))).toEqual(sel);
  });

  it('formato nuevo con basura: ignora lo inválido y quita lo que no difiere', () => {
    const raw = JSON.stringify({ presetId: 'nada', overrides: { radius: 'round', textColor: 'x', fontSize: 'large' } });
    expect(parseSaved(raw)).toEqual({ presetId: 'rosa', overrides: { fontSize: 'large' } }); // radius 'round' ya es el de rosa
    expect(parseSaved('{roto')).toEqual({ presetId: 'rosa', overrides: {} });
  });

  it('migra el valor antiguo (solo un id)', () => {
    expect(parseSaved('menta')).toEqual({ presetId: 'menta', overrides: {} });
    expect(parseSaved('cielo')).toEqual({ presetId: 'cielo', overrides: {} });
    expect(parseSaved('desconocido')).toEqual({ presetId: 'rosa', overrides: {} });
  });

  it('el antiguo "fucsia" ya no es predeterminado: pasa a rosa con su matiz', () => {
    expect(parseSaved('fucsia')).toEqual({ presetId: 'rosa', overrides: { brandHue: 322, brandSaturation: 68 } });
  });

  it('loadTheme lee la clave lister.theme y tolera un storage roto', () => {
    expect(loadTheme({ getItem: (k) => (k === THEME_KEY ? 'lila' : null) }).presetId).toBe('lila');
    expect(loadTheme({ getItem: () => { throw new Error('denegado'); } })).toEqual({ presetId: 'rosa', overrides: {} });
    expect(loadTheme(undefined)).toEqual({ presetId: 'rosa', overrides: {} });
    expect(THEME_KEY).toBe('lister.theme');
  });
});

describe('variables CSS', () => {
  it('color de letra natural: sin --ink (el texto sigue la paleta); personalizado: --ink derivados y ordenados', () => {
    expect(inkVars(themeById('rosa'))).toBeNull();
    const ink = inkVars({ ...themeById('rosa'), textColor: '#1a237e' })!;
    expect(ink['--ink-900']).toBe('26 35 126');
    const lum = ['--ink-900', '--ink-800', '--ink-700', '--ink-600'].map((k) => {
      const [r, g, b] = ink[k].split(' ').map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeGreaterThan(lum[i - 1]); // más claro cuanto menor el número
  });

  it('un color de letra claro se oscurece hacia abajo en la jerarquía (no se funde con el fondo)', () => {
    const ink = inkVars({ ...themeById('rosa'), textColor: '#e5e5e5' })!;
    const l = (k: string) => Number(ink[k].split(' ')[0]);
    expect(l('--ink-600')).toBeLessThan(l('--ink-900'));
  });

  it('el radio, tamaño y tipografía se traducen a variables', () => {
    const { set } = themeVars({ ...themeById('rosa'), radius: 'pill', fontSize: 'large', fontFamily: 'lora' });
    expect(set['--radius']).toBe('1.5rem');
    expect(set['--font-size']).toBe('112.5%');
    expect(set['--font-sans']).toContain('Lora');
  });

  it('tailwind.config.js lee las variables (radio, fuente, superficies y letra)', () => {
    for (const piece of ['var(--radius)', 'var(--font-sans)', "surface('header')", "surface('sidebar')", "surface('thead')", "surface('trow')", '--ink-']) {
      expect(config).toContain(piece);
    }
  });

  it('las 5 formas de fondo son CSS/SVG inline (sin imágenes externas)', () => {
    const base = themeById('rosa');
    expect(backgroundCss({ ...base, backgroundShape: 'plain' }).image).toBe('none');
    for (const shape of ['gradient', 'dots', 'waves', 'watercolor'] as const) {
      const bg = backgroundCss({ ...base, backgroundShape: shape });
      expect(bg.image, shape).not.toBe('none');
      expect(bg.image, shape).not.toMatch(/url\(["']?https?:/); // solo data: URI; el xmlns del SVG no es una descarga
    }
    expect(backgroundCss({ ...base, backgroundShape: 'waves' }).image).toContain('data:image/svg+xml');
  });

  it('applyTheme escribe las variables, quita --ink, y actualiza data-theme y el color de la barra', () => {
    const props: Record<string, string> = {};
    const removed: string[] = [];
    const meta = { content: '' };
    const doc = {
      documentElement: { style: { setProperty: (k: string, v: string) => (props[k] = v), removeProperty: (k: string) => removed.push(k) }, dataset: {} as Record<string, string> },
      querySelector: () => ({ setAttribute: (_: string, v: string) => (meta.content = v) }),
    } as unknown as Document;
    applyTheme('cielo', doc);
    const t = themeById('cielo');
    expect(props['--brand-500']).toBe(shades(t)[500]);
    expect(props['--app-bg']).toBe('245 249 252');
    expect(props['--font-sans']).toContain('Poppins');
    expect(removed).toContain('--ink-900');
    expect(doc.documentElement.dataset.theme).toBe('cielo');
    expect(meta.content).toBe(swatchHex(t));
    applyTheme({ presetId: 'cielo', overrides: { textColor: '#000000' } }, doc);
    expect(props['--ink-900']).toBe('0 0 0');
  });
});
