import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    // A production build is compiled for production whatever NODE_ENV it inherits. On Windows nx
    // resolves every Vite config in development mode, in its own process, to build its graph —
    // Vite then sets NODE_ENV=development there, and every task nx starts inherits it. This
    // build then compiled jsxDEV calls and bundled react/jsx-dev-runtime, whose production
    // variant has no jsxDEV: a Next production build of a page with <AparteChat> failed on it.
    // Vite reads NODE_ENV after loading this file; nx's own resolution passes mode
    // 'development', so it is left alone.
    if (mode === 'production') process.env.NODE_ENV = 'production';
    return {
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
    };
});
