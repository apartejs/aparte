/**
 * The built-in vision runner, driven with a fake Transformers.js module. Transformers.js
 * 4.x has no `image-text-to-text` PIPELINE, so this runner goes through the model classes
 * themselves: `AutoProcessor` + `AutoModelForImageTextToText`, the chat template, and
 * `generate()` with a streamer — the shape the SmolVLM examples use.
 *
 * What is asserted: the two classes are loaded for the model with dtype/device; each turn
 * becomes the HF chat shape (`{ type: 'image' }` placeholders in the content, the images
 * themselves passed beside the prompt IN ORDER); text turns stay text; tool turns are
 * dropped with a warning; tokens become `text` events; abort interrupts; disposing the
 * runner disposes the model.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRunner } from '../../runners/image-text-to-text.js';
import type { RunnerContext, RunnerGenerateInput } from '../../runners/types.js';
import type { AparteStreamEvent } from '@aparte/core';

function fakeTransformers() {
    const calls: {
        processorArgs?: unknown[]; modelArgs?: unknown[];
        templateArgs?: unknown[]; processArgs?: unknown[]; tokenizerArgs?: unknown[]; generateArgs?: unknown;
        loaded: string[]; interrupted: number; disposed: number;
    } = { loaded: [], interrupted: 0, disposed: 0 };
    let streamerCallback: ((text: string) => void) | undefined;
    class TextStreamer {
        constructor(_tokenizer: unknown, options: { callback_function?: (t: string) => void }) { streamerCallback = options.callback_function; }
    }
    class InterruptableStoppingCriteria { interrupt() { calls.interrupted++; } }
    // The processor pairs a prompt with images; asked with none it throws, as the real one
    // does (Idefics3's processor reads `images.rows`). The tokenizer alone takes text.
    const tokenizer = Object.assign(
        (text: unknown) => { calls.tokenizerArgs = [text]; return { input_ids: 'ids-only', attention_mask: 'mask' }; },
        { fake: true },
    );
    const processor = Object.assign(
        async (text: unknown, images: unknown) => {
            if (!Array.isArray(images) || images.length === 0) throw new TypeError("Cannot read properties of undefined (reading 'rows')");
            calls.processArgs = [text, images]; return { input_ids: 'ids', pixel_values: 'px' };
        },
        {
            tokenizer,
            apply_chat_template: (messages: unknown, options: unknown) => { calls.templateArgs = [messages, options]; return 'RENDERED PROMPT'; },
        },
    );
    const model = {
        generate: async (args: unknown) => { calls.generateArgs = args; streamerCallback?.('A '); streamerCallback?.('cat.'); return []; },
        dispose: async () => { calls.disposed++; },
    };
    const AutoProcessor = { from_pretrained: vi.fn(async (...args: unknown[]) => { calls.processorArgs = args; return processor; }) };
    const AutoModelForImageTextToText = { from_pretrained: vi.fn(async (...args: unknown[]) => { calls.modelArgs = args; return model; }) };
    const load_image = vi.fn(async (src: string) => { calls.loaded.push(src); return { image: src }; });
    return {
        module: { AutoProcessor, AutoModelForImageTextToText, load_image, TextStreamer, InterruptableStoppingCriteria, env: {} } as never,
        calls,
    };
}

function ctxFor(module: never, warn = vi.fn()): RunnerContext & { warn: ReturnType<typeof vi.fn>; progress: ReturnType<typeof vi.fn> } {
    return { transformers: module, modelId: 'vlm', dtype: 'q4', device: 'webgpu', progress: vi.fn(), warn };
}

async function run(messages: RunnerGenerateInput['messages'], ctx: RunnerContext, signal = new AbortController().signal) {
    const runner = await createRunner(ctx);
    const events: AparteStreamEvent[] = [];
    await runner.generate({ messages, options: { maxTokens: 64, temperature: 0 }, emit: (e) => { events.push(e); }, signal });
    return { runner, events };
}

const PNG_A = 'data:image/png;base64,AAAA';
const PNG_B = 'data:image/png;base64,BBBB';

describe('image-text-to-text runner', () => {
    it('loads the processor and the vision model for the model id, with dtype and device', async () => {
        const { module, calls } = fakeTransformers();
        await run([{ role: 'user', content: 'hi' }], ctxFor(module));
        expect(calls.processorArgs?.[0]).toBe('vlm');
        expect(calls.modelArgs?.[0]).toBe('vlm');
        expect(calls.modelArgs?.[1]).toMatchObject({ dtype: 'q4', device: 'webgpu' });
    });

    it('renders each turn in the HF chat shape — image placeholders in the content, images beside the prompt, in order', async () => {
        const { module, calls } = fakeTransformers();
        await run([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: [{ type: 'image', image: PNG_A }, { type: 'text', text: 'and this one?' }, { type: 'image', image: PNG_B }] },
            { role: 'assistant', content: 'Two pictures.' },
        ], ctxFor(module));
        expect(calls.templateArgs?.[0]).toEqual([
            { role: 'system', content: [{ type: 'text', text: 'be brief' }] },
            { role: 'user', content: [{ type: 'image' }, { type: 'text', text: 'and this one?' }, { type: 'image' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Two pictures.' }] },
        ]);
        expect(calls.templateArgs?.[1]).toMatchObject({ add_generation_prompt: true });
        expect(calls.loaded).toEqual([PNG_A, PNG_B]);
        expect(calls.processArgs?.[0]).toBe('RENDERED PROMPT');
        expect(calls.processArgs?.[1]).toEqual([{ image: PNG_A }, { image: PNG_B }]);
    });

    it('a turn without any image goes through the tokenizer alone — the processor wants pictures', async () => {
        // Found on a real SmolVLM: "hello" as the first message crashed the processor.
        const { module, calls } = fakeTransformers();
        const { events } = await run([{ role: 'user', content: 'just text' }], ctxFor(module));
        expect(calls.loaded).toEqual([]);
        expect(calls.processArgs).toBeUndefined();
        expect(calls.tokenizerArgs).toEqual(['RENDERED PROMPT']);
        expect(calls.generateArgs).toMatchObject({ input_ids: 'ids-only', attention_mask: 'mask' });
        expect(events).toEqual([{ type: 'text', delta: 'A ' }, { type: 'text', delta: 'cat.' }]);
    });

    it('drops tool turns with one warning', async () => {
        const { module, calls } = fakeTransformers();
        const ctx = ctxFor(module);
        await run([
            { role: 'user', content: 'weather?' },
            { role: 'tool_call', content: '', toolCalls: [{ id: 't1', name: 'get_weather', input: {} }] },
            { role: 'tool_result', content: 'Cloudy', toolCallId: 't1' },
        ], ctx);
        expect(calls.templateArgs?.[0]).toEqual([{ role: 'user', content: [{ type: 'text', text: 'weather?' }] }]);
        expect(ctx.warn).toHaveBeenCalledTimes(1);
        expect(ctx.warn.mock.calls[0]?.[0]).toMatch(/tool/);
    });

    it('generates from the processed inputs with the options, streaming tokens as text events', async () => {
        const { module, calls } = fakeTransformers();
        const { events } = await run([{ role: 'user', content: [{ type: 'image', image: PNG_A }, { type: 'text', text: '?' }] }], ctxFor(module));
        expect(calls.generateArgs).toMatchObject({ input_ids: 'ids', pixel_values: 'px', max_new_tokens: 64, do_sample: false });
        expect(events).toEqual([{ type: 'text', delta: 'A ' }, { type: 'text', delta: 'cat.' }]);
    });

    it('an aborted signal interrupts the stopping criteria', async () => {
        const { module, calls } = fakeTransformers();
        const ac = new AbortController();
        const runner = await createRunner(ctxFor(module));
        const p = runner.generate({ messages: [{ role: 'user', content: 'hi' }], options: {}, emit: () => {}, signal: ac.signal });
        ac.abort();
        await p;
        expect(calls.interrupted).toBe(1);
    });

    it('reports download progress through the context, and disposing the runner disposes the model', async () => {
        const { module, calls } = fakeTransformers();
        const ctx = ctxFor(module);
        const runner = await createRunner(ctx);
        const opts = calls.modelArgs?.[1] as { progress_callback: (p: unknown) => void };
        opts.progress_callback({ status: 'progress', file: 'decoder.onnx', progress: 12.6 });
        expect(ctx.progress).toHaveBeenCalledWith({ status: 'downloading', file: 'decoder.onnx', progress: 13 });
        await runner.dispose?.();
        expect(calls.disposed).toBe(1);
    });
});
