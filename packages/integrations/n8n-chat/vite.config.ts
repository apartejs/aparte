// No `vite-plugin-dts`: `tsc -b --emitDeclarationOnly` in the build script writes the
// declarations, as in every package (see packages/providers/agent/n8n/vite.config.ts).
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
            },
            name: 'AparteN8nChat',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // Never bundled: the packages it puts together, so a page loads one copy of each
            // (a CDN resolves them as modules, a bundler dedupes them).
            external: [/^@aparte\//, 'marked', 'remend'],
        },
    },
});
