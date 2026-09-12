import { describe, it, expect, vi } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { AparteChatMessage, AparteStreamEvent } from '@aparte/core';
import { createAiSdkProvider, toModelMessages, toToolChoice, fullStreamToAparteEvents } from '../index';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** V3-spec usage for the mock's finish chunk (nested shape). */
const V3_USAGE = {
    inputTokens: { total: 5, noCache: 5, cacheRead: 3, cacheWrite: undefined },
    outputTokens: { total: 2, text: 2, reasoning: undefined },
} as const;

/**
 * The stream-part type the mock model expects, read off its own `doStream`
 * signature. Deriving it from `simulateReadableStream`'s parameter instead gave
 * `unknown` (its chunk type is a free generic), which silently produced a
 * `ReadableStream<unknown>` the mock doesn't accept.
 */
type V3Chunk = MockLanguageModelV3['doStream'] extends
    (...args: never[]) => PromiseLike<{ stream: ReadableStream<infer C> }> ? C : never;

/** A mock LanguageModel replaying the given V3 spec stream parts. */
function mockModel(chunks: unknown[], opts: { delayInMs?: number } = {}) {
    return new MockLanguageModelV3({
        doStream: {
            stream: simulateReadableStream<V3Chunk>({
                chunks: chunks as V3Chunk[],
                chunkDelayInMs: opts.delayInMs ?? 0,
            }),
        },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

const TEXT_TURN = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'Hel' },
    { type: 'text-delta', id: 't1', delta: 'lo' },
    { type: 'text-end', id: 't1' },
    { type: 'finish', usage: V3_USAGE, finishReason: 'stop' },
];

function makeProvider(model: MockLanguageModelV3, over: Record<string, unknown> = {}) {
    return createAiSdkProvider({
        id: 'mockvendor',
        name: 'Mock Vendor',
        models: [{ id: 'm-1', name: 'Model One' }],
        languageModel: () => model,
        ...over,
    });
}

const REQ = { modelId: 'm-1', messages: [{ role: 'user' as const, content: 'hi' }], stream: true };

// ─── metadata / models ───────────────────────────────────────────────────────

describe('createAiSdkProvider — surface', () => {
    it('exposes metadata and the consumer-supplied model list', () => {
        const p = makeProvider(mockModel(TEXT_TURN));
        expect(p.getMetadata().name).toBe('Mock Vendor');
        expect(p.getModels()).toEqual([{ id: 'm-1', name: 'Model One' }]);
        // No format-adapter surface: the bridge owns its I/O via the SDK.
        expect(p.buildRequest).toBeUndefined();
        expect(typeof p.chat).toBe('function');
    });

    it('resolves the model through the languageModel factory (modelId + auth forwarded)', async () => {
        const factory = vi.fn(() => mockModel(TEXT_TURN));
        const p = createAiSdkProvider({ id: 'x', languageModel: factory });
        await collect(await p.chat!(REQ, 'sk-key') as ReadableStream<AparteStreamEvent>);
        expect(factory).toHaveBeenCalledWith('m-1', 'sk-key');
    });
});

// ─── stream mapping (gate ①) ─────────────────────────────────────────────────

describe('stream mapping — fullStream → AparteStreamEvent', () => {
    it('maps text deltas then done{usage} (flat usage from the SDK finish part)', async () => {
        const p = makeProvider(mockModel(TEXT_TURN));
        const events = await collect(await p.chat!(REQ) as ReadableStream<AparteStreamEvent>);
        expect(events.slice(0, 2)).toEqual([
            { type: 'text', delta: 'Hel' },
            { type: 'text', delta: 'lo' },
        ]);
        const done = events.at(-1) as { type: 'done'; usage?: { inputTokens: number; outputTokens: number; totalTokens?: number; cacheReadTokens?: number } };
        expect(done.type).toBe('done');
        expect(done.usage?.inputTokens).toBe(5);
        expect(done.usage?.outputTokens).toBe(2);
        expect(done.usage?.cacheReadTokens).toBe(3);
    });

    it('maps reasoning deltas to thinking events', async () => {
        const p = makeProvider(mockModel([
            { type: 'stream-start', warnings: [] },
            { type: 'reasoning-start', id: 'r1' },
            { type: 'reasoning-delta', id: 'r1', delta: 'thinking hard' },
            { type: 'reasoning-end', id: 'r1' },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Answer' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', usage: V3_USAGE, finishReason: 'stop' },
        ]));
        const events = await collect(await p.chat!(REQ) as ReadableStream<AparteStreamEvent>);
        expect(events[0]).toEqual({ type: 'thinking', delta: 'thinking hard' });
        expect(events[1]).toEqual({ type: 'text', delta: 'Answer' });
    });

    it('maps a tool call to tool_use with PARSED input (spec-level input is a JSON string)', async () => {
        const p = makeProvider(mockModel([
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: '{"q":"x"}' },
            { type: 'finish', usage: V3_USAGE, finishReason: 'tool-calls' },
        ]));
        const events = await collect(await p.chat!({
            ...REQ,
            tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
        }) as ReadableStream<AparteStreamEvent>);
        expect(events[0]).toEqual({ type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } });
        expect(events.at(-1)?.type).toBe('done');
    });

    it('maps an error part to an error event', async () => {
        const events = await collect(fullStreamToAparteEvents((async function* () {
            yield { type: 'error', error: new Error('boom') };
        })()));
        expect(events).toEqual([{ type: 'error', message: 'boom' }]);
    });
});

