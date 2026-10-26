import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fully offline: n8n's replies are replayed from a fake `fetch`, most of them
        // recorded byte for byte from a live n8n (see src/__tests__/fixtures/README.md).
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'node',
    },
});
