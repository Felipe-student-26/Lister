/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // base relativa para que funcione dentro de Electron (file://) y Capacitor
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lister',
        short_name: 'Lister',
        description: 'Agenda y expedientes terapéuticos',
        theme_color: '#e1477a',
        background_color: '#f8f7f7',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'] },
    }),
  ],
  test: {
    // Por defecto node (rápido); los tests de componentes declaran `// @vitest-environment jsdom` en su archivo.
    environment: 'node',
    globals: true,
    // Las reglas de Firestore necesitan el emulador: se ejecutan aparte con `npm run test:rules`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**', 'functions/lib/**', 'tests/rules/**'],
  },
});
