// An overflowing prompt is named by the provider, because what a server writes for one is
// its wire format: a 400 body for a direct call, a stream error after a 200 for the rest.
// The client reads the code and compacts; core never learns these sentences.
import { describe, it, expect } from 'vitest';
import type { AparteStreamEvent } from '@aparte/core';
import { AparteErrorCode } from '@aparte/core';
import { createOpenAICompatProvider, parseOpenAICompatStream, presets } from '../index';

const provider = createOpenAICompatProvider(presets.OPENAI);
const OVERFLOW = AparteErrorCode.USAGE_CONTEXT_EXCEEDED;

function body(...lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.map((l) => `${l}\n`).join('');
    return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

describe('classifyError, on the body of a non-ok response', () => {
    it.each([
        ['OpenAI, by code', { error: { message: 'x', code: 'context_length_exceeded' } }],
        ['OpenAI, by message', { error: { message: "This model's maximum context length is 8192 tokens. However, you requested 9000 tokens." } }],
        ['a generic gateway', { error: { message: 'Input exceeds the context length of this model' } }],
        ['LM Studio', { error: 'Context size has been exceeded.' }],
        ['llama.cpp, by type', { error: { code: 400, type: 'exceed_context_size_error', message: 'oops' } }],
        ['llama.cpp, by message', { error: { code: 400, message: 'the request exceeds the available context size, try increasing it' } }],
        ['an Anthropic-style gateway', { error: { message: 'prompt is too long: 210000 tokens > 200000 maximum' } }],
        ['whatever the case', { error: { message: 'MAXIMUM CONTEXT LENGTH reached' } }],
    ])('a 400 from %s is an overflow', (_who, payload) => {
        expect(provider.classifyError(400, payload)).toBe(OVERFLOW);
    });

    it('a 413 saying the same is an overflow too', () => {
        expect(provider.classifyError(413, { error: { message: 'prompt is too long' } })).toBe(OVERFLOW);
    });

    it('leaves every other status to the status, whatever the body says', () => {
        for (const status of [401, 404, 429, 500, 503]) {
            expect(provider.classifyError(status, { error: { message: 'maximum context length' } })).toBeUndefined();
        }
    });

    it('leaves a 400 that is something else a bad request', () => {
        expect(provider.classifyError(400, { error: { message: "Invalid value for 'temperature'" } })).toBeUndefined();
        expect(provider.classifyError(400, { error: { message: 'Unknown parameter: foo', code: 'unknown_parameter' } })).toBeUndefined();
    });

    it('does not fall over on a body that is not an error payload', () => {
        for (const noise of [undefined, null, 'oops', 42, {}, { error: null }, { error: {} }, { message: 'maximum context length' }]) {
            expect(provider.classifyError(400, noise)).toBeUndefined();
        }
    });
});

describe('an error streamed after a 200', () => {
    it('carries the code when it is an overflow', async () => {
        const events = await collect(parseOpenAICompatStream(body(
            'data: {"error":{"message":"the request exceeds the available context size","type":"exceed_context_size_error"}}',
        )));
        expect(events).toEqual([{ type: 'error', message: 'the request exceeds the available context size', code: OVERFLOW }]);
    });

    it('carries the code for a string payload too', async () => {
        const events = await collect(parseOpenAICompatStream(body('data: {"error":"Context size has been exceeded."}')));
        expect(events).toEqual([{ type: 'error', message: 'Context size has been exceeded.', code: OVERFLOW }]);
    });

    it('carries no code at all for any other error', async () => {
        const events = await collect(parseOpenAICompatStream(body('data: {"error":{"message":"boom","type":"server_error"}}')));
        expect(events).toEqual([{ type: 'error', message: 'boom' }]);
        expect('code' in events[0]!).toBe(false);
    });
});

describe('a 200 body that is an error', () => {
    it('throws with the code when it is an overflow, so the turn can compact and resend', () => {
        let thrown: (Error & { code?: string }) | undefined;
        try { provider.parseText({ error: { message: 'Context size has been exceeded.' } }); } catch (e) { thrown = e as Error; }
        expect(thrown?.message).toBe('Context size has been exceeded.');
        expect(thrown?.code).toBe(OVERFLOW);
    });

    it('throws a plain error for anything else', () => {
        let thrown: (Error & { code?: string }) | undefined;
        try { provider.parseText({ error: { message: 'boom' } }); } catch (e) { thrown = e as Error; }
        expect(thrown?.code).toBeUndefined();
    });
});
