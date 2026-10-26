// @vitest-environment node
/**
 * The Agents SDK agent over AG-UI, end to end on the server: the real `Runner` runs the real
 * agent and its tool, the model is the SDK's own `ScriptedModel`, and what comes out is read
 * twice — by AG-UI's own schemas, event by event, and by aparté's AG-UI runner, the strict
 * reader the page uses. No key, no network.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi } from 'vitest';
import { EventSchemas } from '@ag-ui/core/schemas';
import { OpenAIProvider, Runner } from '@openai/agents';
import { ScriptedModel, modelError } from '@openai/agents/testing';
import { createAgUiRunner } from '@aparte/runner-ag-ui';
import type { AparteStreamRunOptions } from '@aparte/core';
import { handleAgUi, toAgentInput } from '../ag-ui.js';
import { supportAgent } from '../agent.js';
import { DemoModel } from '../demo-model.js';
import { runnerFromEnv } from '../model.js';

type AgUiEvent = { type: string; [key: string]: unknown };

const keyless = () => new Runner({ model: new DemoModel(0), tracingDisabled: true });

function input(messages: unknown[], extra: object = {}) {
    return { threadId: 't1', runId: 'r1', state: {}, messages, tools: [], context: [], forwardedProps: {}, ...extra };
}

function post(body: unknown, signal?: AbortSignal): Request {
    return new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify(body), signal });
}

/** The response's server-sent events, each checked against AG-UI's own schema. */
async function eventsOf(response: Response): Promise<AgUiEvent[]> {
    const text = await response.text();
    return text.split('\n\n').filter(Boolean).map((frame) => {
        expect(frame.startsWith('data: ')).toBe(true);
        const event = JSON.parse(frame.slice('data: '.length)) as AgUiEvent;
        const checked = EventSchemas.safeParse(event);
        expect(checked.success, `${event.type} is a valid AG-UI event`).toBe(true);
        return event;
    });
}

const textOf = (events: AgUiEvent[]) => events.filter((e) => e.type === 'TEXT_MESSAGE_CONTENT').map((e) => e.delta).join('');

