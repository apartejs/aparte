import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        // The wrapper renders REAL core web components, so resolve `@aparte/core`
        // from source (its custom elements register on import) and reuse core's
        // jsdom polyfills (ResizeObserver, …).
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: [resolve(__dirname, '../../core/vitest.setup.ts')],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
