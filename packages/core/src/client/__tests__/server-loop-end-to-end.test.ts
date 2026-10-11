// @vitest-environment jsdom
/**
 * The server loop, end to end, in memory: the real handler, the real runner, the real
 * client and the real engine, with only the network replaced by a function call.
 *
 * What this pins that no unit test can: the page serialises a paused reply (its envelope
 * and the calls left open) exactly as the server's `unansweredTail` reads it, so the
 * signed ticket matches — now, and after the conversation was saved and reloaded.
 */
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import { createAparteAgentHandler } from '../../transport/agent-handler.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

/** The model each server call ran on. */
const models: (string | undefined)[] = [];

/** A server-side provider whose `chat()` answers each call with the next scripted turn. */
function scriptedProvider(...turns: object[][]): AparteAIProvider {
    return {
        id: 'mock', name: 'Mock',
        async chat(request: { modelId?: string }) {
            models.push(request.modelId);
            const events = turns.shift() ?? [{ type: 'text', delta: 'end' }, { type: 'done' }];
            return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
        },
    } as unknown as AparteAIProvider;
}

function server(provider: AparteAIProvider, defaultModel?: string) {
    const ran: string[] = [];
    const handler = createAparteAgentHandler({
        providers: { mock: provider },
        ...(defaultModel ? { defaultModel } : {}),
        authorize: () => true,
        secret: 'e2e-secret-that-is-at-least-32-characters',
        crypto: webcrypto.subtle as unknown as SubtleCrypto,
        tools: [{
            tool: { name: 'delete_file', description: 'Delete a file.', inputSchema: { type: 'object' }, needsApproval: true },
            handler: async (call) => { ran.push(String(call.input['path'])); return { toolCallId: call.id, content: 'deleted' }; },
        }],
    });
    // The network, replaced: the runner's fetch calls the handler. (jsdom's AbortSignal is
    // not Node's, so the signal stays on this side; aborts are covered by the unit tests.)
    const fetch = (async (url: string, init: RequestInit) =>
        handler(new Request(`http://x${url}`, { method: init.method, headers: init.headers, body: init.body }))) as unknown as typeof globalThis.fetch;
    return { fetch, ran };
}

function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
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
    return { el, messages };
}

function client(el: HTMLElement, fetch: typeof globalThis.fetch, approvalResolver: unknown, pageProvider = true) {
    const cfg = new AparteConfig();
    if (pageProvider) cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    if (pageProvider) cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    return new AparteClient({
        config: cfg, autoRegister: false, targetResolver: () => el as never,
        streamRunner: createAgentStreamRunner({ endpoint: '/api/agent', fetch }),
        approvalResolver,
    } as never);
}

const send = (c: AparteClient, content: string) =>
    (c as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content } }));

const turnDeleting = [{ type: 'text', delta: 'Deleting it.' }, { type: 'tool_use', id: 'c1', name: 'delete_file', input: { path: 'a' } }, { type: 'done' }];
const turnDone = [{ type: 'text', delta: 'Deleted.' }, { type: 'done' }];
const texts = (m: AparteMessage | undefined) => (m?.segments ?? []).filter((s) => s.type === 'text').map((s) => (s as { content: string }).content);
const callRow = (m: AparteMessage | undefined) => m?.segments?.find((s) => s.type === 'tool_call') as { status: string; deferred?: { ticket?: string } } | undefined;

describe('the server loop, end to end', () => {
    it('pauses on the server, asks in the page, and finishes the reply after the approval', async () => {
        const { fetch, ran } = server(scriptedProvider(turnDeleting, turnDone));
        const { el, messages } = chat();
        await send(client(el, fetch, async () => ({ approved: true })), 'delete a');

        const reply = messages.at(-1);
        expect(callRow(reply)?.status).toBe('resolved');
        expect(texts(reply).join(' ')).toContain('Deleted.');
        expect(ran).toEqual(['a']);
    });

    it('resumes the paused approval after the conversation was saved and reloaded', async () => {
        const { fetch, ran } = server(scriptedProvider(turnDeleting, turnDone));

        // First page: the person leaves while the panel waits.
        const first = chat();
        let saved: AparteMessage[] = [];
        const c1: AparteClient = client(first.el, fetch, async () => {
            saved = structuredClone(first.messages);
            c1.abort();
            return { approved: false };
        });
        await send(c1, 'delete a');
        expect(ran).toEqual([]);
        expect(callRow(saved.at(-1))?.deferred?.ticket).toBeTruthy();

        // Days later: the saved conversation is loaded; the paused call resumes.
        const second = chat(saved);
        const c2 = client(second.el, fetch, async () => ({ approved: true }));
        expect(await c2.resumeDeferred(second.el)).toBe(true);

        const reply = second.messages.at(-1);
        expect(callRow(reply)?.status).toBe('resolved');
        expect(texts(reply).join(' ')).toContain('Deleted.');
        expect(ran).toEqual(['a']);
    });

    it('runs with no provider in the page: the server picks its own, and its model (#100)', async () => {
        models.length = 0;
        const { fetch, ran } = server(scriptedProvider(turnDeleting, turnDone), 'server-model');

        // The guide's browser half, and nothing else: no provider, no model selected.
        const first = chat();
        let saved: AparteMessage[] = [];
        const c1: AparteClient = client(first.el, fetch, async () => {
            saved = structuredClone(first.messages);
            c1.abort();
            return { approved: false };
        }, false);
        await send(c1, 'delete a');
        expect(callRow(saved.at(-1))?.status).toBe('awaiting-approval');
        // Nothing to record: the page did not choose the model.
        expect(saved.at(-1)?.model).toBeUndefined();

        // And a reload still resumes it.
        const second = chat(saved);
        const c2 = client(second.el, fetch, async () => ({ approved: true }), false);
        expect(await c2.resumeDeferred(second.el)).toBe(true);
        const reply = second.messages.at(-1);
        expect(callRow(reply)?.status).toBe('resolved');
        expect(texts(reply).join(' ')).toContain('Deleted.');
        expect(ran).toEqual(['a']);
        expect(models).toEqual(['server-model', 'server-model']);
    });
});
