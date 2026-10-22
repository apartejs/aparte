/**
 * createAgUiRunner — an AG-UI agent's event stream, drawn by aparté.
 *
 * Every test replays a wire from a fake `fetch` and reads what the runner hands the
 * client's adapter: the same events `runStreamAgent` emits for a loop run in the page.
 */
import { describe, it, expect } from 'vitest';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { AparteError } from '@aparte/core';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

type Event = { type: string; [key: string]: unknown };

const sse = (...events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

function fakeFetch(...responses: (Response | ((body: Record<string, unknown>) => Response))[]) {
    const bodies: Record<string, unknown>[] = [];
    const headers: Record<string, string>[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        // Every request the runner sends is a RunAgentInput by the protocol's own schema.
        const checked = RunAgentInputSchema.safeParse(body);
        if (!checked.success) throw new Error(`not a RunAgentInput: ${checked.error.message}`);
        bodies.push(body);
        headers.push(init.headers as Record<string, string>);
        const next = responses.shift();
        if (!next) throw new Error('no scripted response left');
        return typeof next === 'function' ? next(body) : next;
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies, headers };
}

const weather = { name: 'ask_user', description: 'Ask the user.', inputSchema: { type: 'object' } };

function run(fetch: typeof globalThis.fetch, extra: Partial<AparteStreamRunOptions> = {}, signal = new AbortController().signal) {
    const events: Event[] = [];
    const opts = {
        messageId: 'm1',
        providerId: 'agent',
        baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: Event) => events.push(e),
        signal,
        ...extra,
    } as unknown as AparteStreamRunOptions;
    const done = createAgUiRunner({ endpoint: '/agui', fetch })(opts);
    return { done, events, types: () => events.map((e) => e.type) };
}

const started = { type: 'RUN_STARTED', threadId: 't', runId: 'r1' };
const finished = (extra: object = {}) => ({ type: 'RUN_FINISHED', threadId: 't', runId: 'r1', ...extra });

