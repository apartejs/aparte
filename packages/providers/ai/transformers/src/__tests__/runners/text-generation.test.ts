/**
 * The built-in text runner — today's worker body, extracted. Driven with a fake
 * Transformers.js module: `pipeline()` returns a callable pipe that records what it was
 * asked and feeds the streamer, `TextStreamer` records its callback,
 * `InterruptableStoppingCriteria` records the interrupt.
 *
 * What is asserted: the pipe is asked for `text-generation` with dtype/device; content
 * parts are flattened to text; an image part is DROPPED WITH A WARNING (it used to
 * vanish silently — the one behaviour change of the extraction); tool turns are dropped
 * with the existing warning; tokens become `text` events; the abort signal interrupts.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRunner } from '../../runners/text-generation.js';
import type { RunnerContext, RunnerGenerateInput } from '../../runners/types.js';
import type { AparteStreamEvent } from '@aparte/core';

function fakeTransformers() {
    const calls: { pipelineArgs?: unknown[]; pipeArgs?: unknown[]; interrupted: number } = { interrupted: 0 };
    let streamerCallback: ((text: string) => void) | undefined;
    class TextStreamer {
        constructor(_tokenizer: unknown, options: { callback_function?: (t: string) => void }) { streamerCallback = options.callback_function; }
    }
    class InterruptableStoppingCriteria { interrupt() { calls.interrupted++; } }
    const pipe = Object.assign(
        async (messages: unknown, opts: unknown) => {
            calls.pipeArgs = [messages, opts];
            streamerCallback?.('Hel');
            streamerCallback?.('lo');
            return [];
        },
        { tokenizer: { fake: true } },
    );
    const pipeline = vi.fn(async (...args: unknown[]) => { calls.pipelineArgs = args; return pipe; });
    return { module: { pipeline, TextStreamer, InterruptableStoppingCriteria, env: {} } as never, calls };
}

function ctxFor(module: never, warn = vi.fn()): RunnerContext & { warn: ReturnType<typeof vi.fn> } {
    return { transformers: module, modelId: 'm1', dtype: 'q4', device: 'webgpu', progress: vi.fn(), warn };
}

async function run(messages: RunnerGenerateInput['messages'], ctx: RunnerContext, signal = new AbortController().signal) {
    const runner = await createRunner(ctx);
    const events: AparteStreamEvent[] = [];
    await runner.generate({ messages, options: { maxTokens: 64, temperature: 0 }, emit: (e) => { events.push(e); }, signal });
    return events;
}

describe('text-generation runner', () => {
    it('asks Transformers.js for a text-generation pipeline with the model, dtype and device', async () => {
        const { module, calls } = fakeTransformers();
        await run([{ role: 'user', content: 'hi' }], ctxFor(module));
        expect(calls.pipelineArgs?.[0]).toBe('text-generation');
        expect(calls.pipelineArgs?.[1]).toBe('m1');
        expect(calls.pipelineArgs?.[2]).toMatchObject({ dtype: 'q4', device: 'webgpu' });
    });

    it('flattens content parts to plain role/content messages for the chat template', async () => {
        const { module, calls } = fakeTransformers();
        await run([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }] },
        ], ctxFor(module));
        expect(calls.pipeArgs?.[0]).toEqual([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: 'hi there' },
        ]);
    });

    it('drops an image part with ONE warning naming the vision runner — never silently', async () => {
        const { module, calls } = fakeTransformers();
        const ctx = ctxFor(module);
        await run([
            { role: 'user', content: [{ type: 'image', image: 'data:image/png;base64,AAAA' }, { type: 'text', text: 'what is it?' }] },
            { role: 'user', content: [{ type: 'image', image: 'data:image/png;base64,BBBB' }] },
        ], ctx);
        expect(calls.pipeArgs?.[0]).toEqual([{ role: 'user', content: 'what is it?' }]);
        expect(ctx.warn).toHaveBeenCalledTimes(1);
        expect(ctx.warn.mock.calls[0]?.[0]).toMatch(/image-text-to-text/);
    });

    it('drops tool turns with the existing warning', async () => {
        const { module, calls } = fakeTransformers();
        const ctx = ctxFor(module);
        await run([
            { role: 'user', content: 'weather?' },
            { role: 'tool_call', content: '', toolCalls: [{ id: 't1', name: 'get_weather', input: {} }] },
            { role: 'tool_result', content: 'Cloudy', toolCallId: 't1' },
        ], ctx);
        expect(calls.pipeArgs?.[0]).toEqual([{ role: 'user', content: 'weather?' }]);
        expect(ctx.warn).toHaveBeenCalledTimes(1);
        expect(ctx.warn.mock.calls[0]?.[0]).toMatch(/tool/);
    });

    it('streams tokens as text events and passes the generation options through', async () => {
        const { module, calls } = fakeTransformers();
        const events = await run([{ role: 'user', content: 'hi' }], ctxFor(module));
        expect(events).toEqual([{ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }]);
        expect(calls.pipeArgs?.[1]).toMatchObject({ max_new_tokens: 64, do_sample: false });
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

    it('reports download progress through the context', async () => {
        const { module } = fakeTransformers();
        const ctx = ctxFor(module);
        await createRunner(ctx);
        const opts = (module as unknown as { pipeline: ReturnType<typeof vi.fn> }).pipeline.mock.calls[0]?.[2] as { progress_callback: (p: unknown) => void };
        opts.progress_callback({ status: 'progress', file: 'model.onnx', progress: 42.4 });
        opts.progress_callback({ status: 'done', file: 'model.onnx' });
        expect(ctx.progress).toHaveBeenNthCalledWith(1, { status: 'downloading', file: 'model.onnx', progress: 42 });
        expect(ctx.progress).toHaveBeenNthCalledWith(2, { status: 'loading', file: 'model.onnx' });
    });
});
