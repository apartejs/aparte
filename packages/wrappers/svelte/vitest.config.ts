import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        svelte({
            // Bypass svelte.config.js (its vitePreprocess() is incompatible with Vite 6
            // in the test env); only preprocess TypeScript, skip CSS.
            configFile: false,
            preprocess: vitePreprocess({ style: false }),
        }),
    ],
    test: {
        globals: true,
        environment: 'jsdom',
        // The wrapper mounts REAL core web components, so resolve `@aparte/core`
        // from source (its custom elements register on import) and reuse core's
        // jsdom polyfills (ResizeObserver, …).
        setupFiles: [resolve(__dirname, '../../core/vitest.setup.ts')],
        include: ['src/**/*.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
