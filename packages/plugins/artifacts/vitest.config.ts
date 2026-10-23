import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        // The card's sheet reaches the page through `getStyles()` as a `?raw` import.
        // Vitest skips CSS by default and that skip returned '' for the raw import too,
        // so the tests that read the sheet saw nothing. Only that sheet: `css: true`
        // also injected every stylesheet core's barrel imports, and jsdom's parser,
        // which predates container queries, printed "Could not parse CSS stylesheet"
        // for `responsive.css` once per test file.
        css: { include: [/artifact\.css/] },
        setupFiles: [resolve(__dirname, '../../core/vitest.setup.ts')],
        include: ['src/**/*.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