describe('handleAgUi: the stream an Agents SDK agent becomes', () => {
    it('runs the tool and streams the answer, framed as one AG-UI run', async () => {
        const response = await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Where is order 1042?' }])), supportAgent, keyless());
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/event-stream');
        const events = await eventsOf(response);
        expect(events.map((e) => e.type)).toEqual([
            'RUN_STARTED',
            'TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT',
            'TEXT_MESSAGE_START',
            ...events.filter((e) => e.type === 'TEXT_MESSAGE_CONTENT').map(() => 'TEXT_MESSAGE_CONTENT'),
            'TEXT_MESSAGE_END',
            'RUN_FINISHED',
        ]);
        expect(events[0]).toMatchObject({ threadId: 't1', runId: 'r1' });
        expect(events.at(-1)).toMatchObject({ threadId: 't1', runId: 'r1' });

        const [start, args, end, result] = events.slice(1, 5);
        expect(start).toMatchObject({ toolCallName: 'get_order_status' });
        expect([args!.toolCallId, end!.toolCallId, result!.toolCallId]).toEqual([start!.toolCallId, start!.toolCallId, start!.toolCallId]);
        expect(JSON.parse(args!.delta as string)).toEqual({ orderNumber: '1042' });
        // The result is what the tool's `execute` returned, run by the SDK on the server.
        expect(JSON.parse(result!.content as string)).toMatchObject({ orderNumber: '1042', status: 'shipped' });
        expect(textOf(events)).toBe('Order 1042 has shipped with La Poste and arrives in 2 days.');
        expect(events.filter((e) => e.type === 'TEXT_MESSAGE_CONTENT').length).toBeGreaterThan(1);
    });

    it('streams a plain answer with no tool call', async () => {
        const events = await eventsOf(await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Hello' }])), supportAgent, keyless()));
        expect(events.some((e) => e.type.startsWith('TOOL_CALL'))).toBe(false);
        expect(textOf(events)).toMatch(/^This demo runs on a scripted model, with no API key\./);
    });

    it('turns a model failure into RUN_ERROR, after RUN_STARTED', async () => {
        const failing = new Runner({ model: new ScriptedModel([modelError(new Error('The model is overloaded.'))]), tracingDisabled: true });
        const events = await eventsOf(await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Hi' }])), supportAgent, failing));
        expect(events.map((e) => e.type)).toEqual(['RUN_STARTED', 'RUN_ERROR']);
        expect(events[1]!.message).toContain('The model is overloaded.');
    });

    it('answers 422 to a body that is not a RunAgentInput, before running anything', async () => {
        const runner = keyless();
        const spy = vi.spyOn(runner, 'run');
        const response = await handleAgUi(post({ messages: 'nope' }), supportAgent, runner);
        expect(response.status).toBe(422);
        expect(await response.text()).toMatch(/^Not an AG-UI RunAgentInput: /);
        const garbled = await handleAgUi(new Request('http://localhost/agent', { method: 'POST', body: '{' }), supportAgent, runner);
        expect(garbled.status).toBe(422);
        expect(spy).not.toHaveBeenCalled();
    });

    it("stops the agent's run when the request is aborted — Stop reaches the server", async () => {
        const controller = new AbortController();
        const slow = new Runner({ model: new DemoModel(50), tracingDisabled: true });
        const started = Date.now();
        const response = await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Hello' }]), controller.signal), supportAgent, slow);
        const reader = response.body!.getReader();
        await reader.read();
        controller.abort();
        let text = '';
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) text += new TextDecoder().decode(chunk.value);
        // The whole reply would take ~27 words × 50 ms; the run ended on the abort instead.
        expect(Date.now() - started).toBeLessThan(1000);
        const events = await eventsOf(new Response(text));
        expect(events.at(-1)).toMatchObject({ type: 'RUN_FINISHED', outcome: { type: 'cancelled' } });
        expect(text).not.toContain('to watch the agent call its tool.');
    });

    it('stops writing when the reader goes away, without an unhandled error', async () => {
        const slow = new Runner({ model: new DemoModel(20), tracingDisabled: true });
        const response = await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Hello' }])), supportAgent, slow);
        const reader = response.body!.getReader();
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toContain('RUN_STARTED');
        await reader.cancel();
        await new Promise((resolve) => setTimeout(resolve, 200));
    });
});

describe('toAgentInput: the history the agent reads', () => {
    it('keeps what the person and the assistant said, as text, and drops the rest', () => {
        const items = toAgentInput([
            { id: 's', role: 'system', content: 'Be brief.' },
            { id: 'u1', role: 'user', content: [{ type: 'text', text: 'Where is ' }, { type: 'text', text: 'order 7?' }] },
            { id: 'a1', role: 'assistant', content: 'It shipped.', toolCalls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{}' } }] },
            { id: 't', role: 'tool', content: '{}', toolCallId: 'c' },
            { id: 'a2', role: 'assistant' },
            { id: 'u2', role: 'user', content: 'Thanks' },
        ] as Parameters<typeof toAgentInput>[0]);
        // The SDK's own `user()` and `assistant()` helpers: input_text and output_text parts.
        expect(items).toEqual([
            expect.objectContaining({ role: 'user', content: [expect.objectContaining({ type: 'input_text', text: 'Where is order 7?' })] }),
            expect.objectContaining({ role: 'assistant', content: [expect.objectContaining({ type: 'output_text', text: 'It shipped.' })] }),
            expect.objectContaining({ role: 'user', content: [expect.objectContaining({ type: 'input_text', text: 'Thanks' })] }),
        ]);
    });

    it('carries an earlier turn into the next one', async () => {
        const model = new DemoModel(0);
        const spy = vi.spyOn(model, 'getStreamedResponse');
        await eventsOf(await handleAgUi(post(input([
            { id: 'u1', role: 'user', content: 'Where is order 1042?' },
            { id: 'a1', role: 'assistant', content: 'Order 1042 has shipped.' },
            { id: 'u2', role: 'user', content: 'Thanks!' },
        ])), supportAgent, new Runner({ model, tracingDisabled: true })));
        const sent = spy.mock.calls[0]![0].input as { role?: string }[];
        expect(sent.map((item) => item.role)).toEqual(['user', 'assistant', 'user']);
    });
});

describe("aparté's AG-UI runner reads the stream", () => {
    it('draws the tool row, its result and the answer, and ends the run without an error', async () => {
        const runner = keyless();
        const fetch = (async (url: string | URL | Request, init?: RequestInit) =>
            handleAgUi(new Request(new URL(String(url), 'http://localhost'), init), supportAgent, runner)) as typeof globalThis.fetch;
        const events: { type: string; [key: string]: unknown }[] = [];
        await createAgUiRunner({ endpoint: '/agent', fetch, onWarning: (message) => { throw new Error(`runner warned: ${message}`); } })({
            messageId: 'm1',
            providerId: 'agent',
            baseRequest: { messages: [{ role: 'user', content: 'Where is order 1042?' }], modelId: 'x', stream: true },
            transportCall: async () => { throw new Error('never called'); },
            toolLookup: () => undefined,
            emitter: (event: { type: string }) => { events.push(event as { type: string }); },
            signal: new AbortController().signal,
        } as unknown as AparteStreamRunOptions);
        const types = events.map((e) => e.type);
        expect(types).not.toContain('error');
        expect(types.at(-1)).toBe('run-done');
        const text = events.filter((e) => e.type === 'text-delta').map((e) => e.delta ?? e.text).join('');
        expect(text).toBe('Order 1042 has shipped with La Poste and arrives in 2 days.');
        expect(JSON.stringify(events)).toContain('get_order_status');
    });
});

/**
 * A Chat Completions server on a local port — what Mistral, Groq, OpenRouter, Ollama and
 * llama.cpp all speak: a streamed tool call first, then, once the tool's result comes back,
 * the answer built on it.
 */
async function chatCompletionsServer(): Promise<{ url: string; requests: { stream: boolean; tools: string[]; roles: string[] }[]; close: () => Promise<void> }> {
    const requests: { stream: boolean; tools: string[]; roles: string[] }[] = [];
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw) as { model: string; stream: boolean; tools?: { function: { name: string } }[]; messages: { role: string; content?: string }[] };
        requests.push({ stream: body.stream, tools: (body.tools ?? []).map((t) => t.function.name), roles: body.messages.map((m) => m.role) });
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const chunk = (delta: object, finish: string | null = null) =>
            res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
        const tool = body.messages.find((m) => m.role === 'tool');
        if (!tool) {
            chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'get_order_status', arguments: '' } }] });
            chunk({ tool_calls: [{ index: 0, function: { arguments: '{"orderNumber":' } }] });
            chunk({ tool_calls: [{ index: 0, function: { arguments: '"1042"}' } }] });
            chunk({}, 'tool_calls');
        } else {
            chunk({ role: 'assistant', content: 'It has ' });
            chunk({ content: (JSON.parse(tool.content ?? '{}') as { status: string }).status });
            chunk({ content: '.' }, 'stop');
        }
        res.end('data: [DONE]\n\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/v1`,
        requests,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}

