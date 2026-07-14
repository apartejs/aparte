import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `@huggingface/transformers` is heavy and bundles its own onnxruntime — keep it
// external in BOTH the main entry and the worker so the consumer resolves (and
// dedupes) it. The worker is emitted as a sibling ES module chunk and referenced
// from index.js via `new Worker(new URL('./worker.js', import.meta.url), …)`.
export default defineConfig({
    // Relative base so the emitted worker is referenced as `new URL('./assets/worker-*.js',
    // import.meta.url)` — resolves next to the published dist/index.js, not the consumer's
    // site root (the default `/` base would emit a broken absolute `/assets/…` path).
    base: './',
    plugins: [dts({ rollupTypes: true })],
    worker: {
        format: 'es',
        rollupOptions: {
            external: ['@huggingface/transformers'],
        },
    },
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
            },
            name: 'AparteProviderTransformers',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['@aparte/core', '@huggingface/transformers'],
        },
    },
});
