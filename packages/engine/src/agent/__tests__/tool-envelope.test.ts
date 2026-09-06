/**
 * One assistant message per turn, declaring every call whose `tool` message follows it.
 *
 * The P0 of the 2026-08-28 audit: `create_artifact` and another tool in the same turn
 * produced a history where the second tool's result had no call declaring it. The fast
 * path pushed a fresh `[create_artifact]` envelope of its own, and the id scan that
 * decided whether the turn's envelope was already pushed found the artifact's id in it
 * — "already pushed" — so the second tool's result went out orphaned, which an
 * Anthropic-shaped API rejects outright. The envelope is now held by reference and
 * pushed once; this suite asserts the shape of the history the transport actually
 * receives.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run.js';
import type { StreamChatEvent, StreamChatRequest, StreamAgentMessage } from '../stream-events.js';

async function* stream(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

/** The assistant messages that carry calls — the turn's envelopes. */
const envelopesOf = (messages: StreamAgentMessage[]): StreamAgentMessage[] =>
    messages.filter((m) => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0);

/** Every `tool` message must answer a call declared by a PRECEDING assistant message, exactly once. */
function assertWellFormed(messages: StreamAgentMessage[]): void {
    const declared = new Map<string, number>();
    for (const m of messages) {
        if (m.role === 'assistant') {
            for (const call of m.toolCalls ?? []) declared.set(call.id, (declared.get(call.id) ?? 0) + 1);
        }
        if (m.role === 'tool') {
            expect(declared.get(m.toolCallId!), `the tool message ${m.toolCallId} must be declared before it`).toBe(1);
        }
    }
    for (const [id, times] of declared) expect(times, `call ${id} declared once`).toBe(1);
    // The converse, which this used to leave unchecked: every declared call gets exactly
    // one result — an assistant message declaring a call that never gets a `tool` message
    // is the shape a call halted before its result (no handler, turn limit, abort) used
    // to leave.
    const results = new Map<string, number>();
    for (const m of messages) {
        if (m.role === 'tool' && m.toolCallId) results.set(m.toolCallId, (results.get(m.toolCallId) ?? 0) + 1);
    }
    for (const id of declared.keys()) expect(results.get(id), `declared call ${id} has exactly one tool message`).toBe(1);
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

describe('the turn\'s assistant envelope', () => {
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
        const envelopes = envelopesOf(history);
        expect(envelopes).toHaveLength(1);
        expect(envelopes[0]!.toolCalls!.map((c) => c.id)).toEqual(['c-search', 'c-save']);
        expect(envelopes[0]!.content, 'what it said before the calls is its own content').toBe('Searching, then saving.');
        expect(history.filter((m) => m.role === 'tool').map((m) => m.toolCallId)).toEqual(['c-search', 'c-save']);
        expect(history.filter((m) => m.role === 'tool').map((m) => m.toolName)).toEqual(['search', 'save']);
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
        expect(envelopesOf(history)).toHaveLength(1);
        expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool']);
    });

    it('a second tool turn gets its own envelope — one per turn, never shared across turns', async () => {
        const { requests } = await run([
            [{ type: 'tool_use', id: 't1', name: 'search', input: {} }, { type: 'done' }],
            [{ type: 'tool_use', id: 't2', name: 'save', input: {} }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        const history = requests[2]!.messages;
        assertWellFormed(history);
        expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool']);
    });

    /** Drive a run and collect what `onHistoryAppend` was told, in order. */
    async function notifications(turns: StreamChatEvent[][]): Promise<StreamAgentMessage[]> {
        const seen: StreamAgentMessage[] = [];
        let turn = 0;
        await runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'go' }] },
            transportCall: async () => stream(turns[turn++] ?? [{ type: 'done' }]),
            toolLookup: (name) => (name === 'save' || name === 'search' ? async () => ({ content: 'ok' }) : undefined),
            onHistoryAppend: (m) => seen.push(m),
            emitter: () => {},
            signal: new AbortController().signal,
        });
        return seen;
    }

    it('reports the envelope once through onHistoryAppend, and the object keeps accreting the turn\'s calls', async () => {
        const seen = await notifications([
            [
                { type: 'tool_use', id: 'c-search', name: 'search', input: { q: 'x' } },
                { type: 'tool_use', id: 'c-save', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        const envelopes = envelopesOf(seen);
        expect(envelopes).toHaveLength(1);
        // Reported when the first call completed, with one call — and the same object
        // holds both by the end: a host keeps the reference, not a copy.
        expect(envelopes[0]!.toolCalls!.map((c) => c.id)).toEqual(['c-search', 'c-save']);
        expect(seen.map((m) => m.role)).toEqual(['assistant', 'tool', 'tool']);
    });

    it('the held reference carries the sentence streamed AFTER the envelope opened', async () => {
        // The same reason `toolCalls` is held by reference, now on the field a host
        // serialises: `content` is finalised at the turn's end, so a host that took a
        // snapshot at notification time loses what the assistant said.
        const seen = await notifications([
            [
                { type: 'tool_use', id: 'c-search', name: 'search', input: { q: 'x' } },
                { type: 'text', delta: 'One moment.' },
                { type: 'tool_use', id: 'c-save', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        expect(envelopesOf(seen)[0]!.content).toBe('One moment.');
    });

    it('every tool message it reports names the tool that ran', async () => {
        const seen = await notifications([
            [
                { type: 'tool_use', id: 'c-search', name: 'search', input: { q: 'x' } },
                { type: 'tool_use', id: 'c-save', name: 'save', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        expect(seen.filter((m) => m.role === 'tool').map((m) => m.toolName)).toEqual(['search', 'save']);
    });

    it('a turn that said nothing before its call reports an empty content, not an absent one', async () => {
        // `content` is required on the message, and a host that writes bytes at receipt
        // has to be handed a string rather than an `undefined` it must guess about.
        const seen = await notifications([
            [{ type: 'tool_use', id: 'c-search', name: 'search', input: {} }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        expect(envelopesOf(seen)[0]!.content).toBe('');
    });
});
