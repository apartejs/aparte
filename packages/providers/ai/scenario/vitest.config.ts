import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        // Node: the provider is pure data + a ReadableStream; it imports nothing from
        // core at runtime (types only), so no DOM is needed to test it.
        environment: 'node',
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'development'],
    },
});
