// @vitest-environment jsdom
/**
 * A server run that resumes names its sub-agents anew.
 *
 * Each request to the agent endpoint is a run of its own, and the engine's default id
 * generator is a counter per run: the first sub-agent of every run was `agent-0`, the resume
 * of a paused reply included. A page that keeps a reply's sub-agents across its pause — as
 * it must, the run resumes into the same reply — took the second for the first one resumed.
 * The handler now mints the ids the way the browser client does, so they cannot repeat.
 *
 * The real handler, runner, client and engine; only the network is a function call.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import { runSubAgent, type AparteStreamRunEvent } from '../stream-adapter.js';
import { createAparteAgentHandler } from '../../transport/agent-handler.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

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
    const handler = createAparteAgentHandler({
        providers: { mock: provider },
        defaultModel: 'm',
        authorize: () => true,
        secret: 'resume-secret-that-is-at-least-32-characters',
        crypto: webcrypto.subtle as unknown as SubtleCrypto,
        tools: [
            {
                tool: { name: 'delegate', description: 'Hand a task over.', inputSchema: { type: 'object' } },
                handler: async (call, signal, context) => {
                    const child = await runSubAgent(context!.run!, {
                        name: String(call.input['task']),
                        request: { modelId: 'm', messages: [{ role: 'user', content: 'go' }] },
                    }, signal);
                    return { toolCallId: call.id, content: child.text };
                },
            },
            {
                tool: { name: 'delete_file', description: 'Delete a file.', inputSchema: { type: 'object' }, needsApproval: true },
                handler: async (call) => ({ toolCallId: call.id, content: 'deleted' }),
            },
        ],
    });
    return (async (url: string, init: RequestInit) =>
        handler(new Request(`http://x${url}`, { method: init.method, headers: init.headers, body: init.body }))) as unknown as typeof globalThis.fetch;
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

afterEach(() => { document.body.innerHTML = ''; });

describe('a resumed server run', () => {
    it('gives the sub-agent it opens an id the paused run did not give', async () => {
        const fetch = server(scriptedProvider(
            // The paused run: a sub-agent on c1, then a call that waits for a person.
            [{ type: 'tool_use', id: 'c1', name: 'delegate', input: { task: 'first' } }, { type: 'tool_use', id: 'd1', name: 'delete_file', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'From the first.' }, { type: 'done' }],
            // The resume: the model delegates again, on c3.
            [{ type: 'tool_use', id: 'c3', name: 'delegate', input: { task: 'second' } }, { type: 'done' }],
            [{ type: 'text', delta: 'From the second.' }, { type: 'done' }],
            [{ type: 'text', delta: 'Done.' }, { type: 'done' }],
        ));
        const cfg = new AparteConfig();
        cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        const seen: AparteStreamRunEvent[] = [];
        cfg.observeRunEvents((e) => { seen.push(e); });
        const { el, messages } = chat(cfg);
        const client = new AparteClient({
            config: cfg, autoRegister: false, targetResolver: () => el as never,
            streamRunner: createAgentStreamRunner({ endpoint: '/api/agent', fetch }),
            approvalResolver: async () => ({ approved: true }),
        } as never);
        await send(client, 'go');

        expect(messages.at(-1)?.status).toBe('completed');
        const starts = seen.filter((e): e is Extract<AparteStreamRunEvent, { type: 'agent-start' }> => e.type === 'agent-start');
        expect(starts.map((s) => [s.name, s.toolCallId])).toEqual([['first', 'c1'], ['second', 'c3']]);
        expect(starts[0]!.agentId).not.toBe(starts[1]!.agentId);
        // Each one's text is its own.
        const textOf = (agentId: string) => seen
            .filter((e) => e.type === 'text-delta' && (e as { agentId?: string }).agentId === agentId)
            .map((e) => (e as { delta: string }).delta).join('');
        expect(textOf(starts[0]!.agentId)).toBe('From the first.');
        expect(textOf(starts[1]!.agentId)).toBe('From the second.');
    });
});
