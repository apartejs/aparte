import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The server-render specs: what SvelteKit does with `<AparteChat>` on the server.
 *
 * Node environment, Svelte's SERVER build (no `browser` condition), `@aparte/core` resolved to
 * its entry without elements (`index.node.ts`, what the `node` export condition gives a server
 * render), and none of core's jsdom polyfills: the component must render with none of them.
 */
export default defineConfig({
    plugins: [svelte({ configFile: false, preprocess: vitePreprocess({ style: false }) })],
    test: {
        // Named apart from the package's main project, which the root workspace also lists.
        name: '@aparte/svelte (server)',
        globals: true,
        environment: 'node',
        include: ['src/**/*.server.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.node.ts'),
        },
    },
});
