// No `vite-plugin-dts` here: `tsc -b --emitDeclarationOnly` in the build script writes
// the declarations that ship (see plugin-shiki's config for why the two raced).
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
            // Two entries on purpose (decision #9b): `core` takes the library you hand it and
            // imports none, so a bundle that controls what it ships pays for one copy.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                core: resolve(__dirname, 'src/core.ts'),
            },
            name: 'ApartePluginChartjs',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // `chart.js/auto` too: a bare name alone left the subpath to be bundled in.
            external: ['@aparte/core', /^chart\.js(\/.*)?$/],
        },
    },
});
