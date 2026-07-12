import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts']
    }
});
