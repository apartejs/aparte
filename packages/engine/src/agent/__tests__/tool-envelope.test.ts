/**
 * One envelope per turn, declaring every call whose result follows it.
 *
 * The P0 of the 2026-08-28 audit: `create_artifact` and another tool in the same turn
 * produced a history where the second tool's `tool_result` had no `tool_call`
 * declaring it. The fast path pushed a fresh `[create_artifact]` envelope of its own,
 * and the id scan that decided whether the turn's envelope was already pushed found
 * the artifact's id in it — "already pushed" — so the second tool's result went out
 * orphaned, which an Anthropic-shaped API rejects outright. The envelope is now held
 * by reference and pushed once; this suite asserts the shape of the history the
 * transport actually receives.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run.js';
import type { StreamChatEvent, StreamChatRequest, StreamAgentMessage } from '../stream-events.js';

async function* stream(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

/** Every tool_result must answer a call declared by a PRECEDING tool_call envelope, exactly once. */
function assertWellFormed(messages: StreamAgentMessage[]): void {
    const declared = new Map<string, number>();
    for (const m of messages) {
        if (m.role === 'tool_call') {
            for (const call of m.toolCalls ?? []) declared.set(call.id, (declared.get(call.id) ?? 0) + 1);
        }
        if (m.role === 'tool_result') {
            expect(declared.get(m.toolCallId!), `tool_result ${m.toolCallId} must be declared before it`).toBe(1);
        }
    }
    for (const [id, times] of declared) expect(times, `call ${id} declared once`).toBe(1);
    // The converse, which this used to leave unchecked: every declared call gets exactly
    // one result — a `tool_call` declaring a call that never gets a `tool_result` is the
    // shape a call halted before its result (no handler, turn limit, abort) used to leave.
    const results = new Map<string, number>();
    for (const m of messages) {
        if (m.role === 'tool_result' && m.toolCallId) results.set(m.toolCallId, (results.get(m.toolCallId) ?? 0) + 1);
    }
    for (const id of declared.keys()) expect(results.get(id), `declared call ${id} has exactly one tool_result`).toBe(1);
}

async function run(turns: StreamChatEvent[][]) {
    const requests: StreamChatRequest[] = [];
    let turn = 0;
    const usage = await runStreamAgent({
        messageId: 'a1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'go' }] },
        transportCall: async (request) => { requests.push(request); return stream(turns[turn++] ?? [{ type: 'done' }]); },
        toolLookup: (name) => (name === 'save' || name === 'search' ? async () => ({ content: `${name}:ok` }) : undefined),
        emitter: () => {},
        signal: new AbortController().signal,
    });
    return { requests, usage };
}

describe('the turn\'s tool_call envelope', () => {
    it('two tools in one turn after prose: one envelope declares both, both results follow it', async () => {
        // The vehicle used to be the built-in `create_artifact` beside a plain tool —
        // the fast path that orphaned the second result. The built-in is gone (D7:
        // an artifact is a plugin's tool like any other), and the invariant it broke
        // is the same for any two calls, so two plain tools carry the test now.
        const { requests } = await run([
            [
                { type: 'text', delta: 'Searching, then saving.' },
                { type: 'tool_use', id: 'c-search', name: 'search', input: { q: 'hi' } },
                { type: 'tool_use', id: 'c-save', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'text', delta: 'Done.' }, { type: 'done' }],
        ]);
        const history = requests[1]!.messages;
        assertWellFormed(history);
        const envelopes = history.filter((m) => m.role === 'tool_call');
        expect(envelopes).toHaveLength(1);
        expect(envelopes[0]!.toolCalls!.map((c) => c.id)).toEqual(['c-search', 'c-save']);
        expect(envelopes[0]!.precedingText).toBe('Searching, then saving.');
        expect(history.filter((m) => m.role === 'tool_result').map((m) => m.toolCallId)).toEqual(['c-search', 'c-save']);
    });

    it('two plain tools in one turn: still one envelope, in call order', async () => {
        const { requests } = await run([
            [
                { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
                { type: 'tool_use', id: 'c2', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        const history = requests[1]!.messages;
        assertWellFormed(history);
        expect(history.filter((m) => m.role === 'tool_call')).toHaveLength(1);
        expect(history.map((m) => m.role)).toEqual(['user', 'tool_call', 'tool_result', 'tool_result']);
    });

    it('a second tool turn gets its own envelope — one per turn, never shared across turns', async () => {
        const { requests } = await run([
            [{ type: 'tool_use', id: 't1', name: 'search', input: {} }, { type: 'done' }],
            [{ type: 'tool_use', id: 't2', name: 'save', input: {} }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        const history = requests[2]!.messages;
        assertWellFormed(history);
        expect(history.map((m) => m.role)).toEqual(['user', 'tool_call', 'tool_result', 'tool_call', 'tool_result']);
    });

    it('reports the envelope once through onHistoryAppend, and the object keeps accreting the turn\'s calls', async () => {
        const seen: StreamAgentMessage[] = [];
        let turn = 0;
        const turns: StreamChatEvent[][] = [
            [
                { type: 'tool_use', id: 'c-search', name: 'search', input: { q: 'x' } },
                { type: 'tool_use', id: 'c-save', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ];
        await runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'go' }] },
            transportCall: async () => stream(turns[turn++] ?? [{ type: 'done' }]),
            toolLookup: (name) => (name === 'save' || name === 'search' ? async () => ({ content: 'ok' }) : undefined),
            onHistoryAppend: (m) => seen.push(m),
            emitter: () => {},
            signal: new AbortController().signal,
        });
        const envelopes = seen.filter((m) => m.role === 'tool_call');
        expect(envelopes).toHaveLength(1);
        // Reported when the first call completed, with one call — and the same object
        // holds both by the end: a host keeps the reference, not a copy.
        expect(envelopes[0]!.toolCalls!.map((c) => c.id)).toEqual(['c-search', 'c-save']);
        expect(seen.map((m) => m.role)).toEqual(['tool_call', 'tool_result', 'tool_result']);
    });
});
