import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        // The plugin's sheet reaches the page as a `?raw` import, which Vitest's CSS skip
        // would return as ''. Only that sheet: `css: true` would also inject core's.
        css: { include: [/diff\.css/] },
        setupFiles: [resolve(__dirname, '../../core/vitest.setup.ts')],
        include: ['src/**/*.test.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
