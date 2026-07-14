import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        vue({
            // `aparte-*` are custom elements, not Vue components — don't warn/resolve them.
            template: {
                compilerOptions: {
                    isCustomElement: (tag) => tag.startsWith('aparte-'),
                },
            },
        }),
    ],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // Peers — never bundle.
            external: ['vue', '@aparte/core'],
        },
    },
});
