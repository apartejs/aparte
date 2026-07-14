import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        // jsdom: this suite drives the browser-direct `DirectTransport`, which core
        // exposes only from its *browser* entry (the Node-safe entry omits it). We
        // resolve `@aparte/core` from source via the `@aparte-workspace/source`
        // condition (below) — the same dev mechanism the docs app uses — so core's
        // web-component source needs a DOM to load.
        environment: 'jsdom',
        // Inline `@aparte/core` so Vite (not Node) resolves it, honouring the source
        // condition below instead of the externalised `node` condition.
        server: { deps: { inline: ['@aparte/core'] } },
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'browser', 'development'],
    },
});
