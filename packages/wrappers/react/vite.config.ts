import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
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
            external: ['react', 'react-dom', 'react/jsx-runtime', '@aparte/core'],
            // `'use client'` on the CHUNK. The directive at the top of AparteChat.tsx is
            // not what ships: Rollup drops module-level directives from non-entry
            // modules when it merges them into one file, so the published build had
            // none and the documented Next App Router path broke on import. Every
            // runtime export of the entry is a component or a hook, so the whole
            // chunk is a client boundary; a banner is the one place Rollup keeps it.
            output: { banner: "'use client';" },
        },
    },
});
