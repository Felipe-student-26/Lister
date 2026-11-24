/** @type {import('tailwindcss').Config} */
// La paleta `brand` lee variables CSS (--brand-50 … --brand-900) definidas en src/index.css y cambiadas en vivo
// por el "Panel de control" (src/lib/theme.ts). Formato "r g b" para que funcionen las opacidades (bg-brand-900/40).
const brand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`]),
);

// Colores de letra: text-brand-600…900 leen --ink-* (color de letra personalizado) y, si no existe, la paleta brand.
const textBrand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [
    k,
    k >= 600 ? `rgb(var(--ink-${k}, var(--brand-${k})) / <alpha-value>)` : `rgb(var(--brand-${k}) / <alpha-value>)`,
  ]),
);
const surface = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand,
        // Superficies del tema (Panel de control): header, sidebar, tablas
        header: surface('header'),
        sidebar: surface('sidebar'),
        thead: surface('thead'),
        trow: surface('trow'),
        // Superficies neutras (minimalista: casi blanco, sin tinte)
        cream: { 50: '#fcfcfc', 100: '#f8f7f7', 200: '#edebeb' },
        // Errores / acciones destructivas: rojo, distinto del rosa de marca
        clay: { 400: '#e8847c', 500: '#d6453d', 600: '#b83228' },
      },
      textColor: { brand: textBrand },
      // --radius = rounded-2xl (1rem por defecto); el resto escala con él. rounded-full no cambia.
      borderRadius: {
        xl: 'calc(var(--radius) * 0.75)',
        '2xl': 'var(--radius)',
        xl2: 'calc(var(--radius) * 1.25)',
        xl3: 'calc(var(--radius) * 1.75)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px -12px rgba(0, 0, 0, 0.12)',
        softer: '0 1px 2px rgba(0, 0, 0, 0.05)',
        lift: '0 2px 4px rgba(0, 0, 0, 0.04), 0 16px 32px -16px rgba(0, 0, 0, 0.18)',
        modal: '0 24px 64px -16px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.06)',
        inset: 'inset 0 1px 2px rgba(0, 0, 0, 0.03)',
        brand: '0 1px 2px rgb(var(--brand-700) / 0.25), 0 6px 16px -8px rgb(var(--brand-600) / 0.55)',
        ring: '0 0 0 3px rgb(var(--brand-500) / 0.15)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};
