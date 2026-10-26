import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // The widget is real DOM over a faked n8n: every answer comes from a scripted `fetch`.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        // Inlined so the source condition below reaches core's own import of the engine.
        server: { deps: { inline: [/^@aparte\//] } },
    },
    resolve: {
        // The packages it puts together, from their source: a test never runs a stale dist.
        conditions: ['@aparte-workspace/source', 'module', 'browser', 'development'],
    },
});
