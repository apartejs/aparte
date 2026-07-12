import { defineConfig } from 'vitest/config';

// Root test config. Each package adds its own vitest.config.ts as it lands;
// this catches any root-level specs and keeps `pnpm test` green while empty.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
