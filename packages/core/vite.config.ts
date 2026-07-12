import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        dts({ rollupTypes: true })
    ],

    build: {
        emptyOutDir: true, // Clean dist folder before building
        outDir: resolve(__dirname, 'dist'), // Output in project root
        lib: {
            // Two entries: the browser build (registers Web Components) and a
            // Node/SSR-safe build (no HTMLElement classes) resolved via the
            // `node` export condition. Shared DOM-free code is hoisted into a
            // common chunk both import.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'index.node': resolve(__dirname, 'src/index.node.ts'),
            },
            name: 'AparteCore',
            fileName: (_format, entryName) => `${entryName}.js`, // index.js / index.node.js
            formats: ['es']
        },
        target: 'es2022',
        // Ship readable ESM — consumers' bundlers tree-shake + minify.
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            output: {
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'index.css';
                    return assetInfo.name || '[name][extname]';
                }
            }
        }
    }
});
