/**
 * Generic Transformers.js inference worker.
 *
 * Runs entirely off the main thread. It holds ONE text-generation pipeline at a
 * time and speaks a tiny postMessage protocol with the provider on the main
 * thread (see `index.ts`):
 *
 *   main → worker : { type: 'prepare',  id, modelId, dtype?, device? }
 *                   { type: 'generate', id, modelId, messages, options, dtype?, device? }
 *   worker → main : { type: 'progress', id, status, file?, progress? }
 *                   { type: 'prepare-error', id, message }
 *                   { type: 'pipeline-ready', modelId }
 *                   { type: 'gen-chunk', id, chunkType: 'text', delta }
 *                   { type: 'gen-done', id }
 *                   { type: 'gen-error', id, message }
 *
 * Deliberately generic: no vision, no low-level ORT session management, no
 * model-family specifics — just the high-level `pipeline()` + `TextStreamer`.
 */

import type { pipeline as Pipeline, TextStreamer as TextStreamerClass, InterruptableStoppingCriteria as StoppingCriteriaClass, TextGenerationPipeline } from '@huggingface/transformers';

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
 * The order matters: a bundled app must never reach for the network copy.
 */
type TransformersModule = {
    pipeline: typeof Pipeline;
    TextStreamer: typeof TextStreamerClass;
    InterruptableStoppingCriteria: typeof StoppingCriteriaClass;
    env: { allowLocalModels: boolean; useBrowserCache: boolean };
};

let _moduleUrl: string | undefined;
let _tf: Promise<TransformersModule> | null = null;

function transformers(): Promise<TransformersModule> {
    _tf ??= (async () => {
        let mod: TransformersModule;
        try {
            mod = await import('@huggingface/transformers') as unknown as TransformersModule;
        } catch (bundlerPathFailed) {
            if (!_moduleUrl) throw bundlerPathFailed;
            mod = await import(/* @vite-ignore */ _moduleUrl) as unknown as TransformersModule;
        }
        // Fetch weights from the Hugging Face hub (not local paths) and cache them in the
        // browser Cache API — this is what `listCachedModels()` scans on the main thread.
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        return mod;
    })();
    return _tf;
}

// DOM's `Worker` interface types `postMessage` + typed `addEventListener('message')`,
// which is enough for the worker scope — avoids pulling the WebWorker lib (it clashes
// with DOM's global `postMessage`).
const ctx = self as unknown as Worker;

type Dtype = string | Record<string, string>;
type Device = 'webgpu' | 'wasm' | 'auto';
interface GenOptions { maxTokens?: number; temperature?: number; seed?: number }
type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

type InMessage =
    | { type: 'prepare'; id: string; modelId: string; dtype?: Dtype; device?: Device }
    | { type: 'generate'; id: string; modelId: string; messages: SimpleMessage[]; options: GenOptions; dtype?: Dtype; device?: Device }
    | { type: 'cancel'; id: string }
    // Sent once, before anything else, when the main thread could read the peer's URL out
    // of the page's import map. Absent under a bundler, which has already resolved it.
    | { type: 'init'; transformersUrl?: string };

function post(message: unknown): void {
    ctx.postMessage(message);
}

let _current: { modelId: string; pipe: TextGenerationPipeline } | null = null;
// Per-generate interrupts, so a consumer's stream-cancel actually STOPS the model
// (not just detaches the reader) — otherwise generation runs to max_new_tokens
// off-thread, wasting exactly the CPU/GPU/battery this provider exists to save.
const _activeStops = new Map<string, InstanceType<typeof StoppingCriteriaClass>>();

/**
 * Ensure the pipeline for `modelId` is loaded, reusing the current one when it
 * matches. On a fresh load it forwards download progress (when `id` is given) and
 * announces `pipeline-ready`.
 */
async function ensurePipeline(modelId: string, dtype: Dtype | undefined, device: Device | undefined, id?: string): Promise<TextGenerationPipeline> {
    if (_current?.modelId === modelId) return _current.pipe;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: Record<string, any> = {
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
            if (!id) return;
            if (p.status === 'progress') {
                post({ type: 'progress', id, status: 'downloading', file: p.file, progress: Math.round(p.progress ?? 0) });
            } else if (p.status === 'done') {
                post({ type: 'progress', id, status: 'loading', file: p.file });
            }
        },
    };
    if (dtype) opts['dtype'] = dtype;
    if (device && device !== 'auto') opts['device'] = device;

    const { pipeline } = await transformers();
    const pipe = await pipeline('text-generation', modelId, opts) as TextGenerationPipeline;
    _current = { modelId, pipe };
    post({ type: 'pipeline-ready', modelId });
    return pipe;
}

async function handlePrepare(msg: Extract<InMessage, { type: 'prepare' }>): Promise<void> {
    try {
        await ensurePipeline(msg.modelId, msg.dtype, msg.device, msg.id);
        post({ type: 'progress', id: msg.id, status: 'ready' });
    } catch (err) {
        post({ type: 'prepare-error', id: msg.id, message: (err as Error)?.message ?? 'Failed to load model' });
    }
}

async function handleGenerate(msg: Extract<InMessage, { type: 'generate' }>): Promise<void> {
    const { TextStreamer, InterruptableStoppingCriteria } = await transformers();
    const stoppingCriteria = new InterruptableStoppingCriteria();
    _activeStops.set(msg.id, stoppingCriteria);
    try {
        const pipe = await ensurePipeline(msg.modelId, msg.dtype, msg.device, msg.id);

        const streamer = new TextStreamer(pipe.tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: (text: string) => {
                if (text) post({ type: 'gen-chunk', id: msg.id, chunkType: 'text', delta: text });
            },
        });

        const temperature = msg.options.temperature ?? 0;
        await pipe(msg.messages, {
            max_new_tokens: msg.options.maxTokens ?? 512,
            do_sample: temperature > 0,
            temperature: temperature > 0 ? temperature : undefined,
            streamer,
            stopping_criteria: stoppingCriteria,
        });

        post({ type: 'gen-done', id: msg.id });
    } catch (err) {
        post({ type: 'gen-error', id: msg.id, message: (err as Error)?.message ?? 'Generation failed' });
    } finally {
        _activeStops.delete(msg.id);
    }
}

ctx.addEventListener('message', (event: MessageEvent<InMessage>) => {
    const msg = event.data;
    if (msg.type === 'init') { _moduleUrl = msg.transformersUrl; return; }
    if (msg.type === 'prepare') void handlePrepare(msg);
    else if (msg.type === 'generate') void handleGenerate(msg);
    else if (msg.type === 'cancel') _activeStops.get(msg.id)?.interrupt();
});
