/**
 * What the two built-in runners share — kept in one place so the two cannot drift on
 * how progress is reported, how a stop reaches the model, or what a dropped tool turn
 * says. Types only from core (see `text-generation.ts` for why).
 */

import type { AparteStreamEvent } from '@aparte/core';
import type { RunnerContext, TransformersModule } from './types.js';

export const TOOL_TURNS_DROPPED =
    'Dropped the tool call(s) and their results from the prompt: this runner does not support '
    + 'tool calling, so the model sees neither the call the assistant made nor the result that '
    + 'answered it. What the assistant SAID before calling stays in the prompt. Use an '
    + 'OpenAI-compatible endpoint for tools, or a runner that renders them.';

/**
 * A content part neither built-in runner can carry. The union is text and image, so this
 * is unreachable from typed code — and reachable all the same from an app built against an
 * older aparte, which declared a third `file` part nothing ever filled. The wire mappers
 * guard the same case on the ROLE axis (`openai-compat`'s removed `tool_call`/`tool_result`);
 * the part axis had no guard, so the part was pushed into the image list as `undefined` and
 * `load_image` threw at generate time instead of the part being counted and named.
 */
export const UNSUPPORTED_PARTS_DROPPED =
    'Dropped content part(s) this runner cannot carry: it takes text and image parts only, so '
    + 'anything else leaves the prompt with nothing in its place. A `file` part is the case to '
    + 'expect — it was removed from `AparteContentPart`; inline what you want the model to read '
    + 'as text, or send an image.';

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

/**
 * The reply's ceiling when no `maxTokens` is set and the model's config names no context
 * size: long enough that an answer is not cut, short enough that a looping model stops.
 */
export const FALLBACK_MAX_NEW_TOKENS = 4096;

/**
 * How many tokens the model's window holds, prompt and reply together, read from its
 * config — a vision model keeps it on the text half. `undefined` when the config says nothing.
 */
export function contextLength(config: unknown): number | undefined {
    const c = config as Record<string, unknown> | undefined;
    const text = c?.['text_config'] as Record<string, unknown> | undefined;
    for (const value of [c?.['max_position_embeddings'], text?.['max_position_embeddings'], c?.['n_positions']]) {
        if (typeof value === 'number' && value > 0) return value;
    }
    return undefined;
}

/**
 * Sampling options in Transformers.js' vocabulary, from the request's.
 *
 * A `maxTokens` the caller set is the reply's ceiling. Without one, the reply runs until the
 * model ends it or its window is full: `max_length` counts the prompt too, so it is what the
 * window has left. `max_new_tokens: null` is load-bearing — the text-generation pipeline
 * defaults it to 256, and when set it wins over `max_length`.
 */
export function generationOptions(
    options: { maxTokens?: number; temperature?: number },
    contextSize?: number,
): Record<string, unknown> {
    const temperature = options.temperature ?? 0;
    const ceiling = options.maxTokens !== undefined
        ? { max_new_tokens: options.maxTokens }
        : contextSize !== undefined
            ? { max_new_tokens: null, max_length: contextSize }
            : { max_new_tokens: FALLBACK_MAX_NEW_TOKENS };
    return {
        ...ceiling,
        do_sample: temperature > 0,
        temperature: temperature > 0 ? temperature : undefined,
    };
}
