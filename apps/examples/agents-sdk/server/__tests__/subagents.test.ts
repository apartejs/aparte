// @vitest-environment node
/**
 * The scripted sub-agent route, read the way the page reads it: every event AG-UI 1.0 knows is
 * checked against its schema, and aparté's AG-UI runner — the strict reader, with its verifier —
 * turns the stream into the events the chat draws: two sub-agents, one opened by the `delegate`
 * call, their work interleaved, and none of it in the reply.
 */
import { describe, it, expect } from 'vitest';
import { EventSchemas } from '@ag-ui/core/schemas';
import { createAgUiRunner } from '@aparte/runner-ag-ui';
import type { AparteStreamRunOptions } from '@aparte/core';
import { handleSubagentRun, LEAD_IN, ORDER_ANSWER, REPLY, RETURNS_ANSWER, subagentRun } from '../subagents.js';

type Event = { type: string; [key: string]: unknown };

const input = { threadId: 't1', runId: 'r1', state: {}, messages: [{ id: 'u1', role: 'user', content: 'Where is order 1042, and can I return it?' }], tools: [], context: [], forwardedProps: {} };

const post = (body: unknown) => new Request('http://localhost/subagents', { method: 'POST', body: JSON.stringify(body) });

async function read(): Promise<Event[]> {
    const fetch = (async (url: string | URL | Request, init?: RequestInit) =>
        handleSubagentRun(new Request(new URL(String(url), 'http://localhost'), init), 0)) as typeof globalThis.fetch;
    const events: Event[] = [];
    await createAgUiRunner({ endpoint: '/subagents', fetch, onWarning: (message) => { throw new Error(`runner warned: ${message}`); } })({
        messageId: 'm1',
        providerId: 'agent',
        baseRequest: { messages: [{ role: 'user', content: 'Where is order 1042, and can I return it?' }], modelId: 'x', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (event: { type: string }) => { events.push(event as Event); },
        signal: new AbortController().signal,
    } as unknown as AparteStreamRunOptions);
    return events;
}

const textOf = (events: Event[], agentId?: string) =>
    events.filter((e) => e.type === 'text-delta' && e.agentId === agentId).map((e) => e.delta).join('');

describe('the scripted sub-agent run', () => {
    it('is AG-UI on the wire: every event outside the sub-agent lifecycle passes the schema', async () => {
        const response = await handleSubagentRun(post(input), 0);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        const events = (await response.text()).split('\n\n').filter(Boolean).map((frame) => JSON.parse(frame.slice('data: '.length)) as Event);
        expect(events[0]).toMatchObject({ type: 'RUN_STARTED', threadId: 't1', runId: 'r1' });
        expect(events.at(-1)).toMatchObject({ type: 'RUN_FINISHED', threadId: 't1', runId: 'r1' });
        // @ag-ui/core 1.0.3 has no SUBAGENT_* schema yet; the runner's verifier reads those below.
        for (const event of events.filter((e) => !e.type.startsWith('SUBAGENT_'))) {
            expect(EventSchemas.safeParse(event).success, `${event.type} is a valid AG-UI event`).toBe(true);
        }
        expect(events.filter((e) => e.type === 'SUBAGENT_STARTED').map((e) => e.name)).toEqual(['Order tracker', 'Returns desk']);
    });

    it('opens one sub-agent from the delegate call and one on its own, and keeps their words out of the reply', async () => {
        const events = await read();
        const types = events.map((e) => e.type);
        expect(types).not.toContain('error');
        expect(types.at(-1)).toBe('run-done');

        const starts = events.filter((e) => e.type === 'agent-start');
        // The runner names the run; the route prefixes its ids with that name.
        const run = String(starts[0]?.agentId).replace(/-orders$/, '');
        expect(starts).toEqual([
            { type: 'agent-start', agentId: `${run}-orders`, name: 'Order tracker', description: 'Find where order 1042 is', toolCallId: `${run}-delegate` },
            { type: 'agent-start', agentId: `${run}-returns`, name: 'Returns desk', description: 'Check whether order 1042 can still be returned' },
        ]);
        expect(events.filter((e) => e.type === 'agent-end').map((e) => [e.agentId, e.status])).toEqual([[`${run}-orders`, 'done'], [`${run}-returns`, 'done']]);

        // The reply is the support agent's two messages; each sub-agent's words are its own.
        expect(textOf(events)).toBe(LEAD_IN + REPLY);
        expect(textOf(events, `${run}-orders`)).toBe(ORDER_ANSWER);
        expect(textOf(events, `${run}-returns`)).toBe(RETURNS_ANSWER);
        // The sub-agents' calls are theirs; the reply's own is the delegate call, resolved.
        expect(events.filter((e) => e.type === 'tool-start').map((e) => [e.name, e.agentId])).toEqual([
            ['delegate', undefined], ['get_order_status', `${run}-orders`], ['get_return_policy', `${run}-returns`],
        ]);
        expect(events.find((e) => e.type === 'tool-resolved' && e.toolCallId === `${run}-delegate`)).toMatchObject({ result: ORDER_ANSWER });
    });

    it('interleaves the two: the returns desk works before the order tracker is done', () => {
        const events = subagentRun('t1', 'r1').flat();
        const firstReturns = events.findIndex((e) => e.subagentRunId === 'r1-returns');
        const ordersDone = events.findIndex((e) => e.type === 'SUBAGENT_FINISHED' && e.subagentRunId === 'r1-orders');
        expect(firstReturns).toBeGreaterThan(-1);
        expect(firstReturns).toBeLessThan(ordersDone);
    });

    it('answers a body that is not a RunAgentInput with 422', async () => {
        const response = await handleSubagentRun(new Request('http://localhost/subagents', { method: 'POST', body: '{}' }), 0);
        expect(response.status).toBe(422);
    });
});
