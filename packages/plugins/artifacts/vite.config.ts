// No `vite-plugin-dts` here — `tsc -b --emitDeclarationOnly` in the build script is the
// one producer of declarations (see the ask-user plugin's config for the history).
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
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                // The DOM-free entry the `node` export condition points at.
                'index.node': resolve(__dirname, 'src/index.node.ts'),
            },
            name: 'ApartePluginArtifacts',
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
