import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        globals: true,
        // A DOM, because the provider imports core at runtime (`runSubAgent`), and in the
        // workspace that resolves to core's SOURCE browser entry, which defines elements. In
        // a consumer's Node the package resolves core's DOM-free entry instead, which
        // `check:node-import` proves on the built package. The sub-agent tests also drive
        // core's real client and viewport, with core's own test setup.
        environment: 'jsdom',
        setupFiles: [resolve(__dirname, '../../../core/vitest.setup.ts')],
    },
    resolve: {
        conditions: ['@aparte-workspace/source', 'module', 'development'],
    },
});
