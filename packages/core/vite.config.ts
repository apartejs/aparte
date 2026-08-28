// No `vite-plugin-dts` here.
//
// It rolled declarations up into `dist/index.d.ts`, and the `tsc -b
// --emitDeclarationOnly` in the build script then wrote per-file declarations into
// the SAME directory and overwrote it. Every package paid the rollup cost on every
// build for output that was thrown away, and two writers raced on one directory.
// `tsc` is the surviving producer — it is the one whose output actually ships.
import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
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
                // The icon set, on its own so a consumer who never imports it pays nothing.
                icons: resolve(__dirname, 'src/icons.ts'),
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
            // The one dependency, first-party: the agent loop is engine's, and it must
            // ship once — as `@aparte/engine`, not inlined into core's bundle. Anything
            // else would be inlined, which is what `check:bundle-entries` reads the
            // built bytes for.
            external: ['@aparte/engine'],
            output: {
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'index.css';
                    return assetInfo.name || '[name][extname]';
                }
            }
        }
    }
});