// ─── abort (gate ④, unit level) ──────────────────────────────────────────────

describe('abort propagation', () => {
    it('forwards ctx.signal into the SDK call (reaches the model)', async () => {
        const model = mockModel(TEXT_TURN);
        const p = makeProvider(model);
        const controller = new AbortController();
        await collect(await p.chat!(REQ, undefined, { providerId: 'mockvendor', signal: controller.signal }) as ReadableStream<AparteStreamEvent>);
        expect(model.doStreamCalls[0]?.abortSignal).toBe(controller.signal);
    });

    it('ends quietly (no error event) when aborted mid-stream', async () => {
        const model = mockModel(TEXT_TURN, { delayInMs: 5 });
        const p = makeProvider(model);
        const controller = new AbortController();
        const stream = await p.chat!(REQ, undefined, { providerId: 'mockvendor', signal: controller.signal }) as ReadableStream<AparteStreamEvent>;
        const reader = stream.getReader();
        const first = await reader.read();               // consume one event…
        controller.abort();                              // …then stop mid-stream
        const rest: AparteStreamEvent[] = [];
        for (;;) { const { done, value } = await reader.read(); if (done) break; rest.push(value); }
        expect(first.value?.type).toBe('text');
        expect(rest.every(e => e.type !== 'error')).toBe(true);
    });
});

// ─── second-vendor hardening (anthropic-shaped streams) ──────────────────────
// Anthropic's provider streams differently from OpenAI-family ones: multiple
// reasoning blocks carrying providerMetadata (signatures / redacted data),
// progressive tool-input-start/delta parts BEFORE the final tool-call, and
// text resuming after a tool call. The bridge must stay vendor-agnostic.

describe('anthropic-shaped streams', () => {
    it('concatenates multiple signed reasoning blocks as thinking deltas', async () => {
        const p = makeProvider(mockModel([
            { type: 'stream-start', warnings: [] },
            { type: 'reasoning-start', id: 'r1' },
            { type: 'reasoning-delta', id: 'r1', delta: 'step one. ' },
            { type: 'reasoning-delta', id: 'r1', delta: 'step two.' },
            { type: 'reasoning-end', id: 'r1', providerMetadata: { anthropic: { signature: 'sig-abc' } } },
            { type: 'reasoning-start', id: 'r2', providerMetadata: { anthropic: { redactedData: 'opaque' } } },
            { type: 'reasoning-delta', id: 'r2', delta: 'more.' },
            { type: 'reasoning-end', id: 'r2' },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Done.' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', usage: V3_USAGE, finishReason: 'stop' },
        ]));
        const events = await collect(await p.chat!(REQ) as ReadableStream<AparteStreamEvent>);
        expect(events.map(e => e.type)).toEqual(['thinking', 'thinking', 'thinking', 'text', 'done']);
        expect(events.slice(0, 3).map(e => (e as { delta: string }).delta).join('')).toBe('step one. step two.more.');
    });

    it('drops progressive tool-input deltas and emits ONE parsed tool_use (anthropic input streaming)', async () => {
        const p = makeProvider(mockModel([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Let me search.' },
            { type: 'text-end', id: 't1' },
            { type: 'tool-input-start', id: 'c1', toolName: 'search' },
            { type: 'tool-input-delta', id: 'c1', delta: '{"q":' },
            { type: 'tool-input-delta', id: 'c1', delta: '"x"}' },
            { type: 'tool-input-end', id: 'c1' },
            { type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: '{"q":"x"}' },
            { type: 'finish', usage: V3_USAGE, finishReason: 'tool-calls' },
        ]));
        const events = await collect(await p.chat!({
            ...REQ,
            tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
        }) as ReadableStream<AparteStreamEvent>);
        // Exactly one tool_use — the input deltas were dropped, not duplicated.
        expect(events.filter(e => e.type === 'tool_use')).toEqual([
            { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
        ]);
        expect(events[0]).toEqual({ type: 'text', delta: 'Let me search.' });
    });
});

// ─── request shaping ─────────────────────────────────────────────────────────