describe('createAgUiRunner: the stream', () => {
    it('draws text, reasoning and a server tool the agent ran, then ends the run', async () => {
        const f = fakeFetch(sse(
            started,
            { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r', delta: 'Thinking.' },
            { type: 'TEXT_MESSAGE_START', messageId: 'a1', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a1', delta: 'Let me ' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a1', delta: 'check.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'a1' },
            { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'get_weather' },
            { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"city":' },
            { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '"Lille"}' },
            { type: 'TOOL_CALL_END', toolCallId: 'c1' },
            { type: 'TOOL_CALL_RESULT', messageId: 'tr', toolCallId: 'c1', content: 'Cloudy' },
            { type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: 'Cloudy in Lille.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'a2' },
            { type: 'STATE_SNAPSHOT', snapshot: {} },
            finished(),
        ));
        const r = run(f.fetch);
        await r.done;
        // Text after a tool is the next model step: a turn of its own.
        expect(r.types()).toEqual([
            'run-start', 'turn-start', 'thinking-delta', 'text-delta', 'text-delta', 'text-flush',
            'tool-start', 'tool-resolved', 'turn-start', 'text-delta', 'text-flush', 'run-done',
        ]);
        expect(r.events.find((e) => e.type === 'tool-start')).toMatchObject({ toolCallId: 'c1', name: 'get_weather', input: { city: 'Lille' } });
        expect(r.events.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'c1', result: 'Cloudy' });
    });

    it('posts a RunAgentInput: the history with ids, the page tools, an SSE accept', async () => {
        const f = fakeFetch(sse(started, finished()));
        const r = run(f.fetch, {
            baseRequest: {
                messages: [
                    { role: 'system', content: 'Be brief.' },
                    { role: 'user', content: 'read it' },
                    { role: 'assistant', content: '', toolCalls: [{ id: 'k1', name: 'read_file', input: { path: 'a' } }] },
                    { role: 'tool', content: 'A', toolCallId: 'k1' },
                ],
                modelId: 'x', stream: true, tools: [weather],
            },
        } as never);
        await r.done;
        const body = f.bodies[0]!;
        expect(body).toMatchObject({ state: {}, context: [], forwardedProps: {} });
        expect(typeof body['threadId']).toBe('string');
        expect(body['messages']).toEqual([
            { id: 'aparte-0', role: 'system', content: 'Be brief.' },
            { id: 'aparte-1', role: 'user', content: 'read it' },
            { id: 'aparte-2', role: 'assistant', toolCalls: [{ id: 'k1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a"}' } }] },
            { id: 'aparte-3', role: 'tool', content: 'A', toolCallId: 'k1' },
        ]);
        expect(body['tools']).toEqual([{ name: 'ask_user', description: 'Ask the user.', parameters: { type: 'object' } }]);
        expect(f.headers[0]!['Accept']).toBe('text/event-stream');
    });

    it('reads a call with no ARGS as an empty input, and chunked calls and text', async () => {
        const f = fakeFetch(sse(
            started,
            { type: 'TEXT_MESSAGE_CHUNK', messageId: 'a', role: 'assistant', delta: 'Hi' },
            { type: 'TOOL_CALL_START', toolCallId: 'c0', toolCallName: 'ping' },
            { type: 'TOOL_CALL_END', toolCallId: 'c0' },
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'c2', toolCallName: 'sum', delta: '{"a":1' },
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'c2', delta: ',"b":2}' },
            { type: 'TOOL_CALL_RESULT', toolCallId: 'c0', content: { ok: true } },
            { type: 'TOOL_CALL_RESULT', toolCallId: 'c2', content: 3 },
            finished(),
        ));
        const r = run(f.fetch);
        await r.done;
        const starts = r.events.filter((e) => e.type === 'tool-start');
        expect(starts.map((e) => [e['toolCallId'], e['name'], e['input']])).toEqual([['c0', 'ping', {}], ['c2', 'sum', { a: 1, b: 2 }]]);
        expect(r.events.filter((e) => e.type === 'tool-resolved').map((e) => e['result'])).toEqual(['{"ok":true}', '3']);
        expect(r.types()[2]).toBe('text-delta');
    });

    it('reports the last step of usage reported as an array of steps (TanStack AI), as the page loop does', async () => {
        // The context gauge reads it as the size of what the model last saw: summed, a
        // two-step run read as twice the context.
        const f = fakeFetch(sse(started, finished({ usage: [{ inputTokens: 3, outputTokens: 2, totalTokens: 5 }, { inputTokens: 4, outputTokens: 1, totalTokens: 5, cachedInputTokens: 2 }] })));
        const r = run(f.fetch);
        expect(await r.done).toEqual({ inputTokens: 4, outputTokens: 1, totalTokens: 5, cacheReadTokens: 2 });
        expect(r.events.at(-1)).toMatchObject({ type: 'run-done', usage: { inputTokens: 4 } });
    });

    it('reads an NDJSON body the same way, and skips what is not an event', async () => {
        const body = [started, { nope: 1 }, { type: 'TEXT_MESSAGE_CONTENT', delta: 'ok' }, finished()].map((e) => JSON.stringify(e)).join('\n') + '\nnot json\n';
        const f = fakeFetch(new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }));
        const r = run(f.fetch);
        await r.done;
        expect(r.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush', 'run-done']);
    });

    it('turns RUN_ERROR and an HTTP failure into an AparteError', async () => {
        const failing = run(fakeFetch(sse(started, { type: 'RUN_ERROR', message: 'Model overloaded', code: 'overloaded' })).fetch);
        await expect(failing.done).rejects.toMatchObject({ message: 'Model overloaded' });
        await expect(failing.done).rejects.toBeInstanceOf(AparteError);
        const http = run(fakeFetch(new Response('Unauthorized agent', { status: 401 })).fetch);
        await expect(http.done).rejects.toMatchObject({ message: 'Unauthorized agent' });
    });

    it('opens a turn per model step: a second step reasons in a block of its own', async () => {
        const r = run(fakeFetch(sse(
            started,
            { type: 'REASONING_MESSAGE_START', messageId: 'r1' },
            { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r1', delta: 'Look it up.' },
            { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'get_weather' },
            { type: 'TOOL_CALL_END', toolCallId: 'c1' },
            finished({ metadata: { tanstack: { finishReason: 'tool_calls' } } }),
            { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', content: 'Cloudy' },
            { type: 'REASONING_MESSAGE_START', messageId: 'r2' },
            { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r2', delta: 'Now answer.' },
            { type: 'TEXT_MESSAGE_START', messageId: 'a2', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a2', delta: 'Cloudy.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'a2' },
            finished(),
        )).fetch);
        await r.done;
        // The step's reasoning and its text share one turn; the next step opens another.
        expect(r.types()).toEqual([
            'run-start', 'turn-start', 'thinking-delta', 'tool-start', 'tool-resolved',
            'turn-start', 'thinking-delta', 'text-delta', 'text-flush', 'run-done',
        ]);
    });

    it('fails a stream cut between two steps, after a RUN_FINISHED', async () => {
        const r = run(fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'get_weather' },
            { type: 'TOOL_CALL_END', toolCallId: 'c1' },
            finished(),
            { type: 'TOOL_CALL_RESULT', toolCallId: 'c1', content: 'Cloudy' },
            { type: 'TEXT_MESSAGE_CONTENT', delta: 'Cloudy in' },
        )).fetch);
        await expect(r.done).rejects.toThrow('was cut');
    });

    it('stops a row nobody will answer, and hands the page the calls the agent names', async () => {
        const left = run(fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 's1', toolCallName: 'search' },
            { type: 'TOOL_CALL_END', toolCallId: 's1' },
            finished(),
        )).fetch);
        await left.done;
        expect(left.types().slice(-2)).toEqual(['tool-aborted', 'run-done']);

        const named = run(fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'x1', toolCallName: 'open_tab' },
            { type: 'TOOL_CALL_END', toolCallId: 'x1' },
            finished({ outcome: { type: 'success', pendingToolCallIds: ['x1'] } }),
        )).fetch);
        await named.done;
        expect(named.events.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'x1', name: 'open_tab', reason: 'external' }] });

        const cancelled = run(fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'q1', toolCallName: 'ask_user' },
            { type: 'TOOL_CALL_END', toolCallId: 'q1' },
            finished({ outcome: { type: 'cancelled' } }),
        )).fetch, { baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true, tools: [weather] } } as never);
        await cancelled.done;
        expect(cancelled.types().slice(-2)).toEqual(['tool-aborted', 'run-done']);
    });

    it('fails a stream that ends without RUN_FINISHED, but not a stopped one', async () => {
        const cut = run(fakeFetch(sse(started, { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hal' })).fetch);
        await expect(cut.done).rejects.toThrow('without RUN_FINISHED');
        const controller = new AbortController();
        controller.abort();
        const stopped = run(fakeFetch(sse(started)).fetch, {}, controller.signal);
        await expect(stopped.done).resolves.toBeUndefined();
    });
});

describe('createAgUiRunner: pauses and resumes', () => {
    // A factory: a Response body can be read once, and each test reads its own.
    const interruptRun = () => sse(
        started,
        { type: 'TOOL_CALL_START', toolCallId: 'd1', toolCallName: 'delete_file' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'd1', delta: '{"path":"/x"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'd1' },
        finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'tool_call', toolCallId: 'd1' }] } }),
    );

    it('suspends on an approval interrupt, with a ticket for the resume', async () => {
        const f = fakeFetch(interruptRun());
        const r = run(f.fetch);
        await r.done;
        expect(r.types()).toEqual(['run-start', 'turn-start', 'tool-start', 'tool-awaiting-approval', 'run-suspended']);
        const suspended = r.events.at(-1)!;
        expect(suspended['pending']).toEqual([{ toolCallId: 'd1', name: 'delete_file', input: { path: '/x' }, reason: 'approval' }]);
        expect(JSON.parse(String(suspended['ticket']))).toMatchObject({ v: 1, runId: 'r1', interrupts: [{ id: 'i1', toolCallId: 'd1', kind: 'approval' }] });
    });

    it('resumes in the same thread with ONE resume batch, and settles the approved row', async () => {
        const first = fakeFetch(interruptRun());
        const a = run(first.fetch);
        await a.done;
        const ticket = String(a.events.at(-1)!['ticket']);
        const threadId = first.bodies[0]!['threadId'];

        const second = fakeFetch(sse(
            { type: 'RUN_STARTED', threadId, runId: 'r2' },
            { type: 'TOOL_CALL_RESULT', toolCallId: 'd1', content: 'deleted' },
            { type: 'TEXT_MESSAGE_CONTENT', delta: 'Done.' },
            { type: 'RUN_FINISHED', threadId, runId: 'r2' },
        ));
        const b = run(second.fetch, {
            baseRequest: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'd1', name: 'delete_file', input: { path: '/x' } }] }], modelId: 'x', stream: true },
            deferral: { token: ticket, outcomes: { d1: { kind: 'decision', approved: true } } },
        } as never);
        await b.done;
        expect(second.bodies[0]).toMatchObject({ threadId, parentRunId: 'r1', resume: [{ interruptId: 'i1', status: 'resolved', payload: { approved: true } }] });
        // No second row for the paused call: its row exists from the run that paused.
        expect(b.types()).toEqual(['run-start', 'turn-start', 'tool-approved', 'tool-resolved', 'text-delta', 'text-flush', 'run-done']);
    });

    it('sends a refusal and keeps the row refused, whatever the agent replies about it', async () => {
        const a = run(fakeFetch(interruptRun()).fetch);
        await a.done;
        const second = fakeFetch(sse(
            { type: 'RUN_STARTED', runId: 'r2' },
            { type: 'TOOL_CALL_RESULT', toolCallId: 'd1', content: 'The user declined.' },
            { type: 'RUN_FINISHED', runId: 'r2' },
        ));
        const b = run(second.fetch, {
            baseRequest: { messages: [{ role: 'assistant', content: '', toolCalls: [{ id: 'd1', name: 'delete_file', input: {} }] }], modelId: 'x', stream: true },
            deferral: { token: String(a.events.at(-1)!['ticket']), outcomes: { d1: { kind: 'decision', approved: false, reason: 'Not that one.' } } },
        } as never);
        await b.done;
        expect(second.bodies[0]!['resume']).toEqual([{ interruptId: 'i1', status: 'resolved', payload: { approved: false } }]);
        expect(b.events.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'd1', reason: 'Not that one.' });
        expect(b.types()).not.toContain('tool-resolved');
    });

    it('hands a frontend tool the agent called to the page, and sends its result back as a tool message', async () => {
        const f = fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'q1', toolCallName: 'ask_user' },
            { type: 'TOOL_CALL_ARGS', toolCallId: 'q1', delta: '{"question":"Which?"}' },
            { type: 'TOOL_CALL_END', toolCallId: 'q1' },
            finished(),
        ));
        const a = run(f.fetch, { baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true, tools: [weather] } } as never);
        await a.done;
        expect(a.events.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'q1', name: 'ask_user', reason: 'external' }] });

        const second = fakeFetch(sse({ type: 'RUN_STARTED' }, { type: 'TEXT_MESSAGE_CONTENT', delta: 'Blue it is.' }, { type: 'RUN_FINISHED' }));
        const b = run(second.fetch, {
            baseRequest: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'ask_user', input: { question: 'Which?' } }] }], modelId: 'x', stream: true, tools: [weather] },
            deferral: { token: String(a.events.at(-1)!['ticket']), outcomes: { q1: { kind: 'result', content: 'The blue one.' } } },
        } as never);
        await b.done;
        const messages = second.bodies[0]!['messages'] as { role: string }[];
        expect(messages.at(-1)).toEqual({ id: 'aparte-result-q1', role: 'tool', toolCallId: 'q1', content: 'The blue one.' });
        expect(second.bodies[0]!['resume']).toBeUndefined();
        // The agent echoes nothing for a frontend tool: the runner settles the row itself,
        // with the result the page holds (a receipt reads it), before the agent's answer.
        expect(b.types().slice(0, 4)).toEqual(['run-start', 'turn-start', 'tool-resolved', 'text-delta']);
        expect(b.events.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'q1', result: 'The blue one.' });
    });

    it('sends a frontend tool the page refused back as its tool message, and marks the row refused', async () => {
        const second = fakeFetch(sse({ type: 'RUN_STARTED' }, { type: 'TEXT_MESSAGE_CONTENT', delta: 'Understood.' }, { type: 'RUN_FINISHED' }));
        const b = run(second.fetch, {
            baseRequest: { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'ask_user', input: {} }] }], modelId: 'x', stream: true, tools: [weather] },
            deferral: { token: JSON.stringify({ v: 1, threadId: 't', runId: 'r', interrupts: [] }), outcomes: { q1: { kind: 'decision', approved: false, reason: 'Not now.' } } },
        } as never);
        await b.done;
        const messages = second.bodies[0]!['messages'] as { role: string }[];
        expect(messages.at(-1)).toEqual({ id: 'aparte-result-q1', role: 'tool', toolCallId: 'q1', content: 'Not now.' });
        expect(b.events.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'q1', reason: 'Not now.' });
    });

    it('answers a client-tool interrupt (TanStack AI) in the resume batch, a failure marked as one', async () => {
        const a = run(fakeFetch(sse(
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'q1', toolCallName: 'ask_user' },
            { type: 'TOOL_CALL_END', toolCallId: 'q1' },
            finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i9', reason: 'tanstack:client_tool_execution', toolCallId: 'q1' }] } }),
        )).fetch);
        await a.done;
        expect(a.events.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'q1', reason: 'external' }] });
        const ticket = String(a.events.at(-1)!['ticket']);
        const ok = fakeFetch(sse({ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' }));
        await run(ok.fetch, { deferral: { token: ticket, outcomes: { q1: { kind: 'result', content: 'Blue', structuredContent: { color: 'blue' } } } } } as never).done;
        expect(ok.bodies[0]!['resume']).toEqual([{ interruptId: 'i9', status: 'resolved', payload: { color: 'blue' } }]);
        const failed = fakeFetch(sse({ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' }));
        await run(failed.fetch, { deferral: { token: ticket, outcomes: { q1: { kind: 'failed', error: 'No answer.' } } } } as never).done;
        expect(failed.bodies[0]!['resume']).toEqual([{ interruptId: 'i9', status: 'resolved', payload: { error: 'No answer.' }, metadata: { tanstack: { state: 'output-error' } } }]);
    });

    it('names a call paused again in a later run, from the history or from the interrupt', async () => {
        const a = run(fakeFetch(interruptRun()).fetch);
        await a.done;
        // TanStack AI: approved, the same call now asks the page to run it.
        const again = run(fakeFetch(sse(
            { type: 'RUN_STARTED', runId: 'r2' },
            { type: 'RUN_FINISHED', runId: 'r2', outcome: { type: 'interrupt', interrupts: [{ id: 'client_tool_d1', reason: 'tanstack:client_tool_execution', toolCallId: 'd1' }] } },
        )).fetch, {
            baseRequest: { messages: [{ role: 'assistant', content: '', toolCalls: [{ id: 'd1', name: 'delete_file', input: { path: '/x' } }] }], modelId: 'x', stream: true },
            deferral: { token: String(a.events.at(-1)!['ticket']), outcomes: { d1: { kind: 'decision', approved: true } } },
        } as never);
        await again.done;
        expect(again.events.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'd1', name: 'delete_file', input: { path: '/x' }, reason: 'external' }] });

        // Nothing streamed and nothing in the history: the interrupt describes the call.
        const described = run(fakeFetch(sse(started, finished({
            outcome: { type: 'interrupt', interrupts: [{ id: 'i2', reason: 'tool_call', toolCallId: 'w1', metadata: { toolName: 'get_weather', input: { city: 'Lille' } } }] },
        }))).fetch);
        await described.done;
        expect(described.events.find((e) => e.type === 'tool-awaiting-approval')).toMatchObject({ toolCallId: 'w1', name: 'get_weather', input: { city: 'Lille' } });
    });

    it('reads a damaged ticket as no ticket, rather than failing on it', async () => {
        const f = fakeFetch(sse(started, finished()));
        const r = run(f.fetch, { deferral: { token: '{"v":1,"threadId":"t","runId":"r","interrupts":"x"}', outcomes: {} } } as never);
        await expect(r.done).resolves.toBeUndefined();
        expect(f.bodies[0]!['resume']).toBeUndefined();
        expect(f.bodies[0]!['threadId']).not.toBe('t');
    });

    it('fails clearly on an interrupt it cannot answer yet', async () => {
        const r = run(fakeFetch(sse(started, finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i', reason: 'input_required' }] } }))).fetch);
        await expect(r.done).rejects.toThrow('interrupt reason "input_required"');
    });
});
