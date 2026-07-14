import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Headless by default — pure Node. The parity suite that drives core's
        // DOM-coupled `_streamLoop` overrides this per-file via a
        // `// @vitest-environment jsdom` pragma. `@aparte/core` resolves from its
        // built dist (node/browser export conditions), so run `pnpm build` (or CI's
        // build step) before the tests.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'node',
    },
});
