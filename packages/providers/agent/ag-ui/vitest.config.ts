import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fully offline: the AG-UI wire is replayed from a fake `fetch`, and the
        // TanStack AI suite runs TanStack's own server over its scripted `fakeText` model.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'node',
    },
});
