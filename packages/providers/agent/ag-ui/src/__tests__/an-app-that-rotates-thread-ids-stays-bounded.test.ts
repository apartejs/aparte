/**
 * The runner's per-thread memory is bounded.
 *
 * It keeps, per thread, the state the agent last reported and the interrupts a run left
 * unanswered. An app that names a new thread for every turn (`threadId: () => uuid`), or a
 * chat that opens a new conversation each time, used to add one entry per turn for as long as
 * the page lived. The most recently used threads are kept; the oldest is let go; a thread used
 * again counts as new.
 */
import { describe, it, expect } from 'vitest';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

const sse = (...events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

type Reply = (body: Record<string, unknown>) => object[];

function agent(reply: Reply) {
    const bodies: Record<string, unknown>[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        return sse({ type: 'RUN_STARTED', threadId: body['threadId'], runId: 'r1' }, ...reply(body), { type: 'RUN_FINISHED', threadId: body['threadId'], runId: 'r1' });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies };
}

type Event = Record<string, unknown>;

function turn(runner: ReturnType<typeof createAgUiRunner>, extra: Partial<AparteStreamRunOptions> = {}, events: Event[] = []) {
    return runner({
        messageId: 'm1',
        providerId: 'agent',
        baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: Event) => events.push(e),
        signal: new AbortController().signal,
        ...extra,
    } as unknown as AparteStreamRunOptions);
}

/** The agent's state for a thread is whatever it reported the first time it saw it. */
const reportsOnce: Reply = (body) => (JSON.stringify(body['state']) === '{}' ? [{ type: 'STATE_SNAPSHOT', snapshot: { seen: body['threadId'] } }] : []);
const stateSentFor = (a: ReturnType<typeof agent>, index: number): unknown => a.bodies[index]!['state'];

describe('the state kept per thread', () => {
    it('stays bounded when an app names a new thread for every turn', async () => {
        const a = agent(reportsOnce);
        let id = 't0';
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch, threadId: () => id });
        for (let i = 0; i < 150; i++) { id = `t${i}`; await turn(runner); }
        // The newest thread still has its state; the oldest has been let go.
        id = 't149';
        await turn(runner);
        expect(stateSentFor(a, 150)).toEqual({ seen: 't149' });
        id = 't0';
        await turn(runner);
        expect(stateSentFor(a, 151)).toEqual({});
    });

    it('keeps the state of a thread that is used again, however many others come between', async () => {
        const a = agent(reportsOnce);
        let next = 'busy';
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch, threadId: () => next });
        await turn(runner); // the thread that keeps being used: its state is read, never rewritten
        for (let i = 0; i < 150; i++) {
            next = `other${i}`;
            await turn(runner);
            if (i % 10 === 9) { next = 'busy'; await turn(runner); }
        }
        next = 'busy';
        await turn(runner);
        expect(a.bodies.at(-1)!['state']).toEqual({ seen: 'busy' });
        next = 'other0';
        await turn(runner);
        expect(a.bodies.at(-1)!['state']).toEqual({});
    });

    it('still gives a paused run its state back, and lets go of a pause nobody came back to', async () => {
        const suspend: Reply = (body) => [
            { type: 'STATE_SNAPSHOT', snapshot: { seen: body['threadId'] } },
            { type: 'TOOL_CALL_START', toolCallId: 'q1', toolCallName: 'ask_user' },
            { type: 'TOOL_CALL_END', toolCallId: 'q1' },
        ];
        const a = agent((body) => (Array.isArray(body['tools']) && (body['messages'] as unknown[]).length === 1 ? suspend(body) : []));
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch });
        const tickets: string[] = [];
        const tool = { name: 'ask_user', description: 'ask', inputSchema: { type: 'object', properties: {} } };
        const request = { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true, tools: [tool] };
        for (let i = 0; i < 150; i++) {
            const events: Event[] = [];
            await turn(runner, { baseRequest: request } as never, events);
            tickets.push(String(events.at(-1)!['ticket']));
        }
        const resume = (ticket: string) => turn(runner, {
            baseRequest: request,
            deferral: { token: ticket, outcomes: { q1: { kind: 'result', content: 'Blue.' } } },
        } as never);
        await resume(tickets[149]!);
        expect(a.bodies.at(-1)!['state']).toEqual({ seen: a.bodies[149]!['threadId'] });
        await resume(tickets[0]!);
        expect(a.bodies.at(-1)!['state']).toEqual({});
    });
});

describe('the interrupts kept per thread', () => {
    it('stay bounded: the newest thread cancels what it left, the oldest has been let go', async () => {
        const a = { bodies: [] as Record<string, unknown>[] };
        // An agent that pauses on an interrupt nobody on the page can answer, on every first run.
        const interrupting = (async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body)) as Record<string, unknown>;
            a.bodies.push(body);
            const finished = { type: 'RUN_FINISHED', threadId: body['threadId'], runId: 'r1', ...(body['resume'] ? {} : { outcome: { type: 'interrupt', interrupts: [{ id: `i-${String(body['threadId'])}`, reason: 'approval' }] } }) };
            return sse({ type: 'RUN_STARTED', threadId: body['threadId'], runId: 'r1' }, finished);
        }) as unknown as typeof globalThis.fetch;
        let id = 't0';
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: interrupting, threadId: () => id });
        for (let i = 0; i < 150; i++) { id = `t${i}`; await turn(runner); }
        id = 't149';
        await turn(runner);
        expect(a.bodies.at(-1)!['resume']).toEqual([{ interruptId: 'i-t149', status: 'cancelled' }]);
        id = 't0';
        await turn(runner);
        expect(a.bodies.at(-1)!['resume']).toBeUndefined();
    });
});
