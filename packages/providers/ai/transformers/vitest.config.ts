import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // jsdom: the provider touches browser globals (navigator, caches, crypto,
        // Worker, dispatchEvent). The worker itself is never loaded here — the suite
        // stubs `Worker`, so `@huggingface/transformers` is never imported at test time.
        // `@aparte/core` is only used for the erased types + `contentToText` (present in
        // the Node-safe entry), so no source condition is needed.
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        environment: 'jsdom',
    },
});
