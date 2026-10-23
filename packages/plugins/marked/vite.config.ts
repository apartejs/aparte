// No `vite-plugin-dts` here.
//
// It rolled declarations up into `dist/index.d.ts`, and the `tsc -b
// --emitDeclarationOnly` in the build script then wrote per-file declarations into
// the SAME directory and overwrote it. Every package paid the rollup cost on every
// build for output that was thrown away, and two writers raced on one directory.
// `tsc` is the surviving producer — it is the one whose output actually ships.
import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            // Two entries on purpose: `streaming` brings remend, and a consumer who
            // imports only the one-shot provider must not have it in their graph.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                streaming: resolve(__dirname, 'src/streaming.ts'),
            },
            name: 'ApartePluginMarked',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // Never bundled: the peers (@aparte/core, the marked the consumer brings) and
            // remend, a dependency npm installs beside the plugin.
            external: ['@aparte/core', 'marked', 'remend'],
        },
    },
});
