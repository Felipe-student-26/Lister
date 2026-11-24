import { defineConfig } from 'vitest/config';

// Pruebas de reglas de Firestore (`npm run test:rules`): se ejecutan dentro del emulador, aparte de `npm test`.
export default defineConfig({
  test: { environment: 'node', include: ['tests/rules/**/*.test.ts'], hookTimeout: 30_000, testTimeout: 30_000 },
});
