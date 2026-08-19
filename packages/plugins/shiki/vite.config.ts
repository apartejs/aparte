import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [dts({ rollupTypes: true })],
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
