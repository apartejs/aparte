/**
 * @aparte/provider-transformers — run LLMs 100% in the browser via Transformers.js.
 *
 * A local, keyless `AparteAIProvider`: it owns its I/O (inference runs off the main
 * thread in a Web Worker) so `AparteDirectTransport` delegates to its `chat()`. Model
 * weights download once and persist in the Cache API.
 *
 * Scope: the worker runs a **runner** — the built-in `text-generation` (any chat model
 * behind Transformers.js' `pipeline()`), or a module of the app's own named by
 * `TransformersModelConfig.runner` (see `runners/types.ts` for the contract). Tool-calling
 * for local models is model-specific (every family has its own wire format), so the
 * built-in drops tool turns and says so; a custom runner may render them.
 *
 * ## This provider's state is TAB-scoped, on purpose
 *
 * Everything below the "Worker bridge" heading — the worker, the loaded model, the
 * generate chain — plus `setComputeDevice`, `setMaxCachedModels` and
 * `setHardwareTierModels`, is module-level and therefore shared by every chat on the
 * page. That is deliberate, and it is the opposite of what the rest of the suite does:
 * a plugin's providers scope to one chat, this one cannot.
 *
 * The reason is the resource, not the design. A local model is 1–2 GB of weights and one
 * WebGPU pipeline. Handing each chat its own worker would mean N copies resident in one
 * tab — which is the failure this package exists to avoid, not a capability. The
 * settings above describe the *machine* (which backend, how many models to keep
 * cached), so per-chat values would not mean anything either.
 *
 * What the constraint costs: two chats on the page driving DIFFERENT local models take
 * turns on one pipeline, so each turn may evict and reload gigabytes. That used to
 * happen silently — a multi-second stall with nothing to read. It now warns once, from
 * `chat()`, when a generate is queued for a model other than the one already in flight.
 * Same model in both chats is free and correct: they share the load.
 */

import type {
    AparteAIProvider,
    AparteAIModel,
    AparteChatRequest,
    AparteChatResponse,
    ModelStatus,
    ModelLoadProgress,
} from '@aparte/core';
import { uuid } from '@aparte/core';
import type { BuiltInRunner, Device, Dtype } from './runners/types.js';

// The worker's URL, not the worker itself: this package constructs it by hand because a
// cross-origin copy has to go through a blob (see `_spawnWorker`). `?worker&url` is what
// keeps Vite emitting the worker as its own chunk — the `new Worker(new URL(...))` form
// it detects by pattern was the only other way, and moving the URL out of that call made
// the build inline the worker's raw TypeScript as a data: URL instead. Caught by a
// two-origin browser probe, not by any test.
import workerUrl from './worker.ts?worker&url';

// ─────────────────────────────────────────────────────────────────────────────
// Hardware detection
// ─────────────────────────────────────────────────────────────────────────────

export interface HardwareProfile {
    hasGpu: boolean;
    ramGb: number;
    tier: 'low' | 'mid' | 'high';
    recommendedModelId: string;
}

/** Hardware-tier model overrides — set by the app via setHardwareTierModels(). */
let _hardwareTiers: { low: string; mid?: string; high: string } | null = null;

/**
 * Set the model IDs to use per hardware tier. Call before detectHardware() is used
 * to pick a default model — the provider ships no model knowledge of its own.
 */
export function setHardwareTierModels(tiers: { low: string; mid?: string; high: string }): void {
    _hardwareTiers = tiers;
}

