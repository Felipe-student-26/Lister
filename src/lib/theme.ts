/**
 * Sistema de temas por tokens. Un tema = un predeterminado (PRESETS) + personalizaciones (overrides) encima.
 * Los tokens se escriben como variables CSS en <html> (ver `themeVars`); Tailwind y src/index.css las leen,
 * así que cambiar de tema es reescribir variables, sin recargar. Se guarda por dispositivo (localStorage).
 */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Shade = (typeof SHADES)[number];

export type FontSize = 'small' | 'normal' | 'large';
export type Radius = 'square' | 'soft' | 'round' | 'pill';
export type BgShape = 'plain' | 'gradient' | 'dots' | 'waves' | 'watercolor';
export type FontId = 'system' | 'nunito' | 'inter' | 'lora' | 'poppins' | 'playfair';

/** Todo lo que se puede cambiar de un tema. Los colores son #rrggbb. */
export interface Tokens {
  /** Color principal: la paleta brand-* (tono y saturación; la luminosidad de cada tono es fija). */
  brandHue: number;
  brandSaturation: number;
  textColor: string;
  fontSize: FontSize;
  fontFamily: FontId;
  /** Color de "Tablas": rige a la vez el header, el sidebar y el encabezado de las tablas. */
  tableColor: string;
  backgroundColor: string;
  radius: Radius;
  backgroundShape: BgShape;
}
export type TokenKey = keyof Tokens;
export const TOKEN_KEYS: TokenKey[] = [
  'brandHue', 'brandSaturation', 'textColor', 'fontSize', 'fontFamily', 'tableColor', 'backgroundColor', 'radius', 'backgroundShape',
];

export interface Preset extends Tokens {
  id: string;
  name: string;
}
/** Compatibilidad: antes `Theme` era { id, name, hue, saturation }. */
export type Theme = Preset;

/* ---------- opciones de cada token (las usa el Panel de control) ---------- */

export const FONT_SIZES: Record<FontSize, { label: string; percent: string }> = {
  small: { label: 'Pequeño', percent: '87.5%' },
  normal: { label: 'Normal', percent: '100%' },
  large: { label: 'Grande', percent: '112.5%' },
};

export const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Las fuentes se cargan con @fontsource (src/lib/fontFaces.ts): funcionan sin internet. */
export const FONTS: Record<FontId, { label: string; stack: string }> = {
  system: { label: 'Sistema', stack: SYSTEM_STACK },
  nunito: { label: 'Nunito', stack: `Nunito, ${SYSTEM_STACK}` },
  inter: { label: 'Inter', stack: `Inter, ${SYSTEM_STACK}` },
  lora: { label: 'Lora', stack: `Lora, Georgia, "Times New Roman", serif` },
  poppins: { label: 'Poppins', stack: `Poppins, ${SYSTEM_STACK}` },
  playfair: { label: 'Playfair Display', stack: `"Playfair Display", Georgia, "Times New Roman", serif` },
};

/** Radio base (rounded-2xl). rounded-xl = ×0.75, rounded-xl2 = ×1.25, rounded-xl3 = ×1.75 (ver tailwind.config.js). */
export const RADII: Record<Radius, { label: string; rem: string }> = {
  square: { label: 'Cuadrado', rem: '0.125rem' },
  soft: { label: 'Suave', rem: '0.6rem' },
  round: { label: 'Redondo', rem: '1rem' },
  pill: { label: 'Muy redondo', rem: '1.5rem' },
};

/** Colores que se pueden elegir para "Tablas" (header + sidebar + encabezado de tablas). Siempre claros: el texto debe leerse encima. */
export const TABLE_COLORS: Array<{ name: string; color: string }> = [
  { name: 'Blanco', color: '#ffffff' },
  { name: 'Rosa', color: '#f8c9da' },
  { name: 'Durazno', color: '#fbd9b8' },
  { name: 'Crema', color: '#f7e7a8' },
  { name: 'Menta', color: '#bfe6d3' },
  { name: 'Cielo', color: '#bcdcf2' },
  { name: 'Lila', color: '#d9c6ef' },
  { name: 'Gris', color: '#dcdfe4' },
];

/** Colores que se pueden elegir para el fondo de la app. Siempre muy claros: es lo que queda detrás de las tarjetas blancas. */
export const BACKGROUND_COLORS: Array<{ name: string; color: string }> = [
  { name: 'Gris suave', color: '#f8f7f7' },
  { name: 'Blanco', color: '#ffffff' },
  { name: 'Rosa', color: '#fdf5f8' },
  { name: 'Durazno', color: '#fcf8f4' },
  { name: 'Crema', color: '#fcfaf2' },
  { name: 'Menta', color: '#f5f9f7' },
  { name: 'Cielo', color: '#f5f9fc' },
  { name: 'Azulado', color: '#f7f8fc' },
  { name: 'Lila', color: '#f8f6fb' },
  { name: 'Gris claro', color: '#f3f4f6' },
];

