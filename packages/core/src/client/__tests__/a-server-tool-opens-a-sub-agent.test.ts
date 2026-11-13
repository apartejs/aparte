// @vitest-environment jsdom
/**
 * A server tool opens a sub-agent, and the page sees it as one.
 *
 * The real handler, runner, client and engine, with only the network replaced by a function
 * call. A tool on the server is handed the run (`context.run`) and runs a sub-agent through
 * it; the NDJSON wire carries `agent-start` … `agent-end` like any other event; the page
 * ends the turn on the parent's `run-done` only — and a hand-written backend that sends a
 * `run-done` for a sub-agent does not end it either.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import { runSubAgent, type AparteStreamRunEvent } from '../stream-adapter.js';
import { createAparteAgentHandler } from '../../transport/agent-handler.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteToolContext } from '../../types/tools.js';

/** A server-side provider whose `chat()` answers each call with the next scripted turn. */
function scriptedProvider(...turns: object[][]): AparteAIProvider {
    return {
        id: 'mock', name: 'Mock',
        async chat() {
            const events = turns.shift() ?? [{ type: 'done' }];
            return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
        },
    } as unknown as AparteAIProvider;
}

function server(provider: AparteAIProvider) {
    const contexts: (AparteToolContext | undefined)[] = [];
    const handler = createAparteAgentHandler({
        providers: { mock: provider },
        defaultModel: 'm',
        authorize: () => true,
        secret: 'e2e-secret-that-is-at-least-32-characters',
        crypto: webcrypto.subtle as unknown as SubtleCrypto,
        tools: [{
            tool: { name: 'delegate', description: 'Hand a task to a researcher.', inputSchema: { type: 'object' } },
            handler: async (call, signal, context) => {
                contexts.push(context);
                const child = await runSubAgent(context!.run!, {
                    name: 'researcher',
                    request: { modelId: 'm', messages: [{ role: 'user', content: 'Read the parser.' }] },
                }, signal);
                return { toolCallId: call.id, content: child.text };
            },
        }],
    });
    const fetch = (async (url: string, init: RequestInit) =>
        handler(new Request(`http://x${url}`, { method: init.method, headers: init.headers, body: init.body }))) as unknown as typeof globalThis.fetch;
    return { fetch, contexts };
}

function chat(config: AparteConfig) {
    const messages: AparteMessage[] = [];
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    const owner = (id: string) => [...messages].reverse().find((m) => m.segments?.some((s) => s.id === id));
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => { const m = messages.find((x) => x.id === id); if (m) Object.assign(m, u); },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = owner(id);
            if (m) m.segments = m.segments!.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    document.body.appendChild(el);
    attachConfig(el, config);
    return { el, messages };
}

const send = (c: AparteClient, content: string) =>
    (c as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content } }));

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a server tool that opens a sub-agent', () => {
    it('is drawn on the page as a sub-agent, and the turn ends on the parent\'s run-done', async () => {
        const { fetch, contexts } = server(scriptedProvider(
            [{ type: 'tool_use', id: 'c1', name: 'delegate', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'From the child.' }, { type: 'done' }],
            [{ type: 'text', delta: 'Done.' }, { type: 'done' }],
        ));
        const cfg = new AparteConfig();
        const seen: AparteStreamRunEvent[] = [];
        cfg.observeRunEvents((e) => { seen.push(e); });
        const { el, messages } = chat(cfg);
        const client = new AparteClient({
            config: cfg, autoRegister: false, targetResolver: () => el as never,
            streamRunner: createAgentStreamRunner({ endpoint: '/api/agent', fetch }),
        } as never);
        await send(client, 'look into it');

        // The handler was handed the run, the way a page tool is.
        expect(typeof contexts[0]?.run?.startAgent).toBe('function');
        expect(contexts[0]?.request).toBeInstanceOf(Request);

        // agent-start … agent-end crossed the wire, tied to the call, inside it.
        const types = seen.map((e) => e.type);
        const start = seen.find((e) => e.type === 'agent-start') as Extract<AparteStreamRunEvent, { type: 'agent-start' }>;
        expect(start).toMatchObject({ name: 'researcher', toolCallId: 'c1' });
        const childText = seen.find((e) => e.type === 'text-delta' && (e as { agentId?: string }).agentId === start.agentId);
        expect(childText).toMatchObject({ delta: 'From the child.' });
        expect(types.indexOf('agent-end')).toBeLessThan(types.findIndex((t, i) => t === 'tool-resolved' && (seen[i] as { agentId?: string }).agentId === undefined));
        expect(types.filter((t) => t === 'run-done')).toHaveLength(1);
        expect(types.at(-1)).toBe('run-done');

        // The reply: the call, answered with what the child said, then the parent's text.
        const reply = messages.at(-1)!;
        expect(reply.status).toBe('completed');
        const call = reply.segments?.find((s) => s.type === 'tool_call') as { status: string; result?: string } | undefined;
        expect(call).toMatchObject({ status: 'resolved', result: 'From the child.' });
        const texts = (reply.segments ?? []).filter((s) => s.type === 'text').map((s) => (s as { content: string }).content);
        expect(texts).toEqual(['Done.']);
    });
});

describe('a hand-written backend', () => {
    it('cannot end the turn with a sub-agent\'s run-done', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const lines = [
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', toolCallId: 'c1' },
            { type: 'text-delta', delta: 'child', agentId: 'a1' },
            { type: 'run-done', agentId: 'a1' },
            { type: 'run-suspended', pending: [], agentId: 'a1' },
            { type: 'agent-end', agentId: 'a1', status: 'done' },
        ];
        const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
        const fetch = (async () => new Response(body, { status: 200 })) as unknown as typeof globalThis.fetch;
        const emitted: string[] = [];
        const run = createAgentStreamRunner({ endpoint: '/api/agent', fetch })({
            messageId: 'm1',
            baseRequest: { messages: [] },
            emitter: (e: AparteStreamRunEvent) => { emitted.push(e.type); },
            signal: new AbortController().signal,
        } as never);

        // The stream closed with no run-done of the parent's: it ended unexpectedly.
        await expect(run).rejects.toThrow(/ended unexpectedly/);
        expect(emitted).toEqual(['run-start', 'turn-start', 'tool-start', 'agent-start', 'text-delta', 'agent-end']);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