export async function detectHardware(): Promise<HardwareProfile> {
    // navigator.deviceMemory: W3C API, Chromium only, capped at 8 GB for privacy
    // (1 | 2 | 4 | 8). Falls back to 4 on Firefox/Safari.
    const ramGb: number = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;

    // Real WebGPU check: requestAdapter() returns null if no capable GPU is present.
    let hasGpu = false;
    if ('gpu' in navigator) {
        try {
            const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
            hasGpu = adapter !== null;
        } catch {
            hasGpu = false;
        }
    }

    let tier: 'low' | 'mid' | 'high';
    if (!hasGpu || ramGb < 4) {
        tier = 'low';
    } else if (ramGb < 8) {
        tier = 'mid';
    } else {
        tier = 'high';
    }

    const recommendedModelId = _hardwareTiers
        ? (_hardwareTiers[tier] ?? _hardwareTiers.high ?? '')
        : '';

    return { hasGpu, ramGb, tier, recommendedModelId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Model catalog — all model knowledge lives in the app, not the provider.
// ─────────────────────────────────────────────────────────────────────────────

/** Configuration for a model registered with the provider. */
export interface TransformersModelConfig {
    id: string;
    name: string;
    description?: string;
    capabilities: AparteAIModel['capabilities'];
    /**
     * Which built-in runner loads and drives the model. `'text-generation'` (the default)
     * is any chat model behind Transformers.js' `pipeline()`. Ignored when `runner` is set.
     */
    task?: BuiltInRunner;
    /**
     * A runner of your own: the URL of an ES module exporting `createRunner` (see
     * `TransformersRunner`). Resolved against the page, imported by the worker, and handed
     * the same Transformers.js instance the built-ins use. Wins over `task`.
     */
    runner?: string;
    /** ONNX dtype or per-part dtype map (e.g. `'q4'` or `{ decoder_model_merged: 'q4' }`). */
    dtype?: Dtype;
    /** Preferred device. Defaults to WebGPU when available, else WASM. */
    device?: Device;
    metadata?: Record<string, unknown>;
}

/** Models registered by the app via registerModel(). */
const _registeredModels = new Map<string, TransformersModelConfig>();

/** Mutable model list — populated by registerModel() and cache discovery. */
let _knownModels: AparteAIModel[] = [];

/**
 * Register a model with the provider. Call before the model is used for inference.
 */
export function registerModel(config: TransformersModelConfig): void {
    _registeredModels.set(config.id, config);
    if (!_knownModels.find(m => m.id === config.id)) {
        _knownModels = [..._knownModels, {
            id: config.id,
            name: config.name,
            description: config.description,
            capabilities: config.capabilities,
        }];
    }
}

/** Build an AparteAIModel entry from a cache-discovered modelId not in the registry. */
function _modelFromCacheEntry(modelId: string): AparteAIModel {
    const config = _registeredModels.get(modelId);
    if (config) return { id: config.id, name: config.name, description: config.description, capabilities: config.capabilities };
    const name = (modelId.split('/').pop() ?? modelId).replace(/-/g, ' ');
    return { id: modelId, name, capabilities: ['streaming'] };
}

/** Max number of models to keep in cache. 0 = unlimited. Default: 1. */
let _maxCachedModels = 1;

/**
 * Set the maximum number of models to keep in cache. When exceeded after a new
 * model is ready, the oldest models are evicted. 0 = unlimited.
 */
export function setMaxCachedModels(max: number): void {
    _maxCachedModels = max;
}

/** Returns the current max-cached-models setting. */
export function getMaxCachedModels(): number {
    return _maxCachedModels;
}

/**
 * User's preferred compute backend for local inference.
 *   'auto'   → WebGPU when available, else WASM (default)
 *   'webgpu' → force WebGPU
 *   'wasm'   → force WASM CPU
 */
export type ComputeDevice = 'auto' | 'webgpu' | 'wasm';
let _computeDevice: ComputeDevice = 'auto';

export function setComputeDevice(d: ComputeDevice): void {
    _computeDevice = d;
}

export function getComputeDevice(): ComputeDevice {
    return _computeDevice;
}

/** Evict models from cache until count <= _maxCachedModels; `keepModelId` is never evicted. */
async function _enforceMaxCachedModels(keepModelId: string): Promise<void> {
    if (_maxCachedModels === 0) return; // unlimited
    try {
        const cached = await listCachedModels();
        const others = cached.filter(e => e.modelId !== keepModelId);
        const excess = cached.length - _maxCachedModels;
        if (excess <= 0) return;
        // Delete the excess models (oldest first — they appear first in cache scan order).
        for (let i = 0; i < excess && i < others.length; i++) {
            await deleteCachedModel(others[i]!.modelId);
        }
    } catch { /* cache unavailable */ }
}

/** Merge cached models into _knownModels (idempotent). Called by fetchModels(). */
async function _refreshKnownModels(): Promise<void> {
    try {
        const cached = await listCachedModels();
        for (const entry of cached) {
            if (!_knownModels.find(m => m.id === entry.modelId)) {
                _knownModels = [..._knownModels, _modelFromCacheEntry(entry.modelId)];
            }
        }
    } catch { /* cache unavailable */ }
}

/**
 * How the worker should load `modelId`: which runner, which weights, which device.
 *
 * A custom `runner` is made absolute HERE, not in the worker: a worker's base URL is its
 * own script's, not the page's, and the blob shim `_spawnWorker` may build has no
 * meaningful base at all — so a relative path would resolve against the wrong place or
 * fail outright. The page is the one place that knows what the app meant.
 */
function _selection(modelId: string): { task: BuiltInRunner; runner?: string; dtype?: Dtype; device: ComputeDevice } {
    const config = _registeredModels.get(modelId);
    const runner = config?.runner;
    return {
        task: config?.task ?? 'text-generation',
        ...(runner ? { runner: typeof location === 'undefined' ? runner : new URL(runner, location.href).href } : {}),
        dtype: config?.dtype,
        device: _computeDevice,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker bridge
// ─────────────────────────────────────────────────────────────────────────────

let _worker: Worker | null = null;

interface PendingPrepare {
    modelId: string;
    onProgress: (p: ModelLoadProgress) => void;
    resolve: () => void;
    reject: (err: Error) => void;
}
const _pendingPrepares = new Map<string, PendingPrepare>();
const _pendingGenerates = new Map<string, ReadableStreamDefaultController>();
const _pendingCommands = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

// ── Generate serialization ──────────────────────────────────────────────────
// The worker holds ONE pipeline: two concurrent generates would corrupt each
// other. Each chat() chains its `generate` behind the previous generate's
// completion (gen-done / gen-error).
let _generateChain: Promise<void> = Promise.resolve();
const _generateDoneResolvers = new Map<string, () => void>();

// ── Contention on the one pipeline ──────────────────────────────────────────
// Serialization is correct but invisible: two chats driving DIFFERENT local
// models take turns, and with `maxCachedModels` at its default of 1 each turn
// can evict and reload gigabytes. The user sees a stall; the developer sees
// nothing. These two track just enough to say so, once.
const _queuedModelIds = new Map<string, string>();
let _warnedModelContention = false;

/** Model ids of generates currently queued or running on the single pipeline. */
function _contendingModelId(requested: string): string | undefined {
    for (const id of _queuedModelIds.values()) if (id !== requested) return id;
    return undefined;
}

/**
 * Warn once when a generate has to queue behind another chat's DIFFERENT model.
 * Not a warning about switching models in one chat — that is a deliberate act
 * with visible feedback. This fires only when two are in flight at once.
 */
function _warnIfContended(requested: string): void {
    if (_warnedModelContention) return;
    const other = _contendingModelId(requested);
    if (!other) return;
    _warnedModelContention = true;
    console.warn(
        `[Aparte] Two chats are driving different local models at once ("${requested}" behind `
        + `"${other}"). Transformers.js runs one pipeline per tab, so these generates are `
        + `serialized, and with a cache budget of ${_maxCachedModels} each switch can evict and `
        + `reload gigabytes of weights. Point both chats at one model, or raise the budget with `
        + `setMaxCachedModels(2) if the machine has the memory. This warns once.`,
    );
}

/** Settle the serialization slot for a finished generate. */
function _releaseGenerateSlot(id: string): void {
    _queuedModelIds.delete(id);
    const resolve = _generateDoneResolvers.get(id);
    if (resolve) {
        _generateDoneResolvers.delete(id);
        resolve();
    }
}

/** Model known to be loaded (main-thread view). */
let _loadedModelId: string | null = null;
/** Model currently being prepared (for the getModelStatus 'cached' path). */
let _preparingModelId: string | null = null;

/** The blob URL the worker was built from, if it needed one. Revoked with the worker. */
let _workerBlobUrl: string | null = null;

/**
 * Build the worker — including when this package is served from another origin.
 *
 * `new Worker()` refuses a cross-origin script outright, and that is not an exotic
 * case: it is every deploy whose JavaScript lives on a CDN or an asset host while the
 * page lives somewhere else, with or without a bundler. Reproduced with the package on
 * one port and the page on another: `SecurityError: Script at '…/assets/worker-*.js'
 * cannot be accessed from origin '…'`.
 *
 * A blob inherits the ORIGIN OF THE DOCUMENT THAT CREATES IT, so a one-line blob whose
 * body imports the real worker by absolute URL is same-origin by construction, and the
 * import inside it is a normal cross-origin module fetch, which is allowed. It is the
 * shim ffmpeg.wasm and tesseract.js use for the same reason.
 *
 * Same-origin keeps the direct path: no blob, nothing to revoke, and a stack trace that
 * names the real file.
 */
function _spawnWorker(): Worker {
    const url = new URL(workerUrl, import.meta.url);
    const sameOrigin = typeof location === 'undefined' || url.origin === location.origin;
    // A blob is the only way across an origin, so an environment that cannot mint one has
    // nothing to gain from trying: construct directly and let the platform say what it
    // thinks. jsdom is that environment — it has `Blob` and no `URL.createObjectURL` — and
    // every test in this package went through the blob path and threw before this line
    // existed.
    const canMintBlob = typeof Blob === 'function' && typeof URL.createObjectURL === 'function';
    // The literal below is not style. `new Worker(new URL('./worker.ts', import.meta.url))`
    // is the exact shape Vite's worker detection and webpack's WorkerPlugin match on, and
    // matching it is what makes a CONSUMER's bundler process the worker as a module — which
    // is how `@huggingface/transformers` gets resolved inside it today. Behind a variable
    // the chunk is copied as an opaque asset and its imports are never touched, so hoisting
    // this line to reuse it for the blob would fix a CDN page by breaking every bundled app.
    if (sameOrigin || !canMintBlob) return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    _workerBlobUrl = URL.createObjectURL(
        new Blob([`import ${JSON.stringify(url.href)};`], { type: 'text/javascript' }),
    );
    try {
        return new Worker(_workerBlobUrl, { type: 'module' });
    } catch (error) {
        // A page with `worker-src 'self'` (or `script-src` without `blob:`) blocks the
        // shim, and the direct URL was already refused for its origin — so there is
        // nothing left to try. Say which of the two walls was hit, because the browser's
        // own message does not distinguish them.
        URL.revokeObjectURL(_workerBlobUrl);
        _workerBlobUrl = null;
        throw new Error(
            `@aparte/provider-transformers is served from ${url.origin}, which is not this page's origin, `
            + 'so its worker has to be started through a blob: URL — and this page\'s Content-Security-Policy '
            + 'refuses that. Allow `blob:` in `worker-src` (or `script-src`), or serve the package from your '
            + `own origin. Original error: ${String(error)}`,
        );
    }
}

function _releaseWorkerBlob(): void {
    if (_workerBlobUrl) {
        URL.revokeObjectURL(_workerBlobUrl);
        _workerBlobUrl = null;
    }
}

/**
 * Where the page says Transformers.js lives, if it says so at all.
 *
 * The worker cannot ask: an import map is the DOCUMENT's, and by spec it does not reach
 * a worker. The main thread can, and does it the platform's way — `import.meta.resolve`
 * consults that same map — so a page that already maps `@huggingface/transformers` (it
 * has to, to import this package by name at all) is telling us where its copy is. That
 * map is the CDN consumer's manifest: the version pin stays with the consumer, which is
 * the whole point of a peer dependency, and this package invents no second place to say
 * it.
 *
 * `undefined` under a bundler, where the specifier is resolved at build time and the
 * worker's own `import('@huggingface/transformers')` is the path that runs.
 */
function _peerModuleUrl(): string | undefined {
    const resolve = (import.meta as unknown as { resolve?: (specifier: string) => string }).resolve;
    if (typeof resolve === 'function') {
        try {
            const href = resolve('@huggingface/transformers');
            if (href && /^https?:/i.test(href)) return href;
        } catch { /* not in the map — fall through */ }
    }
    // Older engines have no `import.meta.resolve`; read the map they do have.
    try {
        const el = document.querySelector('script[type="importmap"]');
        const map = el?.textContent ? JSON.parse(el.textContent) as { imports?: Record<string, string> } : null;
        const href = map?.imports?.['@huggingface/transformers'];
        if (href) return new URL(href, location.href).href;
    } catch { /* no document, or a map that is not JSON */ }
    return undefined;
}

function _getWorker(): Worker {
    if (!_worker) {
        _worker = _spawnWorker();
        _worker.addEventListener('message', _handleWorkerMessage);
        _worker.addEventListener('error', _handleWorkerError);
        _worker.addEventListener('messageerror', _handleWorkerError);
        // First message, before any work: postMessage keeps order, so the worker has it
        // by the time a prepare or a generate needs the module.
        _worker.postMessage({ type: 'init', transformersUrl: _peerModuleUrl() });
    }
    return _worker;
}

/**
 * Worker crashed (uncaught error / WASM init failure / OOM). Reject every in-flight
 * prepare and close every open generate stream so the UI doesn't hang. Subsequent
 * calls rebuild the worker.
 */
function _handleWorkerError(e: Event): void {
    const message = (e as ErrorEvent)?.message || 'Worker crashed unexpectedly';

    for (const p of _pendingPrepares.values()) {
        try { p.reject(new Error(message)); } catch { /* ignore */ }
    }
    _pendingPrepares.clear();

    for (const ctrl of _pendingGenerates.values()) {
        try { ctrl.enqueue({ type: 'error' as const, message }); ctrl.close(); }
        catch { /* ignore */ }
    }
    _pendingGenerates.clear();
    for (const c of _pendingCommands.values()) c.reject(new Error(message));
    _pendingCommands.clear();

    // Release every serialization slot so the generate chain doesn't deadlock.
    for (const resolve of _generateDoneResolvers.values()) {
        try { resolve(); } catch { /* ignore */ }
    }
    _generateDoneResolvers.clear();
    _generateChain = Promise.resolve();
    _queuedModelIds.clear();

    _loadedModelId = null;
    _preparingModelId = null;
    try { _worker?.terminate(); } catch { /* ignore */ }
    _worker = null;
    _releaseWorkerBlob();
}

function _handleWorkerMessage(event: MessageEvent): void {
    const msg = event.data;

    switch (msg.type) {
        case 'progress': {
            const pending = _pendingPrepares.get(msg.id);
            if (!pending) break;
            if (msg.status === 'ready') {
                pending.onProgress({ status: 'ready' });
                pending.resolve();
                _pendingPrepares.delete(msg.id);
            } else if (msg.status === 'loading') {
                pending.onProgress({ status: 'loading' });
            } else if (msg.status === 'cached') {
                pending.onProgress({ status: 'cached', file: msg.file, progress: msg.progress });
            } else {
                pending.onProgress({ status: 'downloading', file: msg.file, progress: msg.progress });
            }
            break;
        }
        case 'prepare-error': {
            const pending = _pendingPrepares.get(msg.id);
            if (!pending) break;
            pending.reject(new Error(msg.message));
            _pendingPrepares.delete(msg.id);
            if (_preparingModelId === pending.modelId) _preparingModelId = null;
            break;
        }
        case 'pipeline-ready': {
            _loadedModelId = msg.modelId;
            _preparingModelId = null;
            // Evict models over the cache limit, then refresh the known list.
            void _enforceMaxCachedModels(msg.modelId).then(() => _refreshKnownModels());
            break;
        }
        case 'gen-event': {
            // The runner speaks the stream vocabulary itself; nothing to translate.
            const ctrl = _pendingGenerates.get(msg.id);
            if (!ctrl) break;
            ctrl.enqueue(msg.event);
            break;
        }
        case 'warning': {
            // Already said once per text by the worker; the page just carries the voice.
            console.warn(`[transformers] ${msg.message}`);
            break;
        }
        case 'command-result': {
            _releaseGenerateSlot(msg.id);
            const pending = _pendingCommands.get(msg.id);
            if (!pending) break;
            _pendingCommands.delete(msg.id);
            if (msg.error !== undefined) pending.reject(new Error(msg.error));
            else pending.resolve(msg.result);
            break;
        }
        case 'gen-done': {
            _releaseGenerateSlot(msg.id);
            const ctrl = _pendingGenerates.get(msg.id);
            if (!ctrl) break;
            ctrl.enqueue({ type: 'done' as const, ...(msg.usage ? { usage: msg.usage } : {}) });
            ctrl.close();
            _pendingGenerates.delete(msg.id);
            break;
        }
        case 'gen-error': {
            _releaseGenerateSlot(msg.id);
            const ctrl = _pendingGenerates.get(msg.id);
            if (!ctrl) break;
            ctrl.enqueue({ type: 'error' as const, message: msg.message });
            ctrl.close();
            _pendingGenerates.delete(msg.id);
            break;
        }
    }
}

/**
 * Narrowed so the two members the docs tell you to CALL are not optional.
 *
 * `AparteAIProvider` declares `prepareModel` and `getModelStatus` optional (most
 * providers have nothing to download), and widening to it made both
 * possibly-undefined — so the documented `TransformersProvider.prepareModel(...)`
 * needed a `!` or a guard in every strict consumer. Same technique openai-compat
 * already used for its own always-present members.
 *
 * `chat` joined the list once `AparteAIProvider` became a union: it is optional on
 * the format-adapter arm, and this provider IS its `chat()` — running inference
 * locally is the whole package. Narrowing it here says so once, instead of every
 * caller writing `provider.chat!(...)`.
 */
export const TransformersProvider: AparteAIProvider
    & Required<Pick<AparteAIProvider, 'prepareModel' | 'getModelStatus' | 'chat'>> = {
    id: 'transformers',

    getMetadata() {
        return {
            id: 'transformers',
            name: 'Transformers.js',
            icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            color: '#f59e0b',
            description: 'Run LLMs directly in your browser via WebGPU or WASM — no API, no key',
            hasFreeModels: true,
            isLocal: true,
            helpUrl: 'https://huggingface.co/docs/transformers.js',
        };
    },

    getModels(): AparteAIModel[] {
        return _knownModels;
    },

    async fetchModels(): Promise<AparteAIModel[]> {
        await _refreshKnownModels();
        return _knownModels;
    },

    async chat(
        request: AparteChatRequest,
        _config?: string | Record<string, string>,
        ctx?: { providerId: string; signal?: AbortSignal },
    ): Promise<AparteChatResponse> {
        const requestId = uuid();
        const options = {
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            seed: request.seed,
        };
        const signal = ctx?.signal;

        // ── Reserve a serialization slot ─────────────────────────────────────
        // Chain this generate behind the previous one; the worker has a single
        // pipeline, so generates MUST NOT overlap.
        _warnIfContended(request.modelId);
        _queuedModelIds.set(requestId, request.modelId);
        const prevGenerate = _generateChain;
        _generateChain = new Promise<void>((resolveSlot) => {
            _generateDoneResolvers.set(requestId, resolveSlot);
        });
        // ── Stop, from either side ───────────────────────────────────────────
        // The transport's `ctx.signal` (the user's Stop, which the provider contract
        // says a bridge MUST honour — this one read it nowhere) and the stream's own
        // `cancel()` say the same thing, and the worker hears it once. Before the
        // generate has been posted there is nothing to interrupt: the stream is
        // settled here, and the slot is released when its turn in the chain comes —
        // not earlier, or the next generate would start over the one still running.
        let posted = false;
        let stopped = false;
        const stop = (): void => {
            if (stopped) return;
            stopped = true;
            signal?.removeEventListener('abort', stop);
            if (posted) {
                _getWorker().postMessage({ type: 'cancel', id: requestId });
                return;
            }
            const ctrl = _pendingGenerates.get(requestId);
            _pendingGenerates.delete(requestId);
            if (!ctrl) return;
            try { ctrl.enqueue({ type: 'error' as const, message: 'Generation cancelled before it started' }); ctrl.close(); }
            catch { /* already closed */ }
        };
        const postGenerate = (): void => {
            if (stopped) { _releaseGenerateSlot(requestId); return; }
            posted = true;
            _getWorker().postMessage({
                type: 'generate',
                id: requestId,
                modelId: request.modelId,
                // The conversation as it is, parts included: which parts a model can take
                // is the runner's knowledge, not this thread's.
                messages: request.messages,
                options,
                ..._selection(request.modelId),
            });
        };

        let response: AparteChatResponse | Promise<string>;
        if (request.stream === false) {
            response = new Promise<string>((resolve, reject) => {
                let result = '';
                const fakeCtrl = {
                    enqueue: (chunk: { type: string; delta?: string; message?: string }) => {
                        if (chunk.type === 'text') result += chunk.delta ?? '';
                        else if (chunk.type === 'done') resolve(result);
                        else if (chunk.type === 'error') reject(new Error(chunk.message));
                    },
                    close: () => { /* no-op */ },
                } as unknown as ReadableStreamDefaultController;
                _pendingGenerates.set(requestId, fakeCtrl);
                void prevGenerate.then(postGenerate);
            });
        } else {
            response = new ReadableStream({
                async start(controller) {
                    _pendingGenerates.set(requestId, controller);
                    await prevGenerate;
                    postGenerate();
                },
                cancel() {
                    // The reader is gone, so nothing may be enqueued for it again — and the
                    // model actually STOPS (not just the read): the worker interrupts this
                    // generate, and the slot is still released by the resulting
                    // gen-done/gen-error, so a queued generate cannot start before that.
                    _pendingGenerates.delete(requestId);
                    stop();
                },
            });
        }

        // `start` has run by now, so the controller is registered and a stop settles it.
        if (signal?.aborted) stop();
        else signal?.addEventListener('abort', stop, { once: true });
        return response;
    },

    async getModelStatus(modelId: string): Promise<ModelStatus> {
        if (_loadedModelId === modelId) return 'ready';
        if (_preparingModelId === modelId) return 'cached';
        if ('caches' in globalThis) {
            try {
                const encodedId = encodeURIComponent(modelId);
                const names = await caches.keys();
                for (const name of names) {
                    const cache = await caches.open(name);
                    const keys = await cache.keys();
                    if (keys.some(r => r.url.includes(encodedId) || r.url.includes(modelId + '/'))) {
                        return 'cached';
                    }
                }
            } catch {
                // Cache API unavailable
            }
        }
        return 'not-downloaded';
    },

    async prepareModel(modelId: string, onProgress: (p: ModelLoadProgress) => void): Promise<void> {
        if (_loadedModelId === modelId) {
            onProgress({ status: 'ready' });
            return;
        }

        const requestId = uuid();
        _preparingModelId = modelId;

        return new Promise<void>((resolve, reject) => {
            _pendingPrepares.set(requestId, { modelId, onProgress, resolve, reject });
            _getWorker().postMessage({ type: 'prepare', id: requestId, modelId, ..._selection(modelId) });
        });
    },

    async deleteModel(modelId: string): Promise<void> {
        await deleteCachedModel(modelId);
    },
};

export default TransformersProvider;
export type { AparteAIProvider, AparteAIModel, ModelStatus, ModelLoadProgress } from '@aparte/core';
export type {
    TransformersRunner,
    RunnerContext,
    RunnerGenerateInput,
    RunnerProgress,
    RunnerModule,
    CreateRunner,
    BuiltInRunner,
    TransformersModule,
} from './runners/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Cache utilities (settings panels, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the modelId currently loaded in the worker's pipeline, or null. */
export function getLoadedModelId(): string | null {
    return _loadedModelId;
}

/**
 * Send a runner something that is not a generation — swap an adapter, warm a cache, ask
 * a capability — and get its answer. The name and payload are the runner's vocabulary
 * (the built-in runners answer none). Queued behind the generates in flight: the worker
 * holds one runner, and a command on it mid-stream would race the stream.
 */
export function runnerCommand(modelId: string, name: string, payload: unknown): Promise<unknown> {
    const requestId = uuid();
    _queuedModelIds.set(requestId, modelId);
    const previous = _generateChain;
    _generateChain = new Promise<void>((resolveSlot) => {
        _generateDoneResolvers.set(requestId, resolveSlot);
    });
    return new Promise<unknown>((resolve, reject) => {
        _pendingCommands.set(requestId, { resolve, reject });
        void previous.then(() => {
            _getWorker().postMessage({ type: 'command', id: requestId, modelId, name, payload, ..._selection(modelId) });
        });
    });
}

/** Terminate the shared worker and reset in-memory state. Safe to call any time. */
export function terminateWorker(): void {
    _worker?.terminate();
    _worker = null;
    _releaseWorkerBlob();
    _loadedModelId = null;
    _preparingModelId = null;
    for (const [, p] of _pendingPrepares) {
        p.reject(new Error('Worker terminated'));
    }
    _pendingPrepares.clear();
    for (const [, ctrl] of _pendingGenerates) {
        try { ctrl.enqueue({ type: 'error' as const, message: 'Worker terminated' }); ctrl.close(); } catch { /* already closed */ }
    }
    _pendingGenerates.clear();
    for (const c of _pendingCommands.values()) c.reject(new Error('Worker terminated'));
    _pendingCommands.clear();

    // Release every serialization slot and reset the chain — the same three lines
    // the worker-error handler above already carried, with the same reason. Without
    // them, terminating mid-generate left `_generateChain` pending on a resolver
    // that had just been dropped, so the NEXT chat() awaited a promise that could
    // never settle: no error, no rejection, the stream simply never started again
    // for the life of the page.
    for (const resolve of _generateDoneResolvers.values()) {
        try { resolve(); } catch { /* ignore */ }
    }
    _generateDoneResolvers.clear();
    _generateChain = Promise.resolve();
    _queuedModelIds.clear();
    // A terminated worker is a fresh situation; let the contention warning speak again.
    _warnedModelContention = false;
}

export interface CachedModelEntry {
    modelId: string;
    name: string;
    /** Total size in bytes of all cached files for this model. -1 if unknown. */
    sizeBytes: number;
    /** True if the model is currently loaded in the worker. */
    loaded: boolean;
}

/**
 * Scan the Cache API to find which Transformers.js models have been downloaded,
 * by matching cache entry URLs against the Hugging Face resolve path.
 */
export async function listCachedModels(): Promise<CachedModelEntry[]> {
    if (!('caches' in globalThis)) return [];

    const found = new Map<string, { name: string; sizeBytes: number }>();

    // e.g. https://huggingface.co/onnx-community/Qwen2.5-0.5B/resolve/main/config.json
    //   → onnx-community/Qwen2.5-0.5B
    function extractModelId(url: string): string | null {
        const m = url.match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//);
        return m ? decodeURIComponent(m[1]!) : null;
    }

    function modelName(modelId: string): string {
        const config = _registeredModels.get(modelId);
        if (config) return config.name;
        return (modelId.split('/').pop() ?? modelId).replace(/-/g, ' ');
    }

    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(async (cacheName) => {
            try {
                const cache = await caches.open(cacheName);
                const requests = await cache.keys();
                for (const req of requests) {
                    const modelId = extractModelId(req.url);
                    if (!modelId) continue;
                    if (!found.has(modelId)) {
                        found.set(modelId, { name: modelName(modelId), sizeBytes: 0 });
                    }
                    const response = await cache.match(req);
                    if (!response) continue;
                    const contentLength = response.headers.get('content-length');
                    if (contentLength) {
                        found.get(modelId)!.sizeBytes += parseInt(contentLength, 10);
                    } else {
                        try {
                            const blob = await response.clone().blob();
                            found.get(modelId)!.sizeBytes += blob.size;
                        } catch { /* skip */ }
                    }
                }
            } catch { /* skip inaccessible cache */ }
        }));
    } catch {
        return [];
    }

    return Array.from(found.entries()).map(([modelId, { name, sizeBytes }]) => ({
        modelId,
        name,
        sizeBytes,
        loaded: _loadedModelId === modelId,
    }));
}

/**
 * Delete all cached files for a modelId from the Cache API, terminating the worker
 * first if that model is currently loaded.
 */
export async function deleteCachedModel(modelId: string): Promise<void> {
    if (_loadedModelId === modelId || _preparingModelId === modelId) {
        terminateWorker();
    }
    if (!('caches' in globalThis)) return;
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(async (cacheName) => {
            try {
                const cache = await caches.open(cacheName);
                const requests = await cache.keys();
                const encoded = encodeURIComponent(modelId);
                await Promise.all(
                    requests
                        .filter(r => r.url.includes(modelId) || r.url.includes(encoded))
                        .map(r => cache.delete(r)),
                );
            } catch { /* skip */ }
        }));
    } catch { /* Cache API unavailable */ }
}
