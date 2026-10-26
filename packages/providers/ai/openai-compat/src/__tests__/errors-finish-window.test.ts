// What a server says besides a reply: an error after a 200, why the reply ended, and how
// big a window it serves. Fake streams and a mocked fetch, like the rest of the suite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AparteStreamEvent } from '@aparte/core';
import { createOpenAICompatProvider, parseOpenAICompatStream, presets } from '../index';

function body(...lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.map(l => `${l}\n`).join('');
    return new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('errors streamed after a 200', () => {
    it('LM Studio context overflow: event: error then a data error line ends in ONE error, no done', async () => {
        const events = await collect(parseOpenAICompatStream(body(
            'event: error',
            'data: {"error":{"message":"The number of tokens to keep from the initial prompt is greater than the context length. Context size has been exceeded."}}',
        )));
        expect(events).toEqual([
            {
                type: 'error',
                message: 'The number of tokens to keep from the initial prompt is greater than the context length. Context size has been exceeded.',
                code: 'USAGE_CONTEXT_EXCEEDED',
            },
        ]);
    });

    it('an error after some text keeps the text and drops the done', async () => {
        const events = await collect(parseOpenAICompatStream(body(
            'data: {"choices":[{"delta":{"content":"Hel"}}]}',
            'data: {"error":{"message":"boom","type":"server_error"}}',
            'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
            'data: [DONE]',
        )));
        expect(events.map(e => e.type)).toEqual(['text', 'error']);
    });

    it('takes the error itself when it is a string', async () => {
        const events = await collect(parseOpenAICompatStream(body('data: {"error":"model not loaded"}')));
        expect(events).toEqual([{ type: 'error', message: 'model not loaded' }]);
    });

    it('still gives a message when the error carries none', async () => {
        const events = await collect(parseOpenAICompatStream(body('data: {"error":{}}')));
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'error' });
        expect((events[0] as { message: string }).message).toBeTruthy();
    });

    it('parseText throws the server message for a 200 body with error and no choices', () => {
        const provider = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        expect(() => provider.parseText({ error: { message: 'Context size has been exceeded.' } })).toThrow('Context size has been exceeded.');
        expect(provider.parseText({ choices: [{ message: { content: 'ok' } }] })).toBe('ok');
        expect(provider.parseText({})).toBe('');
    });
});

describe('finish reason', () => {
    const finishing = (reason: string | null, ...tail: string[]) => body(
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        `data: {"choices":[{"delta":{},"finish_reason":${JSON.stringify(reason)}}]}`,
        ...tail,
    );

    it.each([
        ['stop', 'stop'],
        ['length', 'length'],
        ['tool_calls', 'tool-calls'],
        ['function_call', 'tool-calls'],
        ['content_filter', 'content-filter'],
        ['something_new', 'other'],
    ])('maps %s to %s on the [DONE] path', async (wire, mapped) => {
        const events = await collect(parseOpenAICompatStream(finishing(wire, 'data: [DONE]')));
        expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: mapped });
    });

    it('also reports it when the socket closes without [DONE]', async () => {
        const events = await collect(parseOpenAICompatStream(finishing('length')));
        expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: 'length' });
    });

    it('keeps the last non-null one, past a usage-only chunk', async () => {
        const events = await collect(parseOpenAICompatStream(body(
            'data: {"choices":[{"delta":{"content":"a"},"finish_reason":null}]}',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2}}',
            'data: [DONE]',
        )));
        expect(events.at(-1)).toMatchObject({ type: 'done', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } });
    });

    it('leaves it off when the server never said', async () => {
        const events = await collect(parseOpenAICompatStream(body('data: {"choices":[{"delta":{"content":"a"}}]}', 'data: [DONE]')));
        expect(events.at(-1)).not.toHaveProperty('finishReason');
    });
});

