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

import { pipeline, TextStreamer, InterruptableStoppingCriteria, env, type TextGenerationPipeline } from '@huggingface/transformers';

// Fetch weights from the Hugging Face hub (not local paths) and cache them in the
// browser Cache API — this is what `listCachedModels()` scans on the main thread.
env.allowLocalModels = false;
env.useBrowserCache = true;

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
    | { type: 'cancel'; id: string };

function post(message: unknown): void {
    ctx.postMessage(message);
}

let _current: { modelId: string; pipe: TextGenerationPipeline } | null = null;
// Per-generate interrupts, so a consumer's stream-cancel actually STOPS the model
// (not just detaches the reader) — otherwise generation runs to max_new_tokens
// off-thread, wasting exactly the CPU/GPU/battery this provider exists to save.
const _activeStops = new Map<string, InterruptableStoppingCriteria>();

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
    if (msg.type === 'prepare') void handlePrepare(msg);
    else if (msg.type === 'generate') void handleGenerate(msg);
    else if (msg.type === 'cancel') _activeStops.get(msg.id)?.interrupt();
});
