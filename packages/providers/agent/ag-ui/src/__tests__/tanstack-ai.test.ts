/**
 * The runner against TanStack AI's REAL server — `chat()` + `toServerSentEventsResponse`,
 * over TanStack's own scripted model (`fakeText`), behind a fake `fetch`.
 *
 * TanStack AI speaks AG-UI, so the same runner serves it; what this suite pins is what
 * only its server showed: a RUN_FINISHED per model step (not one per run), the result
 * of a resumed call arriving BEFORE RUN_STARTED, usage as an array, a refusal answered
 * with an `output-error` result, and browser tools as a `tanstack:client_tool_execution`
 * interrupt. Every round trip below goes through their validation and comes back.
 *
 * The first two break AG-UI 1.0's run framing, which the runner enforces by default: this
 * is TanStack AI 0.x, and the runner reads it as the older peer it is, through
 * `peerProtocolVersion` — the lever its documentation gives TanStack AI 0.x users.
 */
import { describe, it, expect } from 'vitest';
import { chat, chatParamsFromRequest, mergeAgentTools, toServerSentEventsResponse, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

type Event = { type: string; [key: string]: unknown };

const getWeather = toolDefinition({
    name: 'get_weather',
    description: 'Weather in a city.',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
}).server(async (input: unknown) => `Cloudy in ${(input as { city: string }).city}`);

const deleteFile = toolDefinition({
    name: 'delete_file',
    description: 'Delete a file.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    needsApproval: true,
}).server(async (input: unknown) => `deleted ${(input as { path: string }).path}`);

const askUser = {
    name: 'ask_user',
    description: 'Ask the user.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
};

/** A TanStack AI chat route, as their docs write it, answering from a script. */
function tanstackRoute(responses: object[]) {
    const fake = fakeText();
    fake.setResponses(responses as never);
    return (async (_url: string, init: RequestInit) => {
        const params = await chatParamsFromRequest(new Request('http://localhost/api/chat', { method: 'POST', body: init.body as string }));
        // The route the TanStack AI page documents. The run's AG-UI fields must reach chat():
        // without `resume`, `threadId` and `runId` a paused run never resumes.
        const stream = chat({
            adapter: fake,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            parentRunId: params.parentRunId,
            resume: params.resume,
            tools: mergeAgentTools([getWeather, deleteFile], params.tools),
        } as never);
        return toServerSentEventsResponse(stream as never);
    }) as unknown as typeof globalThis.fetch;
}

async function turn(fetch: typeof globalThis.fetch, extra: object): Promise<Event[]> {
    const events: Event[] = [];
    await createAgUiRunner({ endpoint: '/api/chat', fetch, threadId: 'conv-1', peerProtocolVersion: '0.0.52' })({
        messageId: 'm1',
        providerId: 'agent',
        transportCall: async () => '',
        toolLookup: () => undefined,
        signal: new AbortController().signal,
        emitter: (e: unknown) => events.push(e as Event),
        ...extra,
    } as unknown as AparteStreamRunOptions);
    return events;
}

const types = (events: Event[]) => events.map((e) => e.type);
const said = (events: Event[]) => events.filter((e) => e.type === 'text-delta').map((e) => e['delta']).join('');

describe('createAgUiRunner against TanStack AI', () => {
    it('draws a server tool and the answer after it, through one RUN_FINISHED per model step', async () => {
        const fetch = tanstackRoute([
            { toolCalls: [{ name: 'get_weather', input: { city: 'Lille' }, id: 'c1' }] },
            { text: 'Cloudy in Lille.' },
        ]);
        const events = await turn(fetch, { baseRequest: { messages: [{ role: 'user', content: 'weather?' }], modelId: 'x', stream: true } });
        expect(events.find((e) => e.type === 'tool-start')).toMatchObject({ toolCallId: 'c1', name: 'get_weather', input: { city: 'Lille' } });
        expect(events.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'c1', result: 'Cloudy in Lille' });
        expect(said(events)).toBe('Cloudy in Lille.');
        // One end, after everything — not at the first step's RUN_FINISHED.
        expect(types(events).filter((t) => t === 'run-done')).toHaveLength(1);
        expect(types(events).at(-1)).toBe('run-done');
        expect(events.at(-1)!['usage']).toMatchObject({ inputTokens: expect.any(Number) });
    });

    it('pauses on a tool that needs approval, and an approval runs it on their server', async () => {
        const fetch = tanstackRoute([{ toolCalls: [{ name: 'delete_file', input: { path: '/x' }, id: 'd1' }] }, { text: 'Deleted.' }]);
        const user = { role: 'user', content: 'delete /x' };
        const first = await turn(fetch, { baseRequest: { messages: [user], modelId: 'x', stream: true } });
        expect(types(first)).toEqual(['run-start', 'turn-start', 'tool-start', 'tool-awaiting-approval', 'run-suspended']);

        const second = await turn(fetch, {
            baseRequest: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'd1', name: 'delete_file', input: { path: '/x' } }] }], modelId: 'x', stream: true },
            deferral: { token: String(first.at(-1)!['ticket']), outcomes: { d1: { kind: 'decision', approved: true } } },
        });
        // Their result for the resumed call arrives before RUN_STARTED: the row still
        // goes approved, then resolved — never back to pending.
        expect(types(second).slice(0, 4)).toEqual(['run-start', 'turn-start', 'tool-approved', 'tool-resolved']);
        expect(second.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'd1', result: 'deleted /x' });
        expect(said(second)).toBe('Deleted.');
        expect(types(second).at(-1)).toBe('run-done');
    });

    it('sends a refusal their server accepts, and the row stays refused', async () => {
        const fetch = tanstackRoute([{ toolCalls: [{ name: 'delete_file', input: { path: '/x' }, id: 'd1' }] }, { text: 'OK, not deleting.' }]);
        const user = { role: 'user', content: 'delete /x' };
        const first = await turn(fetch, { baseRequest: { messages: [user], modelId: 'x', stream: true } });
        const second = await turn(fetch, {
            baseRequest: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'd1', name: 'delete_file', input: { path: '/x' } }] }], modelId: 'x', stream: true },
            deferral: { token: String(first.at(-1)!['ticket']), outcomes: { d1: { kind: 'decision', approved: false, reason: 'Not that one.' } } },
        });
        expect(second.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'd1', reason: 'Not that one.' });
        // TanStack answers a denial with an output-error result: it must not flip the row.
        expect(types(second)).not.toContain('tool-resolved');
        expect(types(second)).not.toContain('tool-failed');
        expect(said(second)).toBe('OK, not deleting.');
    });

    it('hands a tool the PAGE registered to the page, and its result resumes their run', async () => {
        const fetch = tanstackRoute([{ toolCalls: [{ name: 'ask_user', input: { question: 'Which?' }, id: 'q1' }] }, { text: 'Blue it is.' }]);
        const user = { role: 'user', content: 'pick a colour' };
        const first = await turn(fetch, { baseRequest: { messages: [user], modelId: 'x', stream: true, tools: [askUser] } });
        expect(first.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'q1', name: 'ask_user', input: { question: 'Which?' }, reason: 'external' }] });

        const second = await turn(fetch, {
            baseRequest: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'ask_user', input: { question: 'Which?' } }] }], modelId: 'x', stream: true, tools: [askUser] },
            deferral: { token: String(first.at(-1)!['ticket']), outcomes: { q1: { kind: 'result', content: 'The blue one.' } } },
        });
        expect(second.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'q1', result: 'The blue one.' });
        expect(said(second)).toBe('Blue it is.');
    });

    it('sends a page tool the page refused as the tool\'s error, never as its output', async () => {
        let seen = '';
        const fetch = tanstackRoute([
            { toolCalls: [{ name: 'ask_user', input: { question: 'Which?' }, id: 'q1' }] },
            // What the MODEL reads on the second call: the tool's result, as TanStack built it.
            ({ request }: { request: { messages: unknown[] } }) => { seen = JSON.stringify(request.messages); return { text: 'Fine, I will not ask.' }; },
        ]);
        const user = { role: 'user', content: 'pick a colour' };
        const first = await turn(fetch, { baseRequest: { messages: [user], modelId: 'x', stream: true, tools: [askUser] } });
        const second = await turn(fetch, {
            baseRequest: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'ask_user', input: { question: 'Which?' } }] }], modelId: 'x', stream: true, tools: [askUser] },
            deferral: { token: String(first.at(-1)!['ticket']), outcomes: { q1: { kind: 'decision', approved: false, reason: 'Plan mode: nothing is asked.' } } },
        });
        expect(second.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'q1', reason: 'Plan mode: nothing is asked.' });
        // Read as an output, `{ approved: false }` would settle the row as resolved.
        expect(types(second)).not.toContain('tool-resolved');
        expect(said(second)).toBe('Fine, I will not ask.');
        expect(seen, 'the model reads the reason').toContain('Plan mode: nothing is asked.');
        expect(seen, 'and not a decision dressed as an output').not.toContain('"approved":false');
    });
});
