/**
 * A call the loop cannot finish itself is deferred, and the run resumes later.
 *
 * A server-side loop cannot wait on a person: the one who must approve a call may have
 * closed the tab. With `deferral`, a call the gate sends to a human — or a tool that runs
 * elsewhere, in the browser — is not awaited: the run reads the model's reply to its end,
 * declares every call of it, and ends on `run-suspended`. A later run whose history ends
 * on those calls, with their answers in `deferral.outcomes`, picks up where it stopped,
 * through the same `processCall` a streamed call takes.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run.js';
import type { StreamChatEvent, StreamRunEvent, StreamChatRequest, StreamAgentMessage, StreamToolCall } from '../stream-events.js';

/** A transport that answers each call with the next scripted stream. */
function scripted(...turns: StreamChatEvent[][]) {
    const requests: StreamChatRequest[] = [];
    const call = async (request: StreamChatRequest) => {
        requests.push(structuredClone(request));
        const events = turns.shift() ?? [{ type: 'text', delta: 'end' } as StreamChatEvent, { type: 'done' } as StreamChatEvent];
        return (async function* () { yield* events; })();
    };
    return { call, requests };
}

const user: StreamAgentMessage = { role: 'user', content: 'go' };

function run(opts: Partial<StreamRunOptions> & Pick<StreamRunOptions, 'transportCall'>) {
    const events: StreamRunEvent[] = [];
    const history: StreamAgentMessage[] = [];
    const done = runStreamAgent({
        messageId: 'm1',
        baseRequest: { messages: [user] } as StreamChatRequest,
        toolLookup: (name) => (name === 'read_file' || name === 'delete_file'
            ? async (c) => ({ toolCallId: c.id, content: `ran ${c.name}` })
            : undefined),
        toolConfigLookup: (name) => (name === 'delete_file' ? { needsApproval: true }
            : name === 'ask_user' ? { external: true } : {}),
        emitter: (e) => events.push(e),
        signal: new AbortController().signal,
        // The reference, not a snapshot: a turn's envelope is reported once and its later
        // calls join the same `toolCalls` array (the documented `onHistoryAppend` contract).
        onHistoryAppend: (m) => history.push(m),
        ...opts,
    });
    return { done, events, history };
}

const types = (events: StreamRunEvent[]) => events.map((e) => e.type);
const suspension = (events: StreamRunEvent[]) => events.at(-1) as Extract<StreamRunEvent, { type: 'run-suspended' }>;
const envelope = (calls: StreamToolCall[]): StreamAgentMessage =>
    ({ role: 'assistant', content: '', toolCalls: calls });

