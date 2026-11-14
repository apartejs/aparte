/**
 * An AG-UI thread is a conversation.
 *
 * `threadId` is the protocol's word for what aparté calls a conversation: an agent keeps
 * its session, and its state, per thread. The runner used to start a new thread for every
 * turn unless the app named one, so an app that kept conversations had to say which, by
 * hand, with a function that read the conversation open in the chat. The turn carries it now
 * (`conversationId`), and the thread follows it.
 *
 * An explicit `threadId` still decides, and a paused run is still resumed in its own thread.
 */
import { describe, it, expect } from 'vitest';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

const sse = (...events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

/** An agent that answers every run in the thread it was given, handing back `snapshot` as its state if it has one. */
function agent(snapshot?: unknown) {
    const bodies: Record<string, unknown>[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        const threadId = body['threadId'];
        return sse(
            { type: 'RUN_STARTED', threadId, runId: 'r1' },
            ...(snapshot === undefined ? [] : [{ type: 'STATE_SNAPSHOT', snapshot }]),
            { type: 'RUN_FINISHED', threadId, runId: 'r1' },
        );
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies, threads: () => bodies.map((b) => b['threadId']) };
}

function turn(runner: ReturnType<typeof createAgUiRunner>, extra: Partial<AparteStreamRunOptions> = {}) {
    return runner({
        messageId: 'm1',
        providerId: 'agent',
        baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: () => undefined,
        signal: new AbortController().signal,
        ...extra,
    } as unknown as AparteStreamRunOptions);
}

describe('an AG-UI turn runs in the thread of its conversation', () => {
    it('uses the conversation id as the thread', async () => {
        const a = agent();
        await turn(createAgUiRunner({ endpoint: '/agui', fetch: a.fetch }), { conversationId: 'c1' });
        expect(a.threads()).toEqual(['c1']);
    });

    it('keeps one thread for the turns of a conversation, and another for the next conversation', async () => {
        const a = agent();
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch });
        await turn(runner, { conversationId: 'c1' });
        await turn(runner, { conversationId: 'c1' });
        await turn(runner, { conversationId: 'c2' });
        expect(a.threads()).toEqual(['c1', 'c1', 'c2']);
    });

    it('sends the agent its state back on the next turn of the same conversation, and not on another', async () => {
        const a = agent({ planned: 3 });
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch });
        await turn(runner, { conversationId: 'c1' });
        await turn(runner, { conversationId: 'c1' });
        await turn(runner, { conversationId: 'c2' });
        expect(a.bodies.map((b) => b['state'])).toEqual([{}, { planned: 3 }, {}]);
    });

    it('lets an explicit threadId decide, as a string or as a function of the run', async () => {
        const fixed = agent();
        await turn(createAgUiRunner({ endpoint: '/agui', fetch: fixed.fetch, threadId: 'mine' }), { conversationId: 'c1' });
        expect(fixed.threads()).toEqual(['mine']);

        const chosen = agent();
        const seen: unknown[] = [];
        await turn(createAgUiRunner({
            endpoint: '/agui', fetch: chosen.fetch,
            threadId: (opts) => { seen.push(opts.conversationId); return `app-${opts.conversationId}`; },
        }), { conversationId: 'c1' });
        expect(chosen.threads()).toEqual(['app-c1']);
        expect(seen).toEqual(['c1']);
    });

    it('starts a new thread for each turn of a chat with no conversation, as it always did', async () => {
        const a = agent();
        const runner = createAgUiRunner({ endpoint: '/agui', fetch: a.fetch });
        await turn(runner);
        await turn(runner);
        const [first, second] = a.threads() as string[];
        expect(first).toMatch(/^aparte-/);
        expect(second).toMatch(/^aparte-/);
        expect(first).not.toBe(second);
    });

    it('resumes a paused run in the thread it paused in, whatever the conversation says', async () => {
        const a = agent();
        const ticket = JSON.stringify({ v: 1, threadId: 'paused-here', runId: 'r0', interrupts: [] });
        await turn(createAgUiRunner({ endpoint: '/agui', fetch: a.fetch }), {
            conversationId: 'c1',
            deferral: { token: ticket, outcomes: {} },
        });
        expect(a.threads()).toEqual(['paused-here']);
    });
});
