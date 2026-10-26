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
import { AparteErrorCode } from '../../types/errors.js';
import type { AparteCompactorOutcome } from '../../types/compactor.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import type { AparteStreamRunner } from '../stream-adapter.js';
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

function client(el: HTMLElement, fetch: typeof globalThis.fetch, approvalResolver: unknown, pageProvider = true, configure?: (cfg: AparteConfig) => void) {
    const cfg = new AparteConfig();
    configure?.(cfg);
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

    it('a page-only side effect rides the runner: one request, no pause, nothing replayed on reload (#103)', async () => {
        // The guide's recipe: `open_file` is a SERVER tool that answers "opened", and the
        // page wraps the runner's emitter to open the file when the call resolves.
        const opened: unknown[] = [];
        let requests = 0;
        const handler = createAparteAgentHandler({
            providers: { mock: scriptedProvider(
                [{ type: 'text', delta: 'Opening it.' }, { type: 'tool_use', id: 'o1', name: 'open_file', input: { path: 'about.md' } }, { type: 'done' }],
                [{ type: 'text', delta: 'There it is.' }, { type: 'done' }],
            ) },
            authorize: () => true,
            secret: 'e2e-secret-that-is-at-least-32-characters',
            crypto: webcrypto.subtle as unknown as SubtleCrypto,
            tools: [{
                tool: { name: 'open_file', description: 'Open a file in the editor.', inputSchema: { type: 'object' } },
                handler: async (call) => ({ toolCallId: call.id, content: 'opened' }),
            }],
        });
        const fetch = (async (url: string, init: RequestInit) => {
            requests++;
            return handler(new Request(`http://x${url}`, { method: init.method, headers: init.headers, body: init.body }));
        }) as unknown as typeof globalThis.fetch;

        const runner = createAgentStreamRunner({ endpoint: '/api/agent', fetch });
        const openingFiles: AparteStreamRunner = (opts) => {
            const calls = new Map<string, { name: string; input: unknown }>();
            return runner({
                ...opts,
                emitter: (event) => {
                    if (event.type === 'tool-start') calls.set(event.toolCallId, { name: event.name, input: event.input });
                    if (event.type === 'tool-resolved' && calls.get(event.toolCallId)?.name === 'open_file') {
                        opened.push(calls.get(event.toolCallId)!.input);
                    }
                    opts.emitter(event);
                },
            });
        };
        const page = (el: HTMLElement) => new AparteClient({
            config: new AparteConfig(), autoRegister: false, targetResolver: () => el as never,
            streamRunner: openingFiles,
        } as never);

        const first = chat();
        await send(page(first.el), 'open about');
        expect(requests).toBe(1);
        expect(opened).toEqual([{ path: 'about.md' }]);
        expect(callRow(first.messages.at(-1))?.status).toBe('resolved');
        expect(callRow(first.messages.at(-1))?.deferred).toBeUndefined();
        expect(texts(first.messages.at(-1)).join(' ')).toContain('There it is.');

        // Reloaded: the transcript is drawn again, the runner is not run, the file stays shut.
        const second = chat(structuredClone(first.messages));
        expect(await page(second.el).resumeDeferred(second.el)).toBe(false);
        expect(opened).toHaveLength(1);
        expect(requests).toBe(1);
    });
});

describe('a server loop that overflows the model window', () => {
    // The provider streams the refusal after a 200, the way LM Studio and llama.cpp do: the
    // engine on the SERVER throws it as a plain Error carrying the code, the handler sends it
    // as `run-error`, and the runner on the page throws it. Each of the three used to turn
    // the code into something else, so the client never saw an overflow.
    const overflowing = [{ type: 'error', message: 'Context size has been exceeded.', code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED }];
    const COMPACTED: AparteCompactorOutcome = { ok: true, skipped: false, summary: 's', kept: 2, dropped: 2 };

    const withCompactor = (cfg: AparteConfig, compact: () => Promise<AparteCompactorOutcome>) =>
        cfg.setCompactor({ compact, settled: async () => {}, beforeSend: async () => false });
    const errorOf = (m: AparteMessage | undefined) => m?.segments?.find((s) => s.type === 'error') as { code?: string } | undefined;

    it('is compacted and sent once more, into the same reply', async () => {
        const provider = scriptedProvider(overflowing, [{ type: 'text', delta: 'Fits now.' }, { type: 'done' }]);
        const { fetch } = server(provider);
        const { el, messages } = chat();
        let compactions = 0;
        await send(client(el, fetch, undefined, true, (cfg) => withCompactor(cfg, async () => { compactions++; return COMPACTED; })), 'a long question');

        expect(compactions).toBe(1);
        const reply = messages.at(-1);
        expect(texts(reply).join(' ')).toContain('Fits now.');
        expect(reply?.status).toBe('completed');
        expect(errorOf(reply)).toBeUndefined();
    });

    it('stands as an error carrying the overflow code when a second try overflows too', async () => {
        const { fetch } = server(scriptedProvider(overflowing, overflowing));
        const { el, messages } = chat();
        let compactions = 0;
        const c = client(el, fetch, undefined, true, (cfg) => withCompactor(cfg, async () => { compactions++; return COMPACTED; }));
        const raised: string[] = [];
        window.addEventListener('aparte-message-error', (e) => raised.push((e as CustomEvent).detail?.error?.code), { once: true });
        await send(c, 'a long question');

        expect(compactions, 'once per turn').toBe(1);
        expect(messages.at(-1)?.status).toBe('error');
        expect(raised).toEqual([AparteErrorCode.USAGE_CONTEXT_EXCEEDED]);
    });

    it('keeps the wire value AGENT_RUN_FAILED for a failure that carries no code', async () => {
        const provider = { id: 'mock', name: 'Mock', async chat() { throw new Error('boom'); } } as unknown as AparteAIProvider;
        const { fetch } = server(provider);
        const { el, messages } = chat();
        let compactions = 0;
        await send(client(el, fetch, undefined, true, (cfg) => withCompactor(cfg, async () => { compactions++; return COMPACTED; })), 'hi');
        expect(compactions).toBe(0);
        expect(messages.at(-1)?.status).toBe('error');
    });
});
