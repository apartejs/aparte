import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        // Core runs the engine's loop (D1). Inline the package so Vite resolves it
        // and honours the source condition below — the tests then exercise the
        // engine's SOURCE, not a dist that may be a build behind.
        server: { deps: { inline: ['@aparte/engine'] } },
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'browser', 'development'],
    },
});