describe('request shaping', () => {
    it('non-streaming request resolves to the plain text', async () => {
        const p = makeProvider(mockModel(TEXT_TURN));
        const out = await p.chat!({ ...REQ, stream: false });
        expect(out).toBe('Hello');
    });

    it('declares tools and forwards toolChoice {name} as a forced tool choice', async () => {
        const model = mockModel([
            { type: 'stream-start', warnings: [] },
            { type: 'finish', usage: V3_USAGE, finishReason: 'stop' },
        ]);
        const p = makeProvider(model);
        await collect(await p.chat!({
            ...REQ,
            tools: [{ name: 'save', description: 'Save', inputSchema: { type: 'object' } }],
            toolChoice: { name: 'save' },
        }) as ReadableStream<AparteStreamEvent>);
        const call = model.doStreamCalls[0]!;
        expect(call.toolChoice).toEqual({ type: 'tool', toolName: 'save' });
        expect(call.tools?.map(t => t.name)).toEqual(['save']);
    });

    it('toToolChoice maps auto/none/{name} and never sees the synthetic form', () => {
        expect(toToolChoice('auto')).toBe('auto');
        expect(toToolChoice('none')).toBe('none');
        expect(toToolChoice({ name: 'x' })).toEqual({ type: 'tool', toolName: 'x' });
        expect(toToolChoice(undefined)).toBeUndefined();
    });
});

// ─── message mapping ─────────────────────────────────────────────────────────

describe('toModelMessages', () => {
    it('maps system / user / assistant plainly', () => {
        expect(toModelMessages([
            { role: 'system', content: 'be nice' },
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ])).toEqual([
            { role: 'system', content: 'be nice' },
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ]);
    });

    it('keeps multimodal user parts (text + image)', () => {
        const out = toModelMessages([
            { role: 'user', content: [{ type: 'text', text: 'what is this' }, { type: 'image', image: 'data:image/png;base64,AAA' }] },
        ]);
        expect(out[0]).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: 'what is this' },
                { type: 'image', image: 'data:image/png;base64,AAA' },
            ],
        });
    });

    it('converts an assistant turn carrying calls and the tool message answering it', () => {
        const out = toModelMessages([
            { role: 'user', content: 'go' },
            { role: 'assistant', content: 'Let me check.', toolCalls: [{ id: 'c1', name: 'search', input: { q: 'x' } }] },
            { role: 'tool', content: 'RESULT', toolCallId: 'c1', toolName: 'search' },
        ]);
        expect(out[1]).toEqual({
            role: 'assistant',
            content: [
                { type: 'text', text: 'Let me check.' },
                { type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: { q: 'x' } },
            ],
        });
        expect(out[2]).toEqual({
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'search', output: { type: 'text', value: 'RESULT' } }],
        });
    });

    it('takes the tool name off the message when no assistant turn declares the call', () => {
        // A hand-built history — a `history:` function, a prefix-cache host replaying
        // its own log — has no envelope to scan, and the name used to become 'unknown'.
        const out = toModelMessages([
            { role: 'user', content: 'go' },
            { role: 'tool', content: 'RESULT', toolCallId: 'c1', toolName: 'search' },
        ]);
        expect(out[1]).toEqual({
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'search', output: { type: 'text', value: 'RESULT' } }],
        });
    });

    it('still recovers the tool name from the declaring assistant turn when the message omits it', () => {
        const out = toModelMessages([
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search', input: {} }] },
            { role: 'tool', content: 'RESULT', toolCallId: 'c1' },
        ]);
        expect((out[1] as { content: Array<{ toolName: string }> }).content[0]!.toolName).toBe('search');
    });

    // The type forbids these roles, so a message wearing one is code compiled against an
    // older aparté reaching a newer bridge — the one case a type cannot catch. Here it is
    // the loudest: an unrecognised role used to fall through and be sent as a user turn.
    describe('a message still carrying a legacy tool role', () => {
        it('warns once per role and maps nothing for it', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const legacy = (role: string): AparteChatMessage =>
                ({ role, content: 'x', toolCallId: 'c1' } as unknown as AparteChatMessage);

            const out = toModelMessages([{ role: 'user', content: 'hi' }, legacy('tool_call'), legacy('tool_call')]);
            expect(out, 'an unmapped role used to reach the model as something the user said')
                .toEqual([{ role: 'user', content: 'hi' }]);
            expect(warn, 'once per role, not once per message').toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0]?.[0]);
            expect(message, 'the warning names the shape to move to').toContain("role: 'assistant'");
            expect(message).toContain('toolCalls');
            expect(message).toContain("role: 'tool'");
            expect(message).toContain('toolCallId');
            expect(message, 'and says when it goes away').toContain('0.18');

            expect(toModelMessages([legacy('tool_result')]), 'the other legacy role is skipped too').toEqual([]);
            expect(warn, 'and is announced under its own key').toHaveBeenCalledTimes(2);
            warn.mockRestore();
        });
    });

    // The paired case: the same history, mapped for an OpenAI-compatible endpoint,
    // sends null rather than ''. Both suites carry this describe under this title.
    describe('an assistant turn that said nothing before its calls', () => {
        it('emits no empty text part, only the tool-call parts', () => {
            const out = toModelMessages([
                { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search', input: {} }] },
            ]);
            expect(out[0]).toEqual({
                role: 'assistant',
                content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: {} }],
            });
        });
    });
});
