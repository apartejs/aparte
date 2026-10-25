import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';
import { isAparteElement } from './src/is-aparte-element';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The server-render specs: what Nuxt does with these components on the server.
 *
 * Node environment, `@aparte/core` resolved to its entry without elements (`index.node.ts`,
 * what the `node` export condition gives a server render), and none of core's jsdom
 * polyfills: the components must render with none of them.
 */
export default defineConfig({
    plugins: [vue({ template: { compilerOptions: { isCustomElement: isAparteElement } } })],
    test: {
        // Named apart from the package's main project, which the root workspace also lists.
        name: '@aparte/vue (server)',
        globals: true,
        environment: 'node',
        include: ['src/**/*.server.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.node.ts'),
        },
    },
});
