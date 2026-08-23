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
            // Two entries on purpose: `core` must be reachable WITHOUT pulling
            // `shiki`'s full bundle into the consumer's graph (302 chunks / 11 MB
            // measured). One shared chunk between them is fine — it carries no
            // shiki import.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                core: resolve(__dirname, 'src/core.ts'),
            },
            name: 'ApartePluginShiki',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['@aparte/core', 'shiki', 'shiki/core'],
        },
    },
});
