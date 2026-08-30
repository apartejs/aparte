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
import { TOOL_TURNS_DROPPED, generationOptions, interruptOn, loadOptions, textStreamer } from './shared.js';

type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export const IMAGES_DROPPED =
    'This model has no vision runner: image parts were dropped from the prompt, so the model '
    + 'answers as if there were none. Register the model with task: "image-text-to-text", or '
    + 'point `runner` at a module of your own.';

/** The text parts of a message, joined — what a text-only chat template can take. */
function textOf(content: string | AparteContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
        .filter((p): p is Extract<AparteContentPart, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('');
}

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

/** The pipeline, as this runner calls it. Transformers.js types it per task; this is the one task. */
interface TextPipeline {
    (messages: SimpleMessage[], options: Record<string, unknown>): Promise<unknown>;
    tokenizer: unknown;
    dispose?: () => Promise<void>;
}

export const createRunner: CreateRunner = async (ctx) => {
    const pipeline = ctx.transformers.pipeline as unknown as (task: string, model: string, options: unknown) => Promise<TextPipeline>;
    const pipe = await pipeline('text-generation', ctx.modelId, loadOptions(ctx));

    return {
        async generate({ messages, options, emit, signal }: RunnerGenerateInput): Promise<void> {
            const { stopping, release } = interruptOn(signal, ctx.transformers);
            try {
                await pipe(flattenForChatTemplate(messages, ctx.warn), {
                    ...generationOptions(options),
                    streamer: textStreamer(ctx.transformers, pipe.tokenizer, emit),
                    stopping_criteria: stopping,
                });
            } finally {
                release();
            }
        },
        dispose() {
            return pipe.dispose?.();
        },
    };
};
