// No `vite-plugin-dts` here.
//
// It rolled declarations up into `dist/index.d.ts`, and the `tsc -b
// --emitDeclarationOnly` in the build script then wrote per-file declarations into
// the SAME directory and overwrote it. Every package paid the rollup cost on every
// build for output that was thrown away, and two writers raced on one directory.
// `tsc` is the surviving producer — it is the one whose output actually ships.
import { defineConfig, type Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Hands the worker's emit back to this package, by taking two of Vite's own build
 * plugins out of the chain.
 *
 * `_spawnWorker` in `src/index.ts` constructs the worker from the literal
 * `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`, and that
 * literal is the whole point: it is the shape Vite's and webpack's worker detection
 * match on, so a CONSUMER's bundler processes `dist/worker.js` as a module and
 * resolves `@huggingface/transformers` inside it. Both plugins below rewrite that
 * literal, and each one breaks it differently:
 *
 *   `vite:worker-import-meta-url`   emits its own hashed `assets/worker-<hash>.js` and
 *                                   replaces the call with a string concatenation
 *                                   behind a `@vite-ignore` — nothing static left to
 *                                   detect, so a bundled app copies the chunk without
 *                                   ever processing it and every model load fails.
 *   `vite:asset-import-meta-url`    treats the URL as an asset and, under the inline
 *                                   limit, inlines the worker's RAW TYPESCRIPT as a
 *                                   `data:` URL. Measured, not imagined: that is what
 *                                   came out the first time this build stopped using
 *                                   the worker plugin.
 *
 * Removed only for `build`. In dev and under vitest the same transforms are what make
 * `./worker.js` resolve to `src/worker.ts`, and there is no artifact to protect.
 *
 * There is no supported flag for this. Splicing the resolved plugin list is the
 * smallest lever that exists, and `src/__tests__/published-shape.test.ts` reads the
 * built bytes so a Vite upgrade that renames either plugin fails loudly.
 */
function shipTheWorkerOurselves(): Plugin {
    return {
        name: 'aparte:ship-the-worker-ourselves',
        configResolved(config) {
            if (config.command !== 'build') return;
            for (const name of ['vite:worker-import-meta-url', 'vite:asset-import-meta-url']) {
                const at = config.plugins.findIndex((p) => p.name === name);
                if (at !== -1) (config.plugins as Plugin[]).splice(at, 1);
            }
        },
    };
}

// `@huggingface/transformers` is heavy and bundles its own onnxruntime — keep it
// external so the consumer resolves (and dedupes) it. It stays external in the worker
// too, which is the point of `dist/worker.js` being a real entry: the bare specifier
// survives into a file the consumer's bundler processes.
export default defineConfig({
    // Relative base: every URL the output builds is resolved against the published
    // `dist/index.js`, not the consumer's site root (the default `/` base would emit a
    // broken absolute `/assets/…` path).
    base: './',
    plugins: [shipTheWorkerOurselves()],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            // TWO entries. The worker is not an asset this package hands to a
            // bundler, it is a module this package publishes — at a stable
            // `dist/worker.js`, because the literal that constructs it is written by
            // a human and cannot contain a content hash.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                worker: resolve(__dirname, 'src/worker.ts'),
            },
            name: 'AparteProviderTransformers',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['@aparte/core', '@huggingface/transformers'],
            output: {
                entryFileNames: '[name].js',
                // Deterministic, and beside their own declarations. Everything this
                // build splits out IS a runner (`runners/*.ts` behind the worker's
                // dynamic imports); hashed names under `assets/` would be three more
                // files a verbatim copy of `dist/` has to carry with no name anything
                // can refer to.
                chunkFileNames: 'runners/[name].js',
            },
        },
    },
});
