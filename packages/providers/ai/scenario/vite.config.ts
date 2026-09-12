// `tsc -b --emitDeclarationOnly` in the build script is the one producer of
// declarations (see packages/plugins/marked/vite.config.ts for why no dts plugin).
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
            // Two entries: the ready-made `showcase` set is a demo corpus, so a
            // consumer who writes their own scenarios must not pay for it.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                showcase: resolve(__dirname, 'src/showcase.ts'),
            },
            name: 'AparteProviderScenario',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // The one peer — never bundled. This package has no dependency of its own.
            external: ['@aparte/core'],
        },
    },
});
