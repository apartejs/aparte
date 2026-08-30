/**
 * The Transformers.js inference worker — the shell.
 *
 * Runs entirely off the main thread. What it decides lives in `worker-host.ts` (the
 * protocol, the one-runner-at-a-time rule, cancel, warnings); what a model IS lives in a
 * runner (`runners/`). This file binds the two to `self` and owns the two things only a
 * real worker can do: resolve Transformers.js, and import a runner module.
 */

import type { BuiltInRunner, RunnerModule, TransformersModule } from './runners/types.js';
import { createWorkerHost } from './worker-host.js';

/**
 * Where Transformers.js comes from, resolved once, from whichever path has it.
 *
 * A static `import … from '@huggingface/transformers'` is unresolvable in a worker
 * served without a bundler: an import map lives on the DOCUMENT and, by spec, does not
 * reach a worker — so the page can map the specifier for itself and the worker still
 * cannot. The two paths, in order:
 *
 *   1. `import('@huggingface/transformers')` — a bare specifier, statically visible, so a
 *      consumer's bundler resolves and bundles the peer exactly as it did before.
 *   2. the absolute URL the main thread read from the page's own import map and sent in
 *      the first message — the CDN path, where that map is the consumer's manifest.
 *
 * The order matters: a bundled app must never reach for the network copy. Whichever
 * path won is the module every runner receives as `ctx.transformers` — one copy per
 * worker, the version the CONSUMER installed or pinned.
 */
let _tf: Promise<TransformersModule> | null = null;

function loadTransformers(moduleUrl?: string): Promise<TransformersModule> {
    _tf ??= (async () => {
        let mod: TransformersModule;
        try {
            mod = await import('@huggingface/transformers');
        } catch (bundlerPathFailed) {
            if (!moduleUrl) throw bundlerPathFailed;
            mod = await import(/* @vite-ignore */ moduleUrl) as TransformersModule;
        }
        // Fetch weights from the Hugging Face hub (not local paths) and cache them in the
        // browser Cache API — this is what `listCachedModels()` scans on the main thread.
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        return mod;
    })();
    return _tf;
}

/**
 * The runners this package ships, each behind a dynamic import so the bundler splits
 * it into its own chunk and a page loads only the one its model asks for. The imports
 * are RELATIVE on purpose: a module script resolves them against its own URL, so they
 * follow the worker wherever it is served from — the same origin, a CDN, or through the
 * blob shim `_spawnWorker` builds for a cross-origin copy.
 */
const BUILT_IN: Partial<Record<BuiltInRunner, () => Promise<RunnerModule>>> = {
    'text-generation': () => import('./runners/text-generation.js'),
};

function importRunner({ task, runner }: { task: BuiltInRunner; runner?: string }): Promise<RunnerModule> {
    // A custom runner is an absolute URL by the time it gets here (the main thread
    // resolved it against the page), and it wins over `task`.
    if (runner) return import(/* @vite-ignore */ runner) as Promise<RunnerModule>;
    const load = BUILT_IN[task];
    if (!load) throw new Error(`@aparte/provider-transformers ships no "${task}" runner`);
    return load();
}

// DOM's `Worker` interface types `postMessage` + typed `addEventListener('message')`,
// which is enough for the worker scope — avoids pulling the WebWorker lib (it clashes
// with DOM's global `postMessage`).
const ctx = self as unknown as Worker;

const host = createWorkerHost({
    post: (message) => { ctx.postMessage(message); },
    loadTransformers,
    importRunner,
});

ctx.addEventListener('message', (event: MessageEvent) => { host.onMessage(event.data); });
