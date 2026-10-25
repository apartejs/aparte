import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { angularJitSignals } from './vitest.jit-signals';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The server-render specs: what an Angular SSR build does with `<aparte-chat>`.
 *
 * A separate project because nothing from the browser setup may leak in. `@aparte/core`
 * resolves to its entry without elements (`index.node.ts`, what the `node` export condition
 * hands a server render), and neither core's jsdom polyfills nor zone.js are loaded: the
 * component must render on the server with none of them, or a real SSR app breaks on it.
 */
export default defineConfig({
    plugins: [angularJitSignals(__dirname)],
    test: {
        // Named apart from the package's main project, which the root workspace also lists.
        name: '@aparte/angular (server)',
        globals: true,
        environment: 'node',
        setupFiles: [resolve(__dirname, 'vitest.server.setup.ts')],
        include: ['src/**/*.server.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.node.ts'),
        },
    },
});