/** Colores de letra que se pueden elegir (oscuros, legibles sobre fondos claros). El del tema se agrega delante. */
export const TEXT_COLORS: Array<{ name: string; color: string }> = [
  { name: 'Negro suave', color: '#1a1a1a' },
  { name: 'Carbón', color: '#2d3748' },
  { name: 'Azul noche', color: '#1e3a5f' },
  { name: 'Verde bosque', color: '#14532d' },
  { name: 'Morado', color: '#3b1f5e' },
  { name: 'Café', color: '#4a2c17' },
  { name: 'Vino', color: '#5c0f29' },
];

export const BG_SHAPES: Record<BgShape, string> = {
  plain: 'Liso',
  gradient: 'Degradado',
  dots: 'Puntos',
  waves: 'Ondas',
  watercolor: 'Acuarela',
};

/* ---------- color ---------- */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Luminosidad (%) de cada tono: 50 casi blanco … 900 muy oscuro. */
const LIGHTNESS: Record<Shade, number> = { 50: 97, 100: 94, 200: 88, 300: 79, 400: 68, 500: 58, 600: 46, 700: 38, 800: 30, 900: 21 };

type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s * 100, l * 100];
}

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
export const rgbToHex = (rgb: RGB): string => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
const channels = (hex: string) => hexToRgb(hex).join(' ');

/** Canales "r g b" de cada tono (Tailwind los combina con la opacidad: rgb(var(--brand-500) / 0.4)). */
export function shades(theme: Pick<Tokens, 'brandHue' | 'brandSaturation'>): Record<Shade, string> {
  const out = {} as Record<Shade, string>;
  for (const s of SHADES) out[s] = hslToRgb(theme.brandHue, theme.brandSaturation, LIGHTNESS[s]).join(' ');
  return out;
}
const shadeHex = (theme: Pick<Tokens, 'brandHue' | 'brandSaturation'>, s: Shade) => rgbToHex(shades(theme)[s].split(' ').map(Number) as RGB);

/** Color representativo (tono 500) en #rrggbb, para muestras y <meta name="theme-color">. */
export const swatchHex = (theme: Pick<Tokens, 'brandHue' | 'brandSaturation'>): string => shadeHex(theme, 500);

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contraste WCAG entre dos #rrggbb (1 a 21; 4.5 = texto normal legible). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- temas predeterminados ---------- */

function preset(id: string, name: string, hue: number, sat: number, extra: Partial<Tokens> = {}): Preset {
  const brand = { brandHue: hue, brandSaturation: sat };
  return {
    id,
    name,
    ...brand,
    textColor: shadeHex(brand, 900),
    fontSize: 'normal',
    fontFamily: 'system',
    tableColor: '#f8c9da',
    backgroundColor: '#f8f7f7',
    radius: 'round',
    backgroundShape: 'plain',
    ...extra,
  };
}

/** El primero (Rosa clásico) es el aspecto actual de la app y el predeterminado. */
export const PRESETS: Preset[] = [
  preset('rosa', 'Rosa clásico', 340, 72),
  preset('acuarela', 'Acuarela', 230, 50, { backgroundColor: '#f7f8fc', tableColor: '#bcdcf2', fontFamily: 'lora', radius: 'pill', backgroundShape: 'watercolor' }),
  preset('lila', 'Lila suave', 268, 52, { backgroundColor: '#f8f6fb', tableColor: '#d9c6ef', fontFamily: 'nunito', radius: 'pill', backgroundShape: 'gradient' }),
  preset('menta', 'Menta', 160, 28, { backgroundColor: '#f5f9f7', tableColor: '#bfe6d3', fontFamily: 'inter', radius: 'soft', backgroundShape: 'dots' }),
  preset('cielo', 'Cielo', 205, 62, { backgroundColor: '#f5f9fc', tableColor: '#bcdcf2', fontFamily: 'poppins', backgroundShape: 'waves' }),
  preset('durazno', 'Durazno', 24, 82, { backgroundColor: '#fcf8f4', tableColor: '#fbd9b8', radius: 'pill' }),
];
/** Compatibilidad con el nombre anterior. */
export const THEMES = PRESETS;
export const DEFAULT_THEME_ID = PRESETS[0].id;

export const themeById = (id: string | null | undefined): Preset => PRESETS.find((t) => t.id === id) ?? PRESETS[0];

/* ---------- selección (predeterminado + personalizaciones) ---------- */

