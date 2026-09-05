/**
 * What a NON-CONFORMANT compat server sends, and what this package must still make
 * of it. Absorbing that is the package's stated job — one parser behind OpenAI,
 * Mistral, OpenRouter, Z.ai, LM Studio and Ollama — so the edges live in their own
 * suite rather than among the happy paths.
 *
 * Three shapes, all from the 2026-09-05 audit:
 *  - `tool_calls[].index` omitted (it is a streaming convenience, not part of the
 *    function-call payload) — every call used to collapse onto slot 0;
 *  - `tool_calls[].id` omitted — every call used to come out with `id: ''`, which
 *    downstream keys a transcript row and a history slot;
 *  - a forced `tool_choice`, which used to be overwritten with `'auto'`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AparteStreamEvent, AparteChatRequest } from '@aparte/core';
import { createOpenAICompatProvider, parseOpenAICompatStream } from '../index';

function sse(...lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.map(l => `data: ${l}\n`).join('');
    return new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (; ;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

type ToolUse = Extract<AparteStreamEvent, { type: 'tool_use' }>;
const toolUses = (events: AparteStreamEvent[]): ToolUse[] => events.filter((e): e is ToolUse => e.type === 'tool_use');

const provider = createOpenAICompatProvider({ id: 'compat', baseURL: 'https://vendor.example/v1' });

describe('a vendor that omits tool_calls[].index', () => {
    it('two complete calls in one array stay two calls, with their own arguments', async () => {
        // Keyed on `Number(tc.index ?? 0)`, both landed on slot 0: the second id and
        // name overwrote the first, the two argument strings concatenated into
        // non-JSON, and the turn ran ONE tool on `{}` — a silent wrong answer to the
        // model whose only trace read as the model's fault.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({
                choices: [{
                    delta: {
                        tool_calls: [
                            { id: 'c1', function: { name: 'get_weather', arguments: '{"city":"Lille"}' } },
                            { id: 'c2', function: { name: 'get_time', arguments: '{"tz":"UTC"}' } },
                        ],
                    },
                }],
            }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'get_weather', input: { city: 'Lille' } },
            { type: 'tool_use', id: 'c2', name: 'get_time', input: { tz: 'UTC' } },
        ]);
    });

    it('one call per chunk stays one call per chunk', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c1', function: { name: 'a', arguments: '{"x":1}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c2', function: { name: 'b', arguments: '{"y":2}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'a', input: { x: 1 } },
            { type: 'tool_use', id: 'c2', name: 'b', input: { y: 2 } },
        ]);
    });

    it('a bare argument fragment continues the call before it (no index, no id, no name)', async () => {
        // The other half of the same rule: with nothing to key on, a chunk carrying no
        // function NAME is a continuation — in this format a name appears only on a
        // call's first delta. Splitting those into two calls would break the vendors
        // the index-keyed map used to serve by accident.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c1', function: { name: 'search', arguments: '{"q":' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ function: { arguments: '"x"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
        ]);
    });
});

describe('a vendor that omits tool_calls[].id', () => {
    it('mints an id rather than emitting id: ""', async () => {
        // `id: ''` keys the transcript row (`tool-${id}`) and the history slot
        // (`tool_result { toolCallId: '' }`): two such calls shared one row, so the
        // second call's result was written onto the first call's line.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({
                choices: [{
                    delta: {
                        tool_calls: [
                            { index: 0, function: { name: 'search', arguments: '{"q":"x"}' } },
                            { index: 1, function: { name: 'lookup', arguments: '{"q":"y"}' } },
                        ],
                    },
                }],
            }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        const calls = toolUses(events);
        expect(calls.map(c => c.name)).toEqual(['search', 'lookup']);
        for (const call of calls) expect(call.id).toBeTruthy();
        expect(calls[0]!.id).not.toBe(calls[1]!.id);
    });

    it('the vendor\'s own id still wins when it arrives in a later chunk', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search', arguments: '{"q":' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'real-id', function: { arguments: '"x"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'real-id', name: 'search', input: { q: 'x' } },
        ]);
    });
});

describe('buildRequest — tool_choice', () => {
    const withTools = (over: Partial<AparteChatRequest> = {}): AparteChatRequest => ({
        modelId: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 't', description: 'd', inputSchema: { type: 'object', properties: {} } }],
        ...over,
    });

    it('forwards a forced tool as the wire format spells it', () => {
        const body = provider.buildRequest(withTools({ toolChoice: { name: 't' } })).body as Record<string, unknown>;
        expect(body['tool_choice']).toEqual({ type: 'function', function: { name: 't' } });
    });

    it('still defaults to auto when nothing is forced', () => {
        expect((provider.buildRequest(withTools()).body as Record<string, unknown>)['tool_choice']).toBe('auto');
        expect((provider.buildRequest(withTools({ toolChoice: 'auto' })).body as Record<string, unknown>)['tool_choice']).toBe('auto');
    });
});

describe('fetchModels — the endpoint travels with the key', () => {
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('lists models from the configured endpoint, not the vendor default', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'm' }] }), {
            status: 200, headers: { 'content-type': 'application/json' },
        }));
        await provider.fetchModels!({ apiKey: 'sk-proxy-key', endpoint: 'https://llm.internal.example/v1' });
        expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://llm.internal.example/v1/models');
    });
});
