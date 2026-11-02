import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        // Node, not jsdom: the adapter needs no DOM, and fake-indexeddb clones with Node's
        // `structuredClone`, which cannot clone jsdom's Blob.
        environment: 'node',
        include: ['src/**/*.test.ts'],
        // Core's Node entry: the conversation manager without the elements, which need a DOM.
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.node.ts'),
        },
    },
});