describe('the same agent on any Chat Completions server', () => {
    it("runs over HTTP through the SDK's own client: the tool call streamed in pieces, its result sent back, the answer streamed", async () => {
        const upstream = await chatCompletionsServer();
        try {
            const runner = runnerFromEnv({ MODEL_BASE_URL: upstream.url, MODEL: 'any-model' });
            const events = await eventsOf(await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Where is order 1042?' }])), supportAgent, runner));
            expect(events.map((e) => e.type)).toEqual([
                'RUN_STARTED',
                'TOOL_CALL_START', 'TOOL_CALL_ARGS', 'TOOL_CALL_END', 'TOOL_CALL_RESULT',
                'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END',
                'RUN_FINISHED',
            ]);
            expect(JSON.parse(events[2]!.delta as string)).toEqual({ orderNumber: '1042' });
            expect(textOf(events)).toBe('It has shipped.');
            expect(upstream.requests).toEqual([
                { stream: true, tools: ['get_order_status'], roles: ['system', 'user'] },
                { stream: true, tools: ['get_order_status'], roles: ['system', 'user', 'assistant', 'tool'] },
            ]);
        } finally {
            await upstream.close();
        }
    });
});

describe('runnerFromEnv: the model, from the environment', () => {
    it('runs keyless on the scripted model when nothing is set, with tracing off', () => {
        const runner = runnerFromEnv({});
        expect(runner.config.model).toBeInstanceOf(DemoModel);
        expect(runner.config.tracingDisabled).toBe(true);
    });

    it('paces the scripted words from DEMO_DELAY_MS', async () => {
        const runner = runnerFromEnv({ DEMO_DELAY_MS: '0' });
        const started = Date.now();
        await eventsOf(await handleAgUi(post(input([{ id: 'u1', role: 'user', content: 'Hello' }])), supportAgent, runner));
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('calls any Chat Completions server from MODEL_BASE_URL, and asks for MODEL', () => {
        const runner = runnerFromEnv({ MODEL_BASE_URL: 'http://localhost:11434/v1', MODEL: 'llama3.2' });
        expect(runner.config.model).toBe('llama3.2');
        expect(runner.config.modelProvider).toBeInstanceOf(OpenAIProvider);
        expect(runner.config.tracingDisabled).toBe(true);
        expect(() => runnerFromEnv({ MODEL_BASE_URL: 'http://localhost:11434/v1' })).toThrow(/set MODEL/);
    });

    it('uses OpenAI with a key, on MODEL or the default, with tracing on', () => {
        const runner = runnerFromEnv({ OPENAI_API_KEY: 'sk-test', MODEL: 'gpt-test' });
        expect(runner.config.model).toBe('gpt-test');
        expect(runner.config.tracingDisabled).toBe(false);
        expect(runnerFromEnv({ OPENAI_API_KEY: 'sk-test' }).config.model).not.toBeInstanceOf(DemoModel);
    });
});
