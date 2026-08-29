import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// No `vite-plugin-dts`: the declarations come from `tsc -b` in the build script, one
// writer only — same as the sibling plugins, for the same reason (two declaration
// writers raced on `dist`).
export default defineConfig({
    plugins: [],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'index.node': resolve(__dirname, 'src/index.node.ts'),
            },
            name: 'ApartePluginApproval',
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
