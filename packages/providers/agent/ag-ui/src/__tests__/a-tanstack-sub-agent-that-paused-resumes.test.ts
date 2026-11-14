/**
 * A TanStack AI sub-agent that pauses for an approval, resumed — against TanStack's REAL server
 * (`chat()` with `subagents`, `toServerSentEventsResponse`), a router's sub-agent and one the
 * model opened with a call.
 *
 * What TanStack needs to resume it (`readSubagentTurn`, `dist/esm/activities/chat/agents/turn.js`):
 * the paused turn's sub-agents in the resumed request's `messages`, after the last user message —
 * each one's own messages tagged with its `subagentRunId` (AG-UI 1.0 lets a message carry one),
 * one of them carrying TanStack's card, `metadata.tanstack.subagent`: its name, its status, the
 * interrupts it waits on, and the `SUBAGENT_STARTED` metadata, the router plan in it. Without
 * them TanStack finds no child that owns the answer and refuses the resume (`unknown-interrupt`):
 * the page's history holds the reply's own words, never a sub-agent's, so the runner keeps each
 * sub-agent's messages itself and hands them back in the ticket.
 *
 * And the plan is one card across the pause: the resumed run has a new run id, and TanStack
 * sends the plan again with the sub-agent it re-announces. Its id is the reply's, and what it
 * had ticked (the sibling that finished) survives the resume.
 */
import { describe, it, expect } from 'vitest';
import { chat, chatParamsFromRequest, defineAgent, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

type Event = { type: string; [key: string]: unknown };

const deleteFile = toolDefinition({
    name: 'delete_file',
    description: 'Delete a file.',
    needsApproval: true,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
}).server(async (input: unknown) => `deleted ${(input as { path: string }).path}`);

const listFiles = toolDefinition({
    name: 'list_files',
    description: 'List the files.',
    inputSchema: { type: 'object', properties: {} },
}).server(async () => 'a.txt, b.txt');

/** A sub-agent that calls its tool, then answers; resumed, it answers. */
const child = (name: string, tool: typeof deleteFile, answer: string) => defineAgent({
    name,
    description: `The ${name}.`,
    run: (ctx) => {
        const fake = fakeText();
        fake.setResponses(ctx.resume ? [{ text: answer }] : [{ toolCalls: [{ name: tool.name, input: { path: '/tmp/x' } }] }, { text: answer }]);
        return chat({ adapter: fake, messages: ctx.messages, tools: [tool], ...ctx.forward });
    },
});

/**
 * The TanStack AI route: a router running both side by side, then the main model answers. Or,
 * `tools`, no router: the main model calls both as tools (each call opens its sub-agent).
 */
function route(bodies: Record<string, unknown>[], mode: 'router' | 'tools' = 'router') {
    return (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        const params = await chatParamsFromRequest(new Request('http://localhost/api/chat', { method: 'POST', body: init.body as string }));
        const main = fakeText();
        main.setResponses(mode === 'tools' && !params.resume
            ? [{ toolCalls: [{ name: 'lister', input: { prompt: 'List.' } }, { name: 'cleaner', input: { prompt: 'Clean.' } }] }]
            : [{ text: 'Both are done.' }]);
        const stream = chat({
            adapter: main,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.resume ? { resume: params.resume } : {}),
            subagents: {
                agents: [child('lister', listFiles, 'Two files.'), child('cleaner', deleteFile, 'Deleted it.')],
                ...(mode === 'router' ? {
                    router: () => ({ steps: [{ names: ['lister', 'cleaner'], order: 'parallel' as const }] }),
                    strategy: 'handoff' as const,
                } : {}),
            },
        } as never);
        return toServerSentEventsResponse(stream as never);
    }) as unknown as typeof globalThis.fetch;
}

async function pauseThenApprove(mode: 'router' | 'tools' = 'router') {
    const bodies: Record<string, unknown>[] = [];
    const runner = createAgUiRunner({ endpoint: '/api/chat', fetch: route(bodies, mode), threadId: 'conv-1', relaxedRunFraming: true, onWarning: () => {} });
    const first: Event[] = [];
    const second: Event[] = [];
    const asked = { role: 'user', content: 'Tidy up.' };
    const options = (into: Event[], deferral: object, messages: object[]) => ({
        messageId: 'm1',
        providerId: 'agent',
        transportCall: async () => '',
        toolLookup: () => undefined,
        signal: new AbortController().signal,
        emitter: (e: unknown) => into.push(e as Event),
        baseRequest: { messages, modelId: 'x', stream: true },
        deferral,
    }) as unknown as AparteStreamRunOptions;
    await runner(options(first, {}, [asked]));
    const suspended = first.find((e) => e.type === 'run-suspended') as { ticket: string; pending: Array<{ toolCallId: string }> };
    const outcomes = Object.fromEntries(suspended.pending.map((p) => [p.toolCallId, { kind: 'decision', approved: true }]));
    // What core's resume sends after the question: the reply so far, its own calls — the page
    // never holds a sub-agent's — the one whose sub-agent waits left open.
    const own = first.filter((e) => e.type === 'tool-start' && !('agentId' in e));
    const results = new Map(first.filter((e) => e.type === 'tool-resolved' && !('agentId' in e)).map((e) => [e['toolCallId'], e['result']]));
    const reply = own.length ? [
        { role: 'assistant', content: '', toolCalls: own.map((e) => ({ id: e['toolCallId'], name: e['name'], input: e['input'] })) },
        ...own.filter((e) => results.has(e['toolCallId'])).map((e) => ({ role: 'tool', content: results.get(e['toolCallId']), toolCallId: e['toolCallId'], toolName: e['name'] })),
    ] : [];
    let error: unknown;
    await runner(options(second, { token: suspended.ticket, outcomes }, [asked, ...reply])).catch((e: unknown) => { error = e; });
    return { first, second, bodies, error };
}

