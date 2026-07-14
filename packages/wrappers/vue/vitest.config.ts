import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        vue({
            template: {
                compilerOptions: {
                    isCustomElement: (tag) => tag.startsWith('aparte-'),
                },
            },
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