describe('context window', () => {
    const route = (table: Record<string, unknown>) => {
        vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url in table) return jsonResponse(table[url]);
            return new Response('nope', { status: 404 });
        });
    };

    it.each([
        ['context_length', 'a'],
        ['max_model_len', 'b'],
        ['context_window', 'c'],
        ['max_context_length', 'd'],
    ])('reads %s from a /models entry', async (field, id) => {
        route({ 'https://x.test/v1/models': { data: [{ id, [field]: 8192 }] } });
        const models = await createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1', isLocal: true }).fetchModels!({});
        expect(models[0]?.contextWindow).toBe(8192);
    });

    it('ignores a window that is not a positive integer', async () => {
        route({ 'https://x.test/v1/models': { data: [{ id: 'a', context_length: null }, { id: 'b', context_length: 0 }, { id: 'c', context_length: '4096' }] } });
        const models = await createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1', isLocal: true }).fetchModels!({});
        expect(models.map(m => m.contextWindow)).toEqual([undefined, undefined, undefined]);
    });

    it('LM Studio: the loaded context, not the trained maximum; none for an unloaded model', async () => {
        route({
            'http://localhost:1234/v1/models': { data: [{ id: 'loaded-one' }, { id: 'cold-one' }] },
            'http://localhost:1234/api/v1/models': {
                models: [
                    { key: 'loaded-one', max_context_length: 262144, loaded_instances: [{ id: 'loaded-one', config: { context_length: 4096 } }] },
                    { key: 'cold-one', max_context_length: 131072, loaded_instances: [] },
                ],
            },
        });
        const models = await createOpenAICompatProvider(presets.LMSTUDIO).fetchModels!({});
        expect(models.map(m => [m.id, m.contextWindow])).toEqual([['loaded-one', 4096], ['cold-one', undefined]]);
    });

    it('LM Studio: a model loaded under an identifier of its own is found by that identifier', async () => {
        route({
            'http://localhost:1234/v1/models': { data: [{ id: 'gemma-e4b-4k' }] },
            'http://localhost:1234/api/v1/models': {
                models: [{ key: 'google/gemma-4-e4b', max_context_length: 131072, loaded_instances: [{ id: 'gemma-e4b-4k', config: { context_length: 4096 } }] }],
            },
        });
        const models = await createOpenAICompatProvider(presets.LMSTUDIO).fetchModels!({});
        expect(models.map(m => [m.id, m.contextWindow])).toEqual([['gemma-e4b-4k', 4096]]);
    });

    it('LM Studio without the v1 REST API: loaded_context_length from /api/v0/models', async () => {
        route({
            'http://localhost:1234/v1/models': { data: [{ id: 'loaded-one' }, { id: 'cold-one' }] },
            'http://localhost:1234/api/v0/models': {
                data: [
                    { id: 'loaded-one', state: 'loaded', max_context_length: 131072, loaded_context_length: 4096 },
                    { id: 'cold-one', state: 'not-loaded', max_context_length: 131072 },
                ],
            },
        });
        const models = await createOpenAICompatProvider(presets.LMSTUDIO).fetchModels!({});
        expect(models.map(m => [m.id, m.contextWindow])).toEqual([['loaded-one', 4096], ['cold-one', undefined]]);
    });

    it('Ollama: /api/ps context_length of the loaded runner, matched with or without :latest', async () => {
        route({
            'http://localhost:11434/v1/models': { data: [{ id: 'llama3.2:latest' }, { id: 'qwen3:8b' }, { id: 'idle:1b' }] },
            'http://localhost:11434/api/ps': {
                models: [
                    { name: 'llama3.2:latest', model: 'llama3.2:latest', context_length: 32768 },
                    { name: 'qwen3:8b', model: 'qwen3:8b', context_length: 4096 },
                ],
            },
        });
        const models = await createOpenAICompatProvider(presets.OLLAMA).fetchModels!({});
        expect(models.map(m => m.contextWindow)).toEqual([32768, 4096, undefined]);
    });

    it('llama.cpp: /props default_generation_settings.n_ctx, one value for the served model', async () => {
        route({
            'http://localhost:8080/v1/models': { data: [{ id: 'model.gguf' }] },
            'http://localhost:8080/props': { default_generation_settings: { n_ctx: 65536 } },
        });
        const models = await createOpenAICompatProvider(presets.LLAMACPP).fetchModels!({});
        expect(models[0]?.contextWindow).toBe(65536);
    });

    it('vLLM: max_model_len from /v1/models, with no extra request', async () => {
        route({ 'http://localhost:8000/v1/models': { data: [{ id: 'm', max_model_len: 32768 }] } });
        const models = await createOpenAICompatProvider(presets.VLLM).fetchModels!({});
        expect(models[0]?.contextWindow).toBe(32768);
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('a probe at the ORIGIN carries the same headers, and the endpoint override moves it', async () => {
        route({
            'http://192.168.1.10:1234/v1/models': { data: [{ id: 'm' }] },
            'http://192.168.1.10:1234/api/v1/models': { models: [{ key: 'm', loaded_instances: [{ config: { context_length: 2048 } }] }] },
        });
        const models = await createOpenAICompatProvider(presets.LMSTUDIO).fetchModels!({ endpoint: 'http://192.168.1.10:1234/v1', apiKey: 'tok' });
        expect(models[0]?.contextWindow).toBe(2048);
        const init = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit | undefined;
        expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    });

    it('a failing probe leaves the list intact, with one warn and no console.error', async () => {
        route({ 'http://localhost:1234/v1/models': { data: [{ id: 'a' }, { id: 'b' }] } });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const models = await createOpenAICompatProvider(presets.LMSTUDIO).fetchModels!({});
        expect(models.map(m => m.id)).toEqual(['a', 'b']);
        expect(models.every(m => m.contextWindow === undefined)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
    });

    it('a model declared in `models` with a contextWindow wins over what the server says', async () => {
        route({
            'http://localhost:11434/v1/models': { data: [{ id: 'm', context_length: 99999 }] },
            'http://localhost:11434/api/ps': { models: [{ name: 'm', context_length: 4096 }] },
        });
        const provider = createOpenAICompatProvider({
            ...presets.OLLAMA,
            models: [{ id: 'm', name: 'M', contextWindow: 16000, capabilities: ['streaming'] }],
        });
        expect((await provider.fetchModels!({}))[0]?.contextWindow).toBe(16000);
    });

    it('the new presets are local, keyless, and carry their server', () => {
        for (const [preset, server, baseURL] of [
            [presets.LLAMACPP, 'llamacpp', 'http://localhost:8080/v1'],
            [presets.VLLM, 'vllm', 'http://localhost:8000/v1'],
            [presets.LMSTUDIO, 'lmstudio', 'http://localhost:1234/v1'],
            [presets.OLLAMA, 'ollama', 'http://localhost:11434/v1'],
        ] as const) {
            expect(preset.server).toBe(server);
            expect(preset.baseURL).toBe(baseURL);
            expect(preset.isLocal).toBe(true);
        }
        expect(presets.LLAMACPP.name).toBe('llama.cpp');
        expect(presets.VLLM.name).toBe('vLLM');
    });
});
