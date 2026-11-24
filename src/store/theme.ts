import { create } from 'zustand';
import {
  applyTheme,
  DEFAULT_THEME_ID,
  effectiveTheme,
  loadTheme,
  normalizeValue,
  pruneOverrides,
  serializeSelection,
  themeById,
  THEME_KEY,
  type Preset,
  type ThemeSelection,
  type TokenKey,
  type Tokens,
} from '../lib/theme';

interface ThemeState {
  /** Tema predeterminado elegido. */
  presetId: string;
  /** Personalizaciones encima del predeterminado (solo lo que difiere de él). */
  overrides: Partial<Tokens>;
  setPreset: (id: string) => void;
  setOverride: <K extends TokenKey>(key: K, value: Tokens[K]) => void;
  /** Quita las personalizaciones y deja el predeterminado elegido. */
  resetOverrides: () => void;
  /** Vuelve al predeterminado de la app (Rosa clásico) sin personalizaciones. */
  resetAll: () => void;
  /** Alias de `presetId`, `setPreset` y `resetAll` (nombres anteriores, los usa el Panel de control actual). */
  themeId: string;
  setTheme: (id: string) => void;
  reset: () => void;
}

const initial = (): ThemeSelection => loadTheme(typeof localStorage === 'undefined' ? undefined : localStorage);

function persist(sel: ThemeSelection) {
  try {
    localStorage.setItem(THEME_KEY, serializeSelection(sel));
  } catch {
    /* almacenamiento no disponible: el tema queda solo en esta sesión */
  }
}

export const useTheme = create<ThemeState>((set, get) => {
  /** Aplica, guarda y publica el nuevo estado. */
  const commit = (sel: ThemeSelection) => {
    applyTheme(sel);
    persist(sel);
    set({ presetId: sel.presetId, themeId: sel.presetId, overrides: sel.overrides });
  };
  const start = initial();
  return {
    presetId: start.presetId,
    themeId: start.presetId,
    overrides: start.overrides,

    // Elegir otro predeterminado borra las personalizaciones.
    setPreset: (id) => commit({ presetId: themeById(id).id, overrides: {} }),

    // Cambiar un ajuste suelto conserva todo lo demás del tema.
    setOverride: (key, value) => {
      const v = normalizeValue(key, value);
      if (v === undefined) return;
      const { presetId, overrides } = get();
      commit({ presetId, overrides: pruneOverrides(presetId, { ...overrides, [key]: v }) });
    },

    resetOverrides: () => commit({ presetId: get().presetId, overrides: {} }),
    resetAll: () => commit({ presetId: DEFAULT_THEME_ID, overrides: {} }),

    setTheme: (id) => get().setPreset(id),
    reset: () => get().resetAll(),
  };
});

/** Tema efectivo (predeterminado + personalizaciones) de un estado del store. */
export const effectiveOf = (s: Pick<ThemeState, 'presetId' | 'overrides'>): Preset => effectiveTheme({ presetId: s.presetId, overrides: s.overrides });

/** Aplica el tema guardado antes del primer render (evita parpadeo). En celular también: tema guardado o el predeterminado. */
export function initTheme(): void {
  const { presetId, overrides } = useTheme.getState();
  applyTheme({ presetId, overrides });
}
