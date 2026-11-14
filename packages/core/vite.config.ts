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
        // The stylesheet is the exception: `minify: false` also switched CSS minification
        // off, and dist/index.css shipped at 368 kB raw / 98 kB gzip — its comments are
        // most of it — where the minified sheet is 142 kB / 21 kB. A bundler minifies
        // either way; a page that links the file directly (a CDN, the vanilla-dist
        // example) paid five times the weight (Lighthouse on the chat site, 2026-09-05).
        cssMinify: true,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // The one dependency, first-party: the agent loop is engine's, and it must
            // ship once — as `@aparte/engine`, not inlined into core's bundle. Anything
            // else would be inlined, which is what `check:bundle-entries` reads the
            // built bytes for.
            external: ['@aparte/engine'],
            output: {
                // The kit's keyboard (`enhanceMenu`, `enhanceTabs`) and the three small
                // utilities it uses, in a file of their own. A consumer's bundler takes a
                // file as one module, so a page that imports only these from the headless
                // entry — a site header — would otherwise load the whole chunk both entries
                // share, the client and the config with it (76 kB gzip), to open a menu.
                manualChunks: (id) =>
                    /[\\/]src[\\/]utils[\\/](menu|tabs|place-floating|event-target|css-escape)\.ts$/.test(id) ? 'kit-keyboard' : undefined,
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'index.css';
                    return assetInfo.name || '[name][extname]';
                }
            }
        }
    }
});