export interface ThemeSelection {
  presetId: string;
  overrides: Partial<Tokens>;
}
export const DEFAULT_SELECTION: ThemeSelection = { presetId: DEFAULT_THEME_ID, overrides: {} };

/** Devuelve el valor válido para ese token, o undefined si no lo es. */
export function normalizeValue<K extends TokenKey>(key: K, value: unknown): Tokens[K] | undefined {
  const ok = (v: unknown) => v as Tokens[K];
  switch (key) {
    case 'brandHue':
      return typeof value === 'number' && Number.isFinite(value) ? ok(Math.round(clamp(value, 0, 360))) : undefined;
    case 'brandSaturation':
      return typeof value === 'number' && Number.isFinite(value) ? ok(Math.round(clamp(value, 0, 100))) : undefined;
    case 'textColor':
    case 'tableColor':
    case 'backgroundColor':
      return isHex(value) ? ok(value.toLowerCase()) : undefined;
    case 'fontSize':
      return typeof value === 'string' && value in FONT_SIZES ? ok(value) : undefined;
    case 'fontFamily':
      return typeof value === 'string' && value in FONTS ? ok(value) : undefined;
    case 'radius':
      return typeof value === 'string' && value in RADII ? ok(value) : undefined;
    case 'backgroundShape':
      return typeof value === 'string' && value in BG_SHAPES ? ok(value) : undefined;
    default:
      return undefined;
  }
}

/** Se queda solo con claves y valores válidos. */
export function sanitizeOverrides(raw: unknown): Partial<Tokens> {
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === 'object') {
    for (const key of TOKEN_KEYS) {
      const v = normalizeValue(key, (raw as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
  }
  return out as Partial<Tokens>;
}

/** Tema efectivo = { ...predeterminado, ...personalizaciones }. */
export function effectiveTheme(sel: ThemeSelection): Preset {
  return { ...themeById(sel.presetId), ...sel.overrides };
}

/** Solo deja las personalizaciones que realmente difieren del predeterminado. */
export function pruneOverrides(presetId: string, overrides: Partial<Tokens>): Partial<Tokens> {
  const base = themeById(presetId);
  const out: Record<string, unknown> = {};
  for (const key of TOKEN_KEYS) {
    const v = overrides[key];
    if (v !== undefined && v !== base[key]) out[key] = v;
  }
  return out as Partial<Tokens>;
}

/** Colores de la muestra de un tema en el Panel de control (3 franjas: letra, tablas/header/sidebar, fondo). */
export function previewColors(theme: Pick<Tokens, 'textColor' | 'tableColor' | 'backgroundColor'>): { texto: string; tablas: string; fondo: string } {
  return { texto: theme.textColor, tablas: theme.tableColor, fondo: theme.backgroundColor };
}

/* ---------- persistencia ---------- */

export const THEME_KEY = 'lister.theme';

/** Formato: JSON {"v":1,"presetId":"…","overrides":{…}}. El formato antiguo era solo un id de tema. */
export function parseSaved(raw: string | null | undefined): ThemeSelection {
  if (!raw) return { presetId: DEFAULT_THEME_ID, overrides: {} };
  const text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text) as { presetId?: unknown; overrides?: unknown };
      const presetId = themeById(typeof data.presetId === 'string' ? data.presetId : null).id;
      return { presetId, overrides: pruneOverrides(presetId, sanitizeOverrides(data.overrides)) };
    } catch {
      return { presetId: DEFAULT_THEME_ID, overrides: {} };
    }
  }
  // Valor antiguo (solo un id). "fucsia" ya no es predeterminado: se conserva como rosa con su matiz.
  if (text === 'fucsia') return { presetId: 'rosa', overrides: { brandHue: 322, brandSaturation: 68 } };
  return { presetId: themeById(text).id, overrides: {} };
}

export const serializeSelection = (sel: ThemeSelection): string => JSON.stringify({ v: 1, presetId: sel.presetId, overrides: sel.overrides });

export function loadTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemeSelection {
  try {
    return parseSaved(storage?.getItem(THEME_KEY));
  } catch {
    return { presetId: DEFAULT_THEME_ID, overrides: {} };
  }
}

/* ---------- variables CSS ---------- */

