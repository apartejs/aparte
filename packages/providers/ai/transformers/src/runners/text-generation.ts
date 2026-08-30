/**
 * The built-in text runner — the generic `pipeline('text-generation')` path this
 * provider has always run, extracted from the worker so it is one runner among others.
 *
 * It flattens the conversation to `{ role, content: string }` turns (the tokenizer applies
 * the chat template). Two things it cannot carry, it SAYS: tool turns (their wire syntax is
 * model-specific) and image parts (a text model has no eyes). The second used to vanish
 * silently — a photo attached to a text model produced an answer that pretended — and
 * that silence, not the limitation, was the defect.
 */

// Types only. A runner runs INSIDE the worker, and the worker bundle has no way to
// resolve `@aparte/core` at runtime (an import map does not reach a worker) — so a value
// import here is not externalised, it is inlined: the first build that imported
// `contentToText` shipped all of core, components included, in a 426 kB runner chunk.
import type { AparteChatMessage, AparteContentPart } from '@aparte/core';
import type { CreateRunner, RunnerContext, RunnerGenerateInput } from './types.js';

type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

/** The text parts of a message, joined — what a text-only chat template can take. */
function textOf(content: string | AparteContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
        .filter((p): p is Extract<AparteContentPart, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('');
}

export const IMAGES_DROPPED =
    'This model has no vision runner: image parts were dropped from the prompt, so the model '
    + 'answers as if there were none. Register the model with task: "image-text-to-text", or '
    + 'point `runner` at a module of your own.';

export const TOOL_TURNS_DROPPED =
    'Dropped tool turn(s) from the prompt: this runner does not support tool calling, so the '
    + 'model will not see the call or its result. Use an OpenAI-compatible endpoint for tools, '
    + 'or a runner that renders them.';

/** Flatten to what the chat template takes; say what was left out. */
export function flattenForChatTemplate(messages: AparteChatMessage[], warn: RunnerContext['warn']): SimpleMessage[] {
    const result: SimpleMessage[] = [];
    let droppedImages = 0;
    let droppedToolTurns = 0;
    for (const m of messages) {
        if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
            if (Array.isArray(m.content)) droppedImages += m.content.filter((p) => p.type === 'image').length;
            const text = textOf(m.content);
            if (text) result.push({ role: m.role, content: text });
        } else {
            droppedToolTurns++;
        }
    }
    if (droppedImages > 0) warn(IMAGES_DROPPED);
    if (droppedToolTurns > 0) warn(TOOL_TURNS_DROPPED);
    return result;
}

export const createRunner: CreateRunner = async (ctx) => {
    const { pipeline, TextStreamer, InterruptableStoppingCriteria } = ctx.transformers;

    const opts: Record<string, unknown> = {
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
            if (p.status === 'progress') ctx.progress({ status: 'downloading', file: p.file, progress: Math.round(p.progress ?? 0) });
            else if (p.status === 'done') ctx.progress({ status: 'loading', file: p.file });
        },
    };
    if (ctx.dtype) opts['dtype'] = ctx.dtype;
    if (ctx.device && ctx.device !== 'auto') opts['device'] = ctx.device;

    // The pipeline's own overloads are per-task literals; the cast keeps this call on the
    // one task this runner exists for.
    const pipe = await (pipeline as (task: string, model: string, options: unknown) => Promise<unknown>)('text-generation', ctx.modelId, opts) as {
        (messages: SimpleMessage[], options: Record<string, unknown>): Promise<unknown>;
        tokenizer: unknown;
        dispose?: () => Promise<void>;
    };

    return {
        async generate({ messages, options, emit, signal }: RunnerGenerateInput): Promise<void> {
            const stopping = new InterruptableStoppingCriteria();
            const onAbort = (): void => { stopping.interrupt(); };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
            try {
                const streamer = new (TextStreamer as unknown as new (tokenizer: unknown, options: Record<string, unknown>) => unknown)(pipe.tokenizer, {
                    skip_prompt: true,
                    skip_special_tokens: true,
                    callback_function: (text: string) => { if (text) emit({ type: 'text', delta: text }); },
                });
                const temperature = options.temperature ?? 0;
                await pipe(flattenForChatTemplate(messages, ctx.warn), {
                    max_new_tokens: options.maxTokens ?? 512,
                    do_sample: temperature > 0,
                    temperature: temperature > 0 ? temperature : undefined,
                    streamer,
                    stopping_criteria: stopping,
                });
            } finally {
                signal.removeEventListener('abort', onAbort);
            }
        },
        dispose() {
            return pipe.dispose?.();
        },
    };
};