const plans = (events: Event[]) => events.filter((e) => e.type === 'activity');
const steps = (event: Event | undefined) => (event?.['content'] as { steps: Array<{ title: string; status: string }> } | undefined)?.steps
    .map((s) => `${s.title}:${s.status}`);

describe('a TanStack sub-agent that paused resumes', () => {
    it('runs the approved call under the sub-agent, which answers, and the run finishes', async () => {
        const { first, second, error } = await pauseThenApprove();
        expect(error).toBeUndefined();
        const cleaner = first.find((e) => e.type === 'agent-start' && e['name'] === 'cleaner')!['agentId'];
        const call = first.find((e) => e.type === 'tool-awaiting-approval')!;
        expect(call['agentId']).toBe(cleaner);
        expect(second).toContainEqual(expect.objectContaining({ type: 'tool-resolved', toolCallId: call['toolCallId'], result: 'deleted /tmp/x', agentId: cleaner }));
        expect(second).toContainEqual(expect.objectContaining({ type: 'agent-end', agentId: cleaner, status: 'done' }));
        expect(second.filter((e) => e.type === 'text-delta' && !('agentId' in e)).map((e) => e['delta']).join('')).toBe('Both are done.');
        expect(second.at(-1)!.type).toBe('run-done');
    });

    it('does not run the sub-agent that had finished again', async () => {
        const { second } = await pauseThenApprove();
        expect(second.filter((e) => e.type === 'tool-start').map((e) => e['name'])).not.toContain('list_files');
        expect(second.filter((e) => e.type === 'agent-start').map((e) => e['name'])).toEqual(['cleaner']);
    });

    it('hands TanStack the sub-agents’ own messages, tagged, with their card', async () => {
        const { first, bodies } = await pauseThenApprove();
        const cleaner = first.find((e) => e.type === 'agent-start' && e['name'] === 'cleaner')!['agentId'];
        const sent = bodies[1]!['messages'] as Array<Record<string, unknown>>;
        const own = sent.filter((m) => m['subagentRunId'] === cleaner);
        expect(own[0]).toMatchObject({
            role: 'assistant',
            toolCalls: [{ type: 'function', function: { name: 'delete_file', arguments: '{"path":"/tmp/x"}' } }],
            metadata: { tanstack: { subagent: { name: 'cleaner', status: 'suspended', interruptIds: [expect.any(String)] } } },
        });
        // The first request carries none: there was nothing to hand back.
        expect((bodies[0]!['messages'] as unknown[]).length).toBe(1);
    });

    it('resumes a sub-agent its model opened with a call the same way', async () => {
        // No router: TanStack's agent tools. The sub-agent's line is its call's row.
        const { first, second, error } = await pauseThenApprove('tools');
        expect(error).toBeUndefined();
        const cleaner = first.find((e) => e.type === 'agent-start' && e['name'] === 'cleaner')!;
        expect(cleaner['toolCallId']).toEqual(expect.any(String));
        const call = first.find((e) => e.type === 'tool-awaiting-approval')!;
        expect(second).toContainEqual(expect.objectContaining({ type: 'tool-resolved', toolCallId: call['toolCallId'], result: 'deleted /tmp/x', agentId: cleaner['agentId'] }));
        expect(second).toContainEqual(expect.objectContaining({ type: 'agent-end', agentId: cleaner['agentId'], status: 'done' }));
        expect(second.filter((e) => e.type === 'tool-start').map((e) => e['name'])).not.toContain('list_files');
        expect(second.at(-1)!.type).toBe('run-done');
    });

    it('keeps one plan card across the pause, what it had ticked included', async () => {
        const { first, second } = await pauseThenApprove();
        const all = [...plans(first), ...plans(second)];
        expect(new Set(all.map((e) => e['id'])).size).toBe(1);
        expect(steps(plans(first).at(-1))).toEqual(['lister:done', 'cleaner:blocked']);
        expect(steps(plans(second)[0])).toEqual(['lister:done', 'cleaner:in-progress']);
        expect(steps(all.at(-1))).toEqual(['lister:done', 'cleaner:done']);
    });
});