describe('deferral: the pause', () => {
    it('defers a call that needs approval instead of waiting for a resolver', async () => {
        const t = scripted([
            { type: 'text', delta: 'Deleting.' },
            { type: 'tool_use', id: 'c1', name: 'delete_file', input: { path: 'a' } },
            { type: 'done' },
        ] as StreamChatEvent[]);
        const { done, events, history } = run({ transportCall: t.call, deferral: {} });
        await done;
        expect(types(events)).toEqual([
            'run-start', 'turn-start', 'text-delta', 'tool-start', 'tool-awaiting-approval', 'text-flush', 'run-suspended',
        ]);
        expect(suspension(events).pending).toEqual([{ toolCallId: 'c1', name: 'delete_file', input: { path: 'a' }, reason: 'approval' }]);
        // The envelope declares the call; no `tool` answer follows it.
        expect(history).toEqual([{ role: 'assistant', content: 'Deleting.', toolCalls: [{ id: 'c1', name: 'delete_file', input: { path: 'a' } }] }]);
        expect(t.requests).toHaveLength(1);
    });

    it('defers an external tool: known to the model, run elsewhere', async () => {
        const t = scripted([{ type: 'tool_use', id: 'q1', name: 'ask_user', input: { question: 'Which?' } }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({ transportCall: t.call, deferral: {} });
        await done;
        expect(suspension(events).pending).toEqual([{ toolCallId: 'q1', name: 'ask_user', input: { question: 'Which?' }, reason: 'external' }]);
        expect(types(events)).not.toContain('tool-aborted');
    });

    it('runs the calls BEFORE the pause point and keeps the ones after it pending', async () => {
        const t = scripted([
            { type: 'tool_use', id: 'r1', name: 'read_file', input: { path: 'x' } },
            { type: 'tool_use', id: 'd1', name: 'delete_file', input: { path: 'x' } },
            { type: 'tool_use', id: 'r2', name: 'read_file', input: { path: 'y' } },
            { type: 'tool_use', id: 'd2', name: 'delete_file', input: { path: 'y' } },
            { type: 'done' },
        ] as StreamChatEvent[]);
        const { done, events, history } = run({ transportCall: t.call, deferral: {} });
        await done;
        expect(events.filter((e) => e.type === 'tool-resolved').map((e) => (e as { toolCallId: string }).toolCallId)).toEqual(['r1']);
        expect(suspension(events).pending.map((p) => [p.toolCallId, p.reason])).toEqual([
            ['d1', 'approval'], ['r2', 'queued'], ['d2', 'approval'],
        ]);
        // d2 is announced as waiting too: the client answers both in ONE round trip.
        expect(events.filter((e) => e.type === 'tool-awaiting-approval')).toHaveLength(2);
        expect(history).toEqual([
            { role: 'assistant', content: '', toolCalls: [
                { id: 'r1', name: 'read_file', input: { path: 'x' } },
                { id: 'd1', name: 'delete_file', input: { path: 'x' } },
                { id: 'r2', name: 'read_file', input: { path: 'y' } },
                { id: 'd2', name: 'delete_file', input: { path: 'y' } },
            ] },
            { role: 'tool', content: 'ran read_file', toolCallId: 'r1', toolName: 'read_file' },
        ]);
    });

    it('changes nothing without `deferral`: the resolver still answers in place', async () => {
        const t = scripted([{ type: 'tool_use', id: 'c1', name: 'delete_file', input: {} }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({ transportCall: t.call, approvalResolver: async () => ({ approved: true }) });
        await done;
        expect(types(events)).toContain('tool-approved');
        expect(types(events)).not.toContain('run-suspended');
        expect(events.at(-1)?.type).toBe('run-done');
    });

    it('does not defer a call the gate denies: it is refused, not put to anyone', async () => {
        const t = scripted(
            [{ type: 'tool_use', id: 'c1', name: 'delete_file', input: {} }, { type: 'done' }] as StreamChatEvent[],
            [{ type: 'text', delta: 'OK.' }, { type: 'done' }] as StreamChatEvent[],
        );
        const { done, events } = run({
            transportCall: t.call,
            deferral: {},
            toolConfigLookup: () => ({ needsApproval: () => 'deny' as const }),
            approvalResolver: async () => ({ approved: false, reason: 'Not allowed here.' }),
        });
        await done;
        expect(types(events)).not.toContain('run-suspended');
        expect(events.find((e) => e.type === 'tool-rejected')).toMatchObject({ reason: 'Not allowed here.' });
    });
});

describe('deferral: the resume', () => {
    it('runs an approved call first, then asks the model', async () => {
        const t = scripted([{ type: 'text', delta: 'Done.' }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({
            transportCall: t.call,
            baseRequest: { messages: [user, envelope([{ id: 'c1', name: 'delete_file', input: { path: 'a' } }])] } as StreamChatRequest,
            deferral: { outcomes: { c1: { kind: 'decision', approved: true } } },
        });
        await done;
        expect(types(events)).toEqual([
            'run-start', 'tool-approved', 'tool-resolved', 'turn-start', 'text-delta', 'text-flush', 'run-done',
        ]);
        // No `tool-start`: the row exists already, from the run that paused.
        expect(t.requests[0]!.messages.at(-1)).toEqual({ role: 'tool', content: 'ran delete_file', toolCallId: 'c1', toolName: 'delete_file' });
    });

    it('sends the refusal to the model', async () => {
        const t = scripted([{ type: 'text', delta: 'OK, not deleting.' }, { type: 'done' }] as StreamChatEvent[]);
        const { done } = run({
            transportCall: t.call,
            baseRequest: { messages: [user, envelope([{ id: 'c1', name: 'delete_file', input: {} }])] } as StreamChatRequest,
            deferral: { outcomes: { c1: { kind: 'decision', approved: false, reason: 'Not that one.' } } },
        });
        await done;
        expect(t.requests[0]!.messages.at(-1)).toMatchObject({ role: 'tool', content: 'Not that one.', toolCallId: 'c1' });
    });

    it('records an external result as the tool answer', async () => {
        const t = scripted([{ type: 'text', delta: 'Thanks.' }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({
            transportCall: t.call,
            baseRequest: { messages: [user, envelope([{ id: 'q1', name: 'ask_user', input: {} }])] } as StreamChatRequest,
            deferral: { outcomes: { q1: { kind: 'result', content: 'The blue one.' } } },
        });
        await done;
        expect(events.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'q1', result: 'The blue one.' });
        expect(t.requests[0]!.messages.at(-1)).toMatchObject({ role: 'tool', content: 'The blue one.', toolCallId: 'q1' });
    });

    it('fails the run on an external failure, like a crashing handler', async () => {
        const t = scripted();
        const { done, events } = run({
            transportCall: t.call,
            baseRequest: { messages: [user, envelope([{ id: 'q1', name: 'ask_user', input: {} }])] } as StreamChatRequest,
            deferral: { outcomes: { q1: { kind: 'failed', error: 'The page closed the question.' } } },
        });
        await expect(done).rejects.toThrow('The page closed the question.');
        expect(events.find((e) => e.type === 'tool-failed')).toMatchObject({ toolCallId: 'q1', error: 'The page closed the question.' });
    });

    it('answers every pending call of the envelope — approvals and queued ones — in one resume', async () => {
        const t = scripted([{ type: 'text', delta: 'All done.' }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({
            transportCall: t.call,
            baseRequest: { messages: [
                user,
                envelope([
                    { id: 'r1', name: 'read_file', input: { path: 'x' } },
                    { id: 'd1', name: 'delete_file', input: { path: 'x' } },
                    { id: 'r2', name: 'read_file', input: { path: 'y' } },
                    { id: 'd2', name: 'delete_file', input: { path: 'y' } },
                ]),
                { role: 'tool', content: 'ran read_file', toolCallId: 'r1', toolName: 'read_file' },
            ] } as StreamChatRequest,
            deferral: { outcomes: {
                d1: { kind: 'decision', approved: true },
                d2: { kind: 'decision', approved: false },
            } },
        });
        await done;
        expect(t.requests).toHaveLength(1);
        const answered = t.requests[0]!.messages.filter((m) => m.role === 'tool').map((m) => m.toolCallId);
        expect(answered).toEqual(['r1', 'd1', 'r2', 'd2']);
        expect(events.at(-1)?.type).toBe('run-done');
    });

    it('suspends again when a pending call still has no answer', async () => {
        const t = scripted();
        const { done, events } = run({
            transportCall: t.call,
            baseRequest: { messages: [user, envelope([
                { id: 'd1', name: 'delete_file', input: {} }, { id: 'd2', name: 'delete_file', input: {} },
            ])] } as StreamChatRequest,
            deferral: { outcomes: { d1: { kind: 'decision', approved: true } } },
        });
        await done;
        expect(t.requests).toHaveLength(0);
        expect(suspension(events).pending.map((p) => p.toolCallId)).toEqual(['d2']);
    });

    it('ignores a trailing envelope when `deferral` is absent (today\'s callers are unaffected)', async () => {
        const t = scripted([{ type: 'text', delta: 'Hi.' }, { type: 'done' }] as StreamChatEvent[]);
        const { done, events } = run({ transportCall: t.call });
        await done;
        expect(types(events)[1]).toBe('turn-start');
    });
});
