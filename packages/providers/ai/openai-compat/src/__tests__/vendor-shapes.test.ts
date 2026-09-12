/**
 * What a NON-CONFORMANT compat server sends, and what this package must still make
 * of it. Absorbing that is the package's stated job — one parser behind OpenAI,
 * Mistral, OpenRouter, Z.ai, LM Studio and Ollama — so the edges live in their own
 * suite rather than among the happy paths.
 *
 * The shapes covered here:
 *  - `tool_calls[].index` omitted (it is a streaming convenience, not part of the
 *    function-call payload) — every call used to collapse onto slot 0;
 *  - `tool_calls[].id` omitted — every call used to come out with `id: ''`, which
 *    downstream keys a transcript row and a history slot, and a minted `call_1`
 *    used to collide with the id an OpenAI-shaped server gives its own first call;
 *  - one call addressed by `index` in one delta and by `id` in the next — it used
 *    to be split in two, the second half nameless;
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
        // (a `tool` message with `toolCallId: ''`): two such calls shared one row, so
        // the second call's result was written onto the first call's line.
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

describe('a vendor that addresses one call by index in one delta and by id in the next', () => {
    it('keeps the two addressings on one call rather than opening a second, nameless one', async () => {
        // Each delta carried a key the parser understood, but not the SAME key: the
        // first was filed under its `index`, the second under its `id`, so the
        // arguments landed on a second entry whose name never arrived — the turn ran
        // the tool on `{}` and then had a nameless call it could not answer.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_weather', arguments: '' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c1', function: { arguments: '{"city":"Lille"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'get_weather', input: { city: 'Lille' } },
        ]);
    });

    it('does the same when the opening delta carries only the id and the next only the index', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c1', function: { name: 'get_weather', arguments: '' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Lille"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'get_weather', input: { city: 'Lille' } },
        ]);
    });

    it('does the same when the opening delta carries only the index and the next only the id', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'get_weather', arguments: '' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c1', function: { arguments: '{"city":"Lille"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        expect(toolUses(events)).toEqual([
            { type: 'tool_use', id: 'c1', name: 'get_weather', input: { city: 'Lille' } },
        ]);
    });

    it('still opens a second call when a differently addressed delta names one', async () => {
        // The rule that keeps the two addressings together is "a nameless delta
        // continues the call before it" — so a delta that DOES carry a name must
        // still open its own call, whatever address it uses.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search', arguments: '{"q":"x"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'c2', function: { name: 'lookup', arguments: '{"q":"y"}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        const calls = toolUses(events);
        expect(calls.map(c => c.name)).toEqual(['search', 'lookup']);
        expect(calls.map(c => c.input)).toEqual([{ q: 'x' }, { q: 'y' }]);
    });

    it('a minted id cannot collide with an id the vendor issues in the same turn', async () => {
        // The mint used to read `call_1`, which is exactly what an OpenAI-shaped
        // server calls its own first call: a turn with one id-less call and one real
        // `call_1` produced two calls wearing one id.
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'a', arguments: '{}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_1', function: { name: 'b', arguments: '{}' } }] } }] }),
            JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
            '[DONE]',
        )));
        const calls = toolUses(events);
        expect(calls.map(c => c.name)).toEqual(['a', 'b']);
        expect(calls[0]!.id).not.toBe(calls[1]!.id);
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
