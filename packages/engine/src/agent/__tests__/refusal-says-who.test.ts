import { describe, it, expect } from 'vitest';
import { runStreamAgent, toolRefusal, type StreamRunOptions } from '../stream-run';
import type { StreamChatEvent, StreamRunEvent } from '../stream-events';

// A refusal reaches two readers. The model reads one sentence; the row has to say who
// refused, and quote the person's own words — which a sentence written for the model
// cannot do for a person reading in another language.

async function* streamOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

async function refusedRun(over: Partial<StreamRunOptions>): Promise<{ rejected: StreamRunEvent | undefined; toolMessage: unknown }> {
    const streams: StreamChatEvent[][] = [
        [{ type: 'tool_use', id: 'c1', name: 'write', input: {} }, { type: 'done' }],
        [{ type: 'text', delta: 'Understood.' }, { type: 'done' }],
    ];
    const requests: unknown[][] = [];
    let i = 0;
    const events: StreamRunEvent[] = [];
    await runStreamAgent({
        messageId: 'm1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }] },
        transportCall: async (request) => {
            requests.push(request.messages.map((m) => ({ ...m })));
            return streamOf(streams[i++] ?? []);
        },
        toolLookup: () => async () => ({ content: 'ran' }),
        toolConfigLookup: () => ({ needsApproval: true }),
        emitter: (e) => events.push(e),
        signal: new AbortController().signal,
        ...over,
    });
    const second = (requests[1] ?? []) as Array<{ role: string; content: unknown }>;
    return { rejected: events.find((e) => e.type === 'tool-rejected'), toolMessage: second.find((m) => m.role === 'tool')?.content };
}

describe('toolRefusal — the sentence the model reads, and who it is from', () => {
    it('a bare refusal is the person\'s, with the fixed sentence', () => {
        expect(toolRefusal({})).toEqual({ reason: 'Tool execution was rejected by the user.', by: 'person' });
    });

    it('the person\'s words are quoted to the model and kept apart for the row', () => {
        expect(toolRefusal({ instruction: 'use staging' })).toEqual({
            reason: 'The user rejected this tool call and said: use staging',
            by: 'person',
            instruction: 'use staging',
        });
    });

    it('a reason with no origin is a policy\'s — the resolver contract says so', () => {
        expect(toolRefusal({ reason: 'Plan mode.' })).toEqual({ reason: 'Plan mode.', by: 'policy' });
    });

    it('with no reason, the sentence follows the origin — never "the user" for a policy', () => {
        expect(toolRefusal({ by: 'policy' })).toEqual({ reason: 'Tool execution was refused by the approval policy.', by: 'policy' });
        expect(toolRefusal({ by: 'earlier-refusal' })).toEqual({ reason: 'Not run: an earlier call of the same step was refused.', by: 'earlier-refusal' });
    });

    it('an explicit origin wins, and an empty reason is no reason', () => {
        expect(toolRefusal({ reason: 'Not run.', by: 'earlier-refusal' })).toEqual({ reason: 'Not run.', by: 'earlier-refusal' });
        expect(toolRefusal({ reason: '   ', by: 'person' })).toEqual({ reason: 'Tool execution was rejected by the user.', by: 'person' });
    });
});

describe('runStreamAgent — tool-rejected says who refused', () => {
    it('a person who typed instead: by person, their words, and the model\'s sentence unchanged', async () => {
        const { rejected, toolMessage } = await refusedRun({
            approvalResolver: async () => ({ approved: false, instruction: 'use the staging bucket' }),
        });
        expect(rejected).toEqual({
            type: 'tool-rejected',
            toolCallId: 'c1',
            reason: 'The user rejected this tool call and said: use the staging bucket',
            by: 'person',
            instruction: 'use the staging bucket',
        });
        expect(toolMessage).toBe('The user rejected this tool call and said: use the staging bucket');
    });

    it('a policy that refused on its own: by policy', async () => {
        const { rejected, toolMessage } = await refusedRun({
            approvalResolver: async () => ({ approved: false, reason: 'Plan mode.' }),
        });
        expect(rejected).toMatchObject({ reason: 'Plan mode.', by: 'policy' });
        expect(rejected).not.toHaveProperty('instruction');
        expect(toolMessage).toBe('Plan mode.');
    });

    it('a resolver that names the origin is believed', async () => {
        const { rejected } = await refusedRun({
            approvalResolver: async () => ({ approved: false, reason: 'Refused at the desk.', by: 'person' }),
        });
        expect(rejected).toMatchObject({ reason: 'Refused at the desk.', by: 'person' });
    });

    it('a resumed run\'s refusal keeps the origin it was handed', async () => {
        // A resume starts from the history that paused: the call is in it, waiting.
        const events: StreamRunEvent[] = [];
        await runStreamAgent({
            messageId: 'm1',
            baseRequest: { modelId: 'm', messages: [
                { role: 'user', content: 'hi' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'write', input: {} }] },
            ] },
            transportCall: async () => streamOf([{ type: 'text', delta: 'OK.' }, { type: 'done' }]),
            toolLookup: () => async () => ({ content: 'ran' }),
            toolConfigLookup: () => ({ needsApproval: true }),
            emitter: (e) => events.push(e),
            signal: new AbortController().signal,
            deferral: { outcomes: { c1: { kind: 'decision', approved: false, reason: 'Not run.', by: 'earlier-refusal' } } },
        });
        expect(events.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'c1', reason: 'Not run.', by: 'earlier-refusal' });
    });
});
