/**
 * @aparte/provider-transformers — run LLMs 100% in the browser via Transformers.js.
 *
 * A local, keyless `AparteAIProvider`: it owns its I/O (inference runs off the main
 * thread in a Web Worker) so `DirectTransport` delegates to its `chat()`. Model
 * weights download once and persist in the Cache API.
 *
 * Scope (v1): generic **text-generation** streaming. Tool-calling for local models is
 * model-specific (every family has its own wire format) and is out of scope here — the
 * app registers models and streams plain replies. Vision / embeddings can follow on demand.
 */

import type {
    AparteAIProvider,
    AparteAIModel,
    AparteChatRequest,
    AparteChatResponse,
    AparteChatMessage,
    ModelStatus,
    ModelLoadProgress,
} from '@aparte/core';
import { contentToText } from '@aparte/core';

/** The minimal chat shape passed to the worker (the tokenizer applies the chat template). */
type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

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
    /** Transformers.js pipeline task — determines the model architecture / load path. */
    task: 'text-generation';
    /** ONNX dtype or per-part dtype map (e.g. `'q4'` or `{ decoder_model_merged: 'q4' }`). */
    dtype?: string | Record<string, string>;
    /** Preferred device. Defaults to WebGPU when available, else WASM. */
    device?: 'webgpu' | 'wasm' | 'auto';
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

/** AparteChatMessage[] → plain chat turns (the tokenizer's chat template does the rest). */
function toMessages(messages: AparteChatMessage[]): SimpleMessage[] {
    const result: SimpleMessage[] = [];
    for (const m of messages) {
        if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
            const text = contentToText(m.content);
            if (text) result.push({ role: m.role, content: text });
        }
        // tool_call / tool_result are not supported by this generic provider (v1).
    }
    return result;
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

// ── Generate serialization ──────────────────────────────────────────────────
// The worker holds ONE pipeline: two concurrent generates would corrupt each
// other. Each chat() chains its `generate` behind the previous generate's
// completion (gen-done / gen-error).
let _generateChain: Promise<void> = Promise.resolve();
const _generateDoneResolvers = new Map<string, () => void>();

/** Settle the serialization slot for a finished generate. */
function _releaseGenerateSlot(id: string): void {
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

function _getWorker(): Worker {
    if (!_worker) {
        _worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        _worker.addEventListener('message', _handleWorkerMessage);
        _worker.addEventListener('error', _handleWorkerError);
        _worker.addEventListener('messageerror', _handleWorkerError);
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

    // Release every serialization slot so the generate chain doesn't deadlock.
    for (const resolve of _generateDoneResolvers.values()) {
        try { resolve(); } catch { /* ignore */ }
    }
    _generateDoneResolvers.clear();
    _generateChain = Promise.resolve();

    _loadedModelId = null;
    _preparingModelId = null;
    try { _worker?.terminate(); } catch { /* ignore */ }
    _worker = null;
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
        case 'gen-chunk': {
            const ctrl = _pendingGenerates.get(msg.id);
            if (!ctrl) break;
            ctrl.enqueue({ type: msg.chunkType as 'text' | 'thinking', delta: msg.delta });
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

export const TransformersProvider: AparteAIProvider = {
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

    async chat(request: AparteChatRequest): Promise<AparteChatResponse> {
        const messages = toMessages(request.messages);
        const requestId = crypto.randomUUID();
        const options = {
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            seed: request.seed,
        };
        const task = _registeredModels.get(request.modelId)?.task ?? 'text-generation';

        // ── Reserve a serialization slot ─────────────────────────────────────
        // Chain this generate behind the previous one; the worker has a single
        // pipeline, so generates MUST NOT overlap.
        const prevGenerate = _generateChain;
        _generateChain = new Promise<void>((resolveSlot) => {
            _generateDoneResolvers.set(requestId, resolveSlot);
        });
        const postGenerate = (): void => {
            _getWorker().postMessage({
                type: 'generate',
                id: requestId,
                modelId: request.modelId,
                messages,
                options,
                task,
                dtype: _registeredModels.get(request.modelId)?.dtype,
                device: _computeDevice,
            });
        };

        if (request.stream === false) {
            return new Promise<string>((resolve, reject) => {
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
        }

        return new ReadableStream({
            async start(controller) {
                _pendingGenerates.set(requestId, controller);
                await prevGenerate;
                postGenerate();
            },
            cancel() {
                _pendingGenerates.delete(requestId);
                // Actually STOP the model (not just detach the reader): tell the worker
                // to interrupt this generate. The serialization slot is still released
                // by the resulting gen-done/gen-error, so a queued generate can't start
                // before the worker has stopped this one.
                _getWorker().postMessage({ type: 'cancel', id: requestId });
            },
        });
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

        const requestId = crypto.randomUUID();
        _preparingModelId = modelId;

        const task = _registeredModels.get(modelId)?.task ?? 'text-generation';
        const dtype = _registeredModels.get(modelId)?.dtype;
        return new Promise<void>((resolve, reject) => {
            _pendingPrepares.set(requestId, { modelId, onProgress, resolve, reject });
            _getWorker().postMessage({ type: 'prepare', id: requestId, modelId, task, dtype, device: _computeDevice });
        });
    },

    async deleteModel(modelId: string): Promise<void> {
        await deleteCachedModel(modelId);
    },
};

export default TransformersProvider;
export type { AparteAIProvider, AparteAIModel, ModelStatus, ModelLoadProgress } from '@aparte/core';

// ─────────────────────────────────────────────────────────────────────────────
// Cache utilities (settings panels, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the modelId currently loaded in the worker's pipeline, or null. */
export function getLoadedModelId(): string | null {
    return _loadedModelId;
}

/** Terminate the shared worker and reset in-memory state. Safe to call any time. */
export function terminateWorker(): void {
    _worker?.terminate();
    _worker = null;
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
