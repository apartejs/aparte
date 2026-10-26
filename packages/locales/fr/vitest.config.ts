import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        globals: true,
        environment: 'node',
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'development'],
    },
});
