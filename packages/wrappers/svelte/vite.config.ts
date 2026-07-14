import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        svelte({
            compilerOptions: {
                // Keep component CSS external (emitted as dist/index.css), not inlined.
                css: 'external',
            },
        }),
    ],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            entry: resolve(__dirname, 'src/lib/index.ts'),
            formats: ['es'],
            fileName: 'index',
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // `/^svelte/` (not just 'svelte') so the compiler's `svelte/internal`
            // runtime helpers stay EXTERNAL — bundling them inlines a second Svelte
            // runtime and consumers hit "Cannot read '$$' of undefined" at mount.
            external: [/^svelte/, '@aparte/core'],
        },
    },
});
