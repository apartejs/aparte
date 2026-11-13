// @vitest-environment node
/**
 * The TanStack AI route, read the way the page reads it: TanStack's own server code streams,
 * every event AG-UI 1.0 has a schema for passes it, and aparté's AG-UI runner (with
 * `relaxedRunFraming`, which TanStack's routes need) turns the stream into what the chat draws:
 * a line per sub-agent, their calls under them, the router's plan, and only the main model's
 * words in the reply.
 */
import { describe, it, expect } from 'vitest';
import { EventSchemas } from '@ag-ui/core/schemas';
import { createAgUiRunner } from '@aparte/runner-ag-ui';
import type { AparteStreamRunOptions } from '@aparte/core';
import { DESK, handleTanstackRun, ORDER_ANSWER, REPLY, RETURNS_ANSWER, TRACKER } from '../tanstack.js';

type Event = { type: string; [key: string]: unknown };

const input = { threadId: 't1', runId: 'r1', state: {}, messages: [{ id: 'u1', role: 'user', content: 'Where is order 1042, and can I return it?' }], tools: [], context: [], forwardedProps: {} };

async function read(): Promise<Event[]> {
    const fetch = (async (url: string | URL | Request, init?: RequestInit) =>
        handleTanstackRun(new Request(new URL(String(url), 'http://localhost'), init), 0)) as typeof globalThis.fetch;
    const events: Event[] = [];
    await createAgUiRunner({ endpoint: '/tanstack', fetch, relaxedRunFraming: true, onWarning: (message) => { throw new Error(`runner warned: ${message}`); } })({
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
    events.filter((e) => e.type === 'text-delta' && e['agentId'] === agentId).map((e) => e['delta']).join('');

describe('the TanStack AI route', () => {
    it('streams AG-UI: the router’s sub-agents, their plan, every event of theirs tagged', async () => {
        const response = await handleTanstackRun(new Request('http://localhost/tanstack', { method: 'POST', body: JSON.stringify(input) }), 0);
        const events = (await response.text()).split('\n\n').filter(Boolean).map((frame) => JSON.parse(frame.slice('data: '.length)) as Event);
        // @ag-ui/core 1.0.3 has no SUBAGENT_* schema yet; the runner's verifier reads those below.
        for (const event of events.filter((e) => !e.type.startsWith('SUBAGENT_'))) {
            expect(EventSchemas.safeParse(event).success, `${event.type} is a valid AG-UI event`).toBe(true);
        }
        const starts = events.filter((e) => e.type === 'SUBAGENT_STARTED');
        expect(starts.map((e) => e['name'])).toEqual([TRACKER, DESK]);
        for (const start of starts) {
            expect(start['metadata']).toEqual({ tanstack: { subagentPlan: { steps: [{ names: [TRACKER] }, { names: [DESK] }] } } });
        }
        // Between a sub-agent's start and its end, everything is its own.
        const ids = new Set(starts.map((e) => e['subagentRunId']));
        const inner = events.filter((e) => /^(TEXT_MESSAGE|TOOL_CALL)_/.test(e.type) && 'subagentRunId' in e);
        expect(inner.length).toBeGreaterThan(0);
        for (const e of inner) expect(ids.has(e['subagentRunId'])).toBe(true);
        // What TanStack's router does not send: no step, no activity.
        expect(events.some((e) => /^(STEP|ACTIVITY)_/.test(e.type))).toBe(false);
    });

    it('reads as a line per sub-agent, with its call and its answer, and the reply alone in the reply', async () => {
        const events = await read();
        expect(events.at(-1)!.type).toBe('run-done');
        const starts = events.filter((e) => e.type === 'agent-start');
        expect(starts.map((e) => e['name'])).toEqual([TRACKER, DESK]);
        const [tracker, desk] = starts.map((e) => String(e['agentId']));
        expect(events.filter((e) => e.type === 'tool-start').map((e) => [e['name'], e['agentId']]))
            .toEqual([['get_order_status', tracker], ['get_return_policy', desk]]);
        expect(textOf(events, tracker)).toBe(ORDER_ANSWER);
        expect(textOf(events, desk)).toBe(RETURNS_ANSWER);
        expect(textOf(events)).toBe(REPLY);
        const plans = events.filter((e) => e.type === 'activity' && e['activityType'] === 'plan');
        expect((plans.at(-1)!['content'] as { steps: unknown[] }).steps).toEqual([
            { title: TRACKER, status: 'done' },
            { title: DESK, status: 'done' },
        ]);
    });
});
