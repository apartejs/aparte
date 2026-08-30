/**
 * The built-in vision runner — a model that reads images and text and writes text
 * (SmolVLM, Qwen2-VL, LFM2-VL, Gemma 3, LLaVA…: everything `AutoModelForImageTextToText`
 * resolves).
 *
 * Transformers.js 4.x has no `image-text-to-text` PIPELINE, so this runner goes through
 * the model classes themselves, the way the SmolVLM examples do: `AutoProcessor` renders
 * the chat template with `{ type: 'image' }` placeholders, the images are decoded beside
 * the prompt in the same order, the processor turns both into tensors, and `generate()`
 * streams through a `TextStreamer`. Tool turns are dropped with the shared warning.
 */

import type { AparteChatMessage } from '@aparte/core';
import type { CreateRunner, RunnerGenerateInput } from './types.js';
import { TOOL_TURNS_DROPPED, generationOptions, interruptOn, loadOptions, textStreamer } from './shared.js';

type HFPart = { type: 'image' } | { type: 'text'; text: string };
type HFMessage = { role: 'user' | 'assistant' | 'system'; content: HFPart[] };

export const UNSUPPORTED_PARTS_DROPPED =
    'Dropped content part(s) this vision runner cannot carry (only text and image parts reach the model).';

/**
 * The conversation in the HF chat shape the processor's template expects — every turn's
 * content as parts, an `{ type: 'image' }` placeholder where a picture goes — plus the
 * pictures themselves, in order of appearance, for the processor to pair with them.
 */
export function toChatTemplate(messages: AparteChatMessage[], warn: (message: string) => void): { chat: HFMessage[]; images: string[] } {
    const chat: HFMessage[] = [];
    const images: string[] = [];
    let droppedToolTurns = 0;
    let droppedParts = 0;
    for (const m of messages) {
        if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') { droppedToolTurns++; continue; }
        const parts: HFPart[] = [];
        if (typeof m.content === 'string') {
            if (m.content) parts.push({ type: 'text', text: m.content });
        } else {
            for (const p of m.content) {
                if (p.type === 'text') { if (p.text) parts.push({ type: 'text', text: p.text }); }
                else if (p.type === 'image') { images.push(p.image); parts.push({ type: 'image' }); }
                else droppedParts++;
            }
        }
        if (parts.length > 0) chat.push({ role: m.role, content: parts });
    }
    if (droppedToolTurns > 0) warn(TOOL_TURNS_DROPPED);
    if (droppedParts > 0) warn(UNSUPPORTED_PARTS_DROPPED);
    return { chat, images };
}

/** The processor and model, as this runner calls them (Transformers.js types them through `Callable`). */
interface VisionProcessor {
    (text: string, images: unknown[]): Promise<Record<string, unknown>>;
    /** The text half alone — callable, for a turn that carries no picture. */
    tokenizer: (text: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
    apply_chat_template(messages: HFMessage[], options: Record<string, unknown>): unknown;
}
interface VisionModel {
    generate(args: Record<string, unknown>): Promise<unknown>;
    dispose(): Promise<unknown>;
}

export const createRunner: CreateRunner = async (ctx) => {
    const tf = ctx.transformers as unknown as {
        AutoProcessor: { from_pretrained(model: string, options?: unknown): Promise<VisionProcessor> };
        AutoModelForImageTextToText: { from_pretrained(model: string, options?: unknown): Promise<VisionModel> };
        load_image(source: string): Promise<unknown>;
    };
    // The processor carries no weights: dtype and device are the model's alone.
    const [processor, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(ctx.modelId),
        tf.AutoModelForImageTextToText.from_pretrained(ctx.modelId, loadOptions(ctx)),
    ]);

    return {
        async generate({ messages, options, emit, signal }: RunnerGenerateInput): Promise<void> {
            const { stopping, release } = interruptOn(signal, ctx.transformers);
            try {
                const { chat, images } = toChatTemplate(messages, ctx.warn);
                const prompt = processor.apply_chat_template(chat, { add_generation_prompt: true, tokenize: false }) as string;
                // The processor pairs the prompt with pictures and wants at least one (Idefics3's
                // reads `images.rows` — "hello" as a first message crashed it on a real SmolVLM).
                // A turn with no image is text: the tokenizer alone takes it.
                const inputs = images.length > 0
                    ? await processor(prompt, await Promise.all(images.map((src) => tf.load_image(src))))
                    : await processor.tokenizer(prompt);
                await model.generate({
                    ...inputs,
                    ...generationOptions(options),
                    streamer: textStreamer(ctx.transformers, processor.tokenizer, emit),
                    stopping_criteria: stopping,
                });
            } finally {
                release();
            }
        },
        async dispose() {
            await model.dispose();
        },
    };
};
