import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Fully offline: the AI SDK is mocked via `ai/test` (MockLanguageModelV3).
        // Only the type `AparteStreamEvent` is imported from `@aparte/core` (erased),
        // so no runtime resolution of core is required here.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'node',
    },
});
