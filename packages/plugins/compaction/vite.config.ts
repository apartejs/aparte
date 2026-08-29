import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// One entry: the package has no element, so the browser and Node entries are the same
// module — `setupCompaction` touches `window` only when called, never at import.
// Declarations come from `tsc -b` in the build script, not from a vite plugin: two
// declaration writers raced on `dist`.
export default defineConfig({
    plugins: [],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: { index: resolve(__dirname, 'src/index.ts') },
            name: 'ApartePluginCompaction',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: { external: ['@aparte/core'] },
    },
});
