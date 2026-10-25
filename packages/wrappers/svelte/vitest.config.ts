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
            // The Svelte-4-syntax components and their tests drive instances through the
            // Svelte 4 component API (`$set`, `$on`), which Svelte 5 keeps only behind this
            // flag. The runes components under `runes/` are compiled without it: their tests
            // must pass the way a Svelte 5 app uses them.
            dynamicCompileOptions: ({ filename }) =>
                filename.replace(/\\/g, '/').includes('/runes/') ? undefined : { compatibility: { componentApi: 4 } },
        }),
    ],
    // Svelte's BROWSER build, not its server one. Without this condition Vite hands
    // the test the SSR entry of `svelte`, where `onMount` never runs: every test in
    // this file passed with the host never constructed, the root listeners never
    // attached and `<AparteUi>` never creating its element — found by the first test
    // that asserted an onMount effect (the callback props, #47).
    resolve: { conditions: ['browser'] },
    test: {
        globals: true,
        environment: 'jsdom',
        // The wrapper mounts REAL core web components, so resolve `@aparte/core`
        // from source (its custom elements register on import) and reuse core's
        // jsdom polyfills (ResizeObserver, …).
        setupFiles: [resolve(__dirname, '../../core/vitest.setup.ts')],
        include: ['src/**/*.test.ts'],
        // The server renders run in their own project (vitest.server.config.ts).
        exclude: ['src/**/*.server.test.ts', '**/node_modules/**'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