/** Fondo decorativo (CSS/SVG inline, sin imágenes). Las ondas llevan el color escrito dentro del SVG. */
export function backgroundCss(theme: Tokens): { image: string; size: string } {
  const sh = shades(theme);
  const c = (s: Shade, a?: number) => `rgb(${sh[s]}${a === undefined ? '' : ` / ${a}`})`;
  switch (theme.backgroundShape) {
    case 'gradient':
      return {
        image: [
          `radial-gradient(120% 80% at 100% 0%, ${c(100, 0.9)} 0%, transparent 60%)`,
          `linear-gradient(165deg, rgb(${channels(theme.backgroundColor)}) 0%, rgb(${channels(theme.backgroundColor)}) 40%, ${c(100, 0.7)} 100%)`,
        ].join(', '),
        size: '100% 100%',
      };
    case 'dots':
      return { image: `radial-gradient(${c(400, 0.28)} 1.2px, transparent 1.4px)`, size: '20px 20px' };
    case 'waves': {
      const stroke = `rgb(${sh[300].split(' ').join(',')})`;
      const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='48' viewBox='0 0 160 48'%3E%3Cg fill='none' stroke='${stroke}' stroke-linecap='round' stroke-width='1.25'%3E%3Cpath d='M0 16 Q40 0 80 16 T160 16' stroke-opacity='.45'/%3E%3Cpath d='M0 40 Q40 24 80 40 T160 40' stroke-opacity='.25'/%3E%3C/g%3E%3C/svg%3E`;
      return { image: `url("data:image/svg+xml,${svg}")`, size: '160px 48px' };
    }
    case 'watercolor':
      return {
        image: [
          `radial-gradient(ellipse 60% 50% at 10% 15%, ${c(300, 0.3)} 0, transparent 70%)`,
          `radial-gradient(ellipse 55% 45% at 90% 85%, ${c(200, 0.5)} 0, transparent 70%)`,
          `radial-gradient(ellipse 40% 35% at 75% 10%, ${c(100, 0.8)} 0, transparent 70%)`,
          `radial-gradient(ellipse 45% 40% at 20% 90%, ${c(100, 0.6)} 0, transparent 70%)`,
        ].join(', '),
        size: '100% 100%',
      };
    default:
      return { image: 'none', size: 'auto' };
  }
}

const INK_STEPS: Array<[600 | 700 | 800, number]> = [[800, 9], [700, 17], [600, 25]];

/**
 * Tonos de texto text-brand-600/700/800/900 (tailwind.config.js los lee de --ink-*, con la paleta brand como respaldo).
 * Si el color de letra es el natural del tema, no se escriben (el texto sigue la paleta, igual que siempre);
 * si el usuario lo cambia, se derivan del color elegido con la misma jerarquía de luminosidad.
 */
export function inkVars(theme: Tokens): Record<string, string> | null {
  if (theme.textColor.toLowerCase() === shadeHex(theme, 900)) return null;
  const [h, s, l] = rgbToHsl(hexToRgb(theme.textColor));
  const dir = l < 55 ? 1 : -1;
  const out: Record<string, string> = { '--ink-900': channels(theme.textColor) };
  for (const [shade, step] of INK_STEPS) out[`--ink-${shade}`] = hslToRgb(h, s, clamp(l + dir * step, 0, 100)).join(' ');
  return out;
}

const INK_NAMES = ['--ink-900', '--ink-800', '--ink-700', '--ink-600'];

/** Todas las variables CSS de un tema efectivo (`remove` = las que deben quitarse de <html>). */
export function themeVars(theme: Tokens): { set: Record<string, string>; remove: string[] } {
  const set: Record<string, string> = {};
  const sh = shades(theme);
  for (const s of SHADES) set[`--brand-${s}`] = sh[s];
  // Un solo color ("Tablas") rige el header, el sidebar y el encabezado de las tablas; las filas siempre son blancas.
  set['--header'] = channels(theme.tableColor);
  set['--sidebar'] = channels(theme.tableColor);
  set['--thead'] = channels(theme.tableColor);
  set['--trow'] = '255 255 255';
  set['--app-bg'] = channels(theme.backgroundColor);
  set['--radius'] = RADII[theme.radius].rem;
  set['--font-sans'] = FONTS[theme.fontFamily].stack;
  set['--font-size'] = FONT_SIZES[theme.fontSize].percent;
  const bg = backgroundCss(theme);
  set['--bg-image'] = bg.image;
  set['--bg-size'] = bg.size;
  const ink = inkVars(theme);
  if (ink) Object.assign(set, ink);
  return { set, remove: ink ? [] : INK_NAMES };
}

/** Escribe las variables en <html> y actualiza el color de la barra del navegador. */
export function applyTheme(sel: ThemeSelection | string, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc) return;
  const selection = typeof sel === 'string' ? { presetId: sel, overrides: {} } : sel;
  const theme = effectiveTheme(selection);
  const { set, remove } = themeVars(theme);
  const style = doc.documentElement.style;
  for (const [k, v] of Object.entries(set)) style.setProperty(k, v);
  for (const k of remove) style.removeProperty(k);
  doc.documentElement.dataset.theme = theme.id;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', swatchHex(theme));
}
