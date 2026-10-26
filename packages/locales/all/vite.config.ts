// No `vite-plugin-dts`: `tsc -b --emitDeclarationOnly` in the build script writes the
// declarations, one per language beside its module. The plugin rolled them up into one file
// that tsc then overwrote: two writers on one directory, for output thrown away.
import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** One entry per language, so `@aparte/locales/es` loads Spanish and nothing else. */
const LOCALES = ['fr', 'es', 'pt-BR', 'de', 'it', 'ru', 'ja', 'ko', 'zh-CN'];

export default defineConfig({
    plugins: [],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                ...Object.fromEntries(LOCALES.map((l) => [l, resolve(__dirname, `src/${l}.ts`)])),
            },
            name: 'AparteLocales',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['@aparte/core'],
        },
    },
});
