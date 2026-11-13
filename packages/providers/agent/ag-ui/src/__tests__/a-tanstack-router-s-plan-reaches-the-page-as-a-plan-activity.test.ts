/**
 * TanStack AI's router plan reaches the page as a `plan` activity, ticked as its sub-agents run.
 *
 * What TanStack AI 1.0 really sends (`dist/esm/activities/chat/index.js`, `withPlan`): when a
 * `subagents.router` picks agents, every DIRECT child's `SUBAGENT_STARTED` carries the router's
 * plan in `metadata.tanstack.subagentPlan` — `{ steps: [{ names, order? }] }`, names and order
 * only, the same plan on each child, never sent again. It is the parent's plan of its
 * sub-agents, not a sub-agent's own: so it is the REPLY's activity (no `agentId`), one per run,
 * a step per agent in the router's order, each ticked from the sub-agents' own lifecycle — in
 * progress at its start, done or failed at its end. A step the router has moved past is done:
 * the router starts a step only once the steps before it finished.
 *
 * Run against TanStack's real server (`chat()` with a router, `toServerSentEventsResponse`).
 */
import { describe, it, expect } from 'vitest';
import { chat, chatParamsFromRequest, defineAgent, toServerSentEventsResponse } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';
import { agUi, finished, scripted, sse, started, turn as replay } from './replay.js';

type Event = { type: string; [key: string]: unknown };

const agent = (name: string, text: string | Error) => defineAgent({
    name,
    description: `The ${name}.`,
    run: async () => {
        if (text instanceof Error) throw text;
        return text;
    },
});

/** A TanStack AI route whose router splits the turn: two agents side by side, then a third. */
function routerRoute(agents: ReturnType<typeof agent>[], steps: Array<{ names: string[]; order?: 'parallel' | 'sequence' }>) {
    return (async (_url: string, init: RequestInit) => {
        const params = await chatParamsFromRequest(new Request('http://localhost/api/chat', { method: 'POST', body: init.body as string }));
        const fake = fakeText();
        fake.setResponses([{ text: 'unused' }] as never);
        const stream = chat({
            adapter: fake,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            subagents: { agents, router: () => ({ steps }) },
        } as never);
        return toServerSentEventsResponse(stream as never);
    }) as unknown as typeof globalThis.fetch;
}

async function run(fetch: typeof globalThis.fetch): Promise<Event[]> {
    const events: Event[] = [];
    // A run whose agent failed fails too: what it drew before is what is read here.
    await createAgUiRunner({ endpoint: '/api/chat', fetch, threadId: 'conv-1', relaxedRunFraming: true, onWarning: () => {} })({
        messageId: 'm1',
        providerId: 'agent',
        transportCall: async () => '',
        toolLookup: () => undefined,
        signal: new AbortController().signal,
        emitter: (e: unknown) => events.push(e as Event),
        baseRequest: { messages: [{ role: 'user', content: 'Look into it.' }], modelId: 'x', stream: true },
    } as unknown as AparteStreamRunOptions).catch(() => undefined);
    return events;
}

const plans = (events: Event[]) => events.filter((e) => e.type === 'activity');
const steps = (event: Event | undefined) => (event?.['content'] as { steps: Array<{ title: string; status: string }> } | undefined)?.steps
    .map((s) => `${s.title}:${s.status}`);

describe('a TanStack router’s plan reaches the page as a plan activity', () => {
    it('one activity of the reply, a step per agent in the router’s order, ticked as each runs', async () => {
        const events = await run(routerRoute(
            [agent('researcher', 'Three sources.'), agent('checker', 'All true.'), agent('writer', 'The summary.')],
            [{ names: ['researcher', 'checker'], order: 'parallel' }, { names: ['writer'] }],
        ));
        const all = plans(events);
        expect(all.length).toBeGreaterThan(1);
        for (const e of all) {
            expect(e).toMatchObject({ type: 'activity', activityType: 'plan' });
            expect(e['id']).toBe(all[0]!['id']);
            expect(e).not.toHaveProperty('agentId');
        }
        // Drawn as soon as the first agent starts: the rest still to do.
        expect(steps(all[0])).toEqual(['researcher:in-progress', 'checker:pending', 'writer:pending']);
        expect(steps(all.at(-1))).toEqual(['researcher:done', 'checker:done', 'writer:done']);
        // Never before the agent it ticks has started: the plan reaches the page with the agents.
        const firstStart = events.findIndex((e) => e.type === 'agent-start');
        expect(events.indexOf(all[0]!)).toBeGreaterThan(firstStart);
    });

    it('marks the agent that failed', async () => {
        const events = await run(routerRoute(
            [agent('researcher', new Error('No sources.')), agent('writer', 'The summary.')],
            [{ names: ['researcher'] }, { names: ['writer'] }],
        ));
        expect(steps(plans(events).at(-1))).toEqual(['researcher:failed', 'writer:pending']);
    });
});

describe('a router plan as the wire carries it', () => {
    const startedWith = (subagentRunId: string, name: string, plan?: unknown, parentSubagentRunId?: string) => ({
        type: 'SUBAGENT_STARTED', subagentRunId, name,
        ...(parentSubagentRunId ? { parentSubagentRunId } : {}),
        ...(plan ? { metadata: { tanstack: { subagentPlan: plan } } } : {}),
    });
    const PLAN = { steps: [{ names: ['a'] }, { names: ['b'] }] };

    it('marks the steps before the one that starts as done: a resumed run does not start them again', async () => {
        const f = scripted(sse(started(), startedWith('r-b', 'b', PLAN), { type: 'SUBAGENT_FINISHED', subagentRunId: 'r-b' }, finished()));
        const { events } = await replay(agUi(f.fetch));
        expect(plans(events as Event[]).map(steps)).toEqual([['a:done', 'b:in-progress'], ['a:done', 'b:done']]);
    });

    it('draws no plan for a plan that is not one, nor for a nested router’s', async () => {
        const f = scripted(sse(
            started(),
            startedWith('r-a', 'a', { steps: 'everything' }),
            startedWith('r-n', 'n', PLAN, 'r-a'),
            finished(),
        ));
        const { events } = await replay(agUi(f.fetch));
        expect(plans(events as Event[])).toEqual([]);
    });
});
