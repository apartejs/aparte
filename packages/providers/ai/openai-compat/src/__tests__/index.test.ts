// Environment (jsdom) + `@aparte/core` source resolution are configured in
// vitest.config.ts: this suite drives the browser-direct `DirectTransport`, which
// core exposes only from its browser entry.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectTransport } from '@aparte/core';
import type { AparteStreamEvent } from '@aparte/core';
import { createOpenAICompatProvider, parseOpenAICompatStream, presets } from '../index';

// ─── helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function streamResponse(status = 200) {
    return new Response(new ReadableStream(), { status });
}

/** Encode SSE lines the way an OpenAI-compatible endpoint streams them. */
function sse(...lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.map(l => `data: ${l}\n`).join('');
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

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

// ─── presets: one parameterized suite replaces 4 near-identical package suites ─

const CLOUD_PRESETS = [
    ['OPENAI', presets.OPENAI, 'openai.com'],
    ['MISTRAL', presets.MISTRAL, 'mistral.ai'],
    ['ZAI', presets.ZAI, 'bigmodel.cn'],
    ['OPENROUTER', presets.OPENROUTER, 'openrouter.ai'],
] as const;

describe.each(CLOUD_PRESETS)('preset %s', (_label, preset, helpDomain) => {
    const provider = createOpenAICompatProvider(preset);

    it('exposes branded metadata with the shared config schema', () => {
        const meta = provider.getMetadata();
        expect(meta.id).toBe(preset.id);
        expect(meta.name).toBe(preset.name);
        expect(meta.color).toBeTruthy();
        expect(meta.helpUrl).toContain(helpDomain);
        const apiKeyField = meta.configSchema?.fields.find(f => f.id === 'apiKey');
        expect(apiKeyField?.type).toBe('password');
        expect(apiKeyField?.required).toBe(true);
    });

    it('getModels defaults to [] (models are consumer data)', () => {
        expect(provider.getModels()).toEqual([]);
    });

    it('fetchModels returns [] without a key (cloud) and never fetches', async () => {
        expect(await provider.fetchModels!({})).toEqual([]);
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('fetchModels maps the generic /models listing', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({
            data: [{ id: 'model-a', name: 'Model A', context_length: 32768 }, { id: 'model-b' }],
        }));
        const models = await provider.fetchModels!({ apiKey: 'sk-test' });
        expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${preset.baseURL}/models`);
        expect(models).toEqual([
            { id: 'model-a', name: 'Model A', contextWindow: 32768, capabilities: ['streaming'] },
            { id: 'model-b', name: 'model-b', contextWindow: undefined, capabilities: ['streaming'] },
        ]);
    });

    it('drives a streaming chat through DirectTransport with Bearer auth', async () => {
        vi.mocked(fetch).mockResolvedValue(streamResponse());
        const result = await new DirectTransport({ byok: true }).chat(
            provider,
            { modelId: 'm', messages: [{ role: 'user', content: 'Hello' }] },
            { apiKey: 'sk-test' },
            { providerId: preset.id },
        );
        expect(result).toBeInstanceOf(ReadableStream);
        const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${preset.baseURL}/chat/completions`);
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer sk-test');
        const body = JSON.parse(init.body as string);
        expect(body.stream).toBe(true);
        expect(body.stream_options).toEqual({ include_usage: true });
    });
});

// ─── local presets (LM Studio, Ollama /v1) ───────────────────────────────────

const LOCAL_PRESETS = [
    ['LMSTUDIO', presets.LMSTUDIO, 'http://localhost:1234/v1'],
    ['OLLAMA', presets.OLLAMA, 'http://localhost:11434/v1'],
] as const;

describe.each(LOCAL_PRESETS)('local preset %s', (_label, preset, baseURL) => {
    const provider = createOpenAICompatProvider(preset);

    it('is flagged local with the endpoint-first config schema (key optional)', () => {
        const meta = provider.getMetadata();
        expect(meta.isLocal).toBe(true);
        const fields = meta.configSchema?.fields ?? [];
        expect(fields.find(f => f.id === 'endpoint')?.required).toBe(true);
        expect(fields.find(f => f.id === 'apiKey')?.required).toBeUndefined();
    });

    it('targets the OpenAI-compat /v1 endpoint', () => {
        expect(provider.defaultEndpoint).toBe(baseURL);
    });

    it('fetchModels works KEYLESS against /models (local server)', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [{ id: 'llama3.2' }] }));
        const models = await provider.fetchModels!({});
        expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`${baseURL}/models`);
        const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit | undefined;
        expect((init?.headers as Record<string, string> | undefined)?.['Authorization']).toBeUndefined();
        expect(models[0]).toMatchObject({ id: 'llama3.2' });
    });

    it('honours an endpoint override from settings', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [] }));
        await provider.fetchModels!({ endpoint: 'http://192.168.1.10:1234/v1' });
        expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://192.168.1.10:1234/v1/models');
    });
});

