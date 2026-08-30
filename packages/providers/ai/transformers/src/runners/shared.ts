/**
 * What the two built-in runners share — kept in one place so the two cannot drift on
 * how progress is reported, how a stop reaches the model, or what a dropped tool turn
 * says. Types only from core (see `text-generation.ts` for why).
 */

import type { AparteStreamEvent } from '@aparte/core';
import type { RunnerContext, TransformersModule } from './types.js';

export const TOOL_TURNS_DROPPED =
    'Dropped tool turn(s) from the prompt: this runner does not support tool calling, so the '
    + 'model will not see the call or its result. Use an OpenAI-compatible endpoint for tools, '
    + 'or a runner that renders them.';

/**
 * The options a `from_pretrained` / `pipeline()` call takes from the context: download
 * progress forwarded to the page (percentages, rounded), dtype and device when set.
 */
export function loadOptions(ctx: RunnerContext): Record<string, unknown> {
    const opts: Record<string, unknown> = {
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
            if (p.status === 'progress') ctx.progress({ status: 'downloading', file: p.file, progress: Math.round(p.progress ?? 0) });
            else if (p.status === 'done') ctx.progress({ status: 'loading', file: p.file });
        },
    };
    if (ctx.dtype) opts['dtype'] = ctx.dtype;
    if (ctx.device && ctx.device !== 'auto') opts['device'] = ctx.device;
    return opts;
}

/**
 * A stopping criteria the signal interrupts — so a Stop actually STOPS the model, not just
 * the read; otherwise generation runs to `max_new_tokens` off-thread, spending exactly the
 * CPU/GPU/battery this provider exists to save. Call `release()` in a `finally`.
 */
export function interruptOn(signal: AbortSignal, transformers: TransformersModule): { stopping: unknown; release(): void } {
    const stopping = new transformers.InterruptableStoppingCriteria();
    const onAbort = (): void => { stopping.interrupt(); };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    return { stopping, release: () => { signal.removeEventListener('abort', onAbort); } };
}

/** A `TextStreamer` that emits each decoded token as a `text` event, prompt skipped. */
export function textStreamer(transformers: TransformersModule, tokenizer: unknown, emit: (event: AparteStreamEvent) => void): unknown {
    const TextStreamer = transformers.TextStreamer as unknown as new (tokenizer: unknown, options: Record<string, unknown>) => unknown;
    return new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => { if (text) emit({ type: 'text', delta: text }); },
    });
}

/** Sampling options in Transformers.js' vocabulary, from the request's. */
export function generationOptions(options: { maxTokens?: number; temperature?: number }): Record<string, unknown> {
    const temperature = options.temperature ?? 0;
    return {
        max_new_tokens: options.maxTokens ?? 512,
        do_sample: temperature > 0,
        temperature: temperature > 0 ? temperature : undefined,
    };
}