// ─── factory behaviour (no preset needed) ────────────────────────────────────

describe('createOpenAICompatProvider — factory', () => {
    it('works for any compat endpoint with just id + baseURL (e.g. groq)', () => {
        const p = createOpenAICompatProvider({ id: 'groq', baseURL: 'https://api.groq.com/openai/v1' });
        expect(p.getMetadata().name).toBe('groq');
        expect(p.defaultEndpoint).toBe('https://api.groq.com/openai/v1');
    });

    it('serves a static consumer-supplied model list', () => {
        const models = [{ id: 'llama-3.3-70b', name: 'Llama 3.3 70B' }];
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1', models });
        expect(p.getModels()).toEqual(models);
    });

    it('normalizes user-pasted "Bearer xxx" keys without double-prefixing', () => {
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        expect(p.authHeaders!('Bearer tok')).toEqual({ Authorization: 'Bearer tok' });
        expect(p.authHeaders!('tok')).toEqual({ Authorization: 'Bearer tok' });
    });

    it('always includes max_tokens and seed when set (kills the lmstudio/zai drift bugs)', () => {
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        const { body } = p.buildRequest!({
            modelId: 'm',
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 512,
            seed: 42,
        }) as { body: Record<string, unknown> };
        expect(body['max_tokens']).toBe(512);
        expect(body['seed']).toBe(42);
    });

    it('declares tools with tool_choice auto', () => {
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        const { body } = p.buildRequest!({
            modelId: 'm',
            messages: [{ role: 'user', content: 'hi' }],
            tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
        }) as { body: Record<string, unknown> };
        expect(body['tools']).toHaveLength(1);
        expect(body['tool_choice']).toBe('auto');
    });

    it('carries extraHeaders on buildRequest AND on fetchModels (openrouter attribution)', async () => {
        const p = createOpenAICompatProvider({
            id: 'x', baseURL: 'https://x.test/v1',
            extraHeaders: { 'X-Title': 'aparté' },
        });
        const built = p.buildRequest!({ modelId: 'm', messages: [{ role: 'user', content: 'hi' }] });
        expect(built.headers).toMatchObject({ 'X-Title': 'aparté' });

        vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: [] }));
        await p.fetchModels!({ apiKey: 'k' });
        const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
        expect(init.headers).toMatchObject({ 'X-Title': 'aparté', Authorization: 'Bearer k' });
    });

    it('converts the tool_call / tool_result envelope to the OpenAI wire shape', () => {
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        const { body } = p.buildRequest!({
            modelId: 'm',
            messages: [
                { role: 'user', content: 'hi' },
                { role: 'tool_call', content: '', precedingText: 'Let me check.', toolCalls: [{ id: 'c1', name: 'search', input: { q: 'x' } }] },
                { role: 'tool_result', content: 'RESULT', toolCallId: 'c1' },
            ],
        }) as { body: { messages: Array<Record<string, unknown>> } };
        expect(body.messages[1]).toEqual({
            role: 'assistant',
            content: 'Let me check.',
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } }],
        });
        expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'RESULT' });
    });

    it('parseText extracts the first choice message content', () => {
        const p = createOpenAICompatProvider({ id: 'x', baseURL: 'https://x.test/v1' });
        expect(p.parseText!({ choices: [{ message: { content: 'Hi!' } }] })).toBe('Hi!');
        expect(p.parseText!({})).toBe('');
    });
});

// ─── the ported SSE parser ───────────────────────────────────────────────────

describe('parseOpenAICompatStream', () => {
    it('streams text deltas then done{usage} on [DONE]', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
            JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
            '[DONE]',
        )));
        expect(events).toEqual([
            { type: 'text', delta: 'Hel' },
            { type: 'text', delta: 'lo' },
            { type: 'done', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, cacheReadTokens: undefined } },
        ]);
    });

    it('maps reasoning_content deltas to thinking events', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { reasoning_content: 'hmm' } }] }),
            JSON.stringify({ choices: [{ delta: { content: 'Answer' } }] }),
            '[DONE]',
        )));
        expect(events[0]).toEqual({ type: 'thinking', delta: 'hmm' });
        expect(events[1]).toEqual({ type: 'text', delta: 'Answer' });
    });

    it('accumulates split tool_calls and emits tool_use on finish_reason=tool_calls', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'search', arguments: '{"q":' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        )));
        expect(events).toEqual([
            { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
            { type: 'done', usage: undefined },
        ]);
    });

    it('emits done when the stream ends without [DONE]', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { content: 'x' } }] }),
        )));
        expect(events.at(-1)).toEqual({ type: 'done', usage: undefined });
    });
});
