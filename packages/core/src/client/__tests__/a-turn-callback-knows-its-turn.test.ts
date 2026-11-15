// @vitest-environment jsdom
/**
 * Every callback a turn calls knows the turn it is called for.
 *
 * An app that files an approval under its conversation used to read the conversation from
 * its own state, and the client asks again about a paused call the moment a conversation is
 * loaded, before a framework has rendered the new id: the request was filed under the
 * conversation shown before, and its card never appeared. The client knows the turn at every
 * call site, so it says so: `{ conversationId, messageId, targetId }` (`AparteTurnContext`),
 * the third argument of `approvalResolver`, of an approval policy and the second of
 * `requestInterceptor`, and on `aparte-tool-approval-request` and the elicitation request.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { offerOpenConversation } from '../../conversations/open-conversation.js';
import { attachConfig } from '../../config/config-context.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import type { AparteElicitationRequest } from '../../elicitation/types.js';

afterEach(() => { document.body.innerHTML = ''; });

/** A chat target that keeps what it is told, the way a viewport does, in conversation `c1`. */
function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
    const el = document.createElement('div');
    el.id = 'chat-1';
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
        getMessage: (id: string) => messages.find((m) => m.id === id),
    });
    document.body.appendChild(el);
    offerOpenConversation(el, () => 'c1');
    return { el, messages };
}

const config = () => {
    const cfg = new AparteConfig();
    cfg.setModelConfig({ defaultProvider: 'remote', defaultModel: 'm' });
    return cfg;
};

const send = async (client: AparteClient, content = 'go'): Promise<void> => {
    const c = client as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
    c._beginUserTurn();
    await c._handleSend(new CustomEvent('aparte-send', { detail: { content } }));
};

const call = { id: 'call-1', name: 'write_file', input: { path: 'a.txt' } };

/** A run that gates one call in the page, through the resolver the client hands it. */
const gatesOneCall = async (opts: AparteStreamRunOptions): Promise<undefined> => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'tool-start', toolCallId: call.id, name: call.name, input: call.input });
    opts.emitter({ type: 'tool-awaiting-approval', toolCallId: call.id, name: call.name, input: call.input });
    const needs = opts.toolConfigLookup?.(call.name)?.needsApproval;
    if (typeof needs === 'function') needs(call);
    await opts.approvalResolver?.(call, opts.signal);
    opts.emitter({ type: 'run-done' });
    return undefined;
};

const replyId = (messages: AparteMessage[]): string => messages.find((m) => m.role === 'assistant')!.id;

describe('a turn callback knows its turn', () => {
    it('approvalResolver receives the conversation, the reply and the chat', async () => {
        const { el, messages } = chat();
        const turns: unknown[] = [];
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el, streamRunner: gatesOneCall,
            approvalResolver: async (_call, _signal, turn) => { turns.push(turn); return { approved: true }; },
        });
        await send(client);
        expect(turns).toEqual([{ conversationId: 'c1', messageId: replyId(messages), targetId: 'chat-1' }]);
    });

    it('an approval policy receives it too, as its third argument', async () => {
        const { el, messages } = chat();
        const cfg = config();
        const turns: unknown[] = [];
        cfg.registerTool({ name: call.name, description: 'w', inputSchema: { type: 'object' } }, async (c) => ({ toolCallId: c.id, content: 'ok' }));
        cfg.setApprovalPolicy((_call, _tool, turn) => { turns.push(turn); return { verdict: 'allow' }; });
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el, streamRunner: gatesOneCall });
        await send(client);
        const turn = { conversationId: 'c1', messageId: replyId(messages), targetId: 'chat-1' };
        expect(turns.length).toBeGreaterThan(0);
        for (const seen of turns) expect(seen).toEqual(turn);
    });

    it('requestInterceptor receives it as its second argument', async () => {
        const { el, messages } = chat();
        const turns: unknown[] = [];
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => { opts.emitter({ type: 'run-start' }); opts.emitter({ type: 'run-done' }); return undefined; },
            requestInterceptor: (request, turn) => { turns.push(turn); return request; },
        });
        await send(client);
        expect(turns).toEqual([{ conversationId: 'c1', messageId: replyId(messages), targetId: 'chat-1' }]);
    });

    it('aparte-tool-approval-request names the conversation and the reply', async () => {
        const { el, messages } = chat();
        const details: unknown[] = [];
        window.addEventListener('aparte-tool-approval-request', (e) => details.push((e as CustomEvent).detail), { once: true });
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el, streamRunner: gatesOneCall,
            approvalResolver: async () => ({ approved: true }),
        });
        await send(client);
        expect(details[0]).toMatchObject({ toolCallId: call.id, conversationId: 'c1', messageId: replyId(messages) });
    });

    it('the approval the panel asks names the conversation and the reply', async () => {
        const { el, messages } = chat();
        const cfg = config();
        // The panel the chat answers through is its own config's.
        attachConfig(el, cfg);
        const requests: AparteElicitationRequest[] = [];
        cfg.setElicitationPresenter(async (request) => { requests.push(request); return { action: 'accept', content: { option: 'allow' } }; });
        cfg.registerTool({ name: call.name, description: 'w', inputSchema: { type: 'object' }, needsApproval: true }, async (c) => ({ toolCallId: c.id, content: 'ok' }));
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el, streamRunner: gatesOneCall });
        await send(client);
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ kind: 'approval', conversationId: 'c1', messageId: replyId(messages) });
    });

    it('the approval carries the preview the tool display draws for it', async () => {
        const { el } = chat();
        const cfg = config();
        attachConfig(el, cfg);
        const requests: AparteElicitationRequest[] = [];
        cfg.setElicitationPresenter(async (request) => { requests.push(request); return { action: 'accept', content: { option: 'allow' } }; });
        cfg.registerTool({ name: call.name, description: 'w', inputSchema: { type: 'object' }, needsApproval: true }, async (c) => ({ toolCallId: c.id, content: 'ok' }));
        // Cast: the display's `approvalPreview` field is declared beside the display.
        cfg.registerToolDisplay(call.name, { approvalPreview: (c: { input: Record<string, unknown> }) => `write ${String(c.input['path'])}` } as never);
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el, streamRunner: gatesOneCall });
        await send(client);
        expect(requests[0]?.preview).toBe('write a.txt');
    });

    it('a paused call asked again after a load is asked under the loaded conversation', async () => {
        const reply: AparteMessage = {
            id: 'reply-1', role: 'assistant', content: '', timestamp: 2, status: 'completed',
            segments: [{
                id: `tool-${call.id}`, type: 'tool_call', status: 'awaiting-approval',
                toolCall: call, deferred: { reason: 'approval', ticket: 'T' },
            } as AparteSegment],
        };
        const { el } = chat([{ id: 'u1', role: 'user', content: 'go', timestamp: 1 }, reply]);
        const turns: unknown[] = [];
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => { opts.emitter({ type: 'run-start' }); opts.emitter({ type: 'run-done' }); return undefined; },
            approvalResolver: async (_call, _signal, turn) => { turns.push(turn); return { approved: true }; },
        });
        expect(await client.resumeDeferred(el)).toBe(true);
        expect(turns).toEqual([{ conversationId: 'c1', messageId: 'reply-1', targetId: 'chat-1' }]);
    });

    it('a browser tool that answers a paused run is told its conversation', async () => {
        const { el } = chat();
        const cfg = config();
        const contexts: unknown[] = [];
        cfg.registerTool({ name: 'pick_file', description: 'p', inputSchema: { type: 'object' } }, async (c, _s, context) => {
            contexts.push(context?.conversationId);
            return { toolCallId: c.id, content: 'a.txt' };
        });
        let runs = 0;
        const client = new AparteClient({
            config: cfg, autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => {
                opts.emitter({ type: 'run-start' });
                if (runs++ === 0) {
                    opts.emitter({ type: 'tool-start', toolCallId: 'b1', name: 'pick_file', input: {} });
                    opts.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'b1', name: 'pick_file', input: {}, reason: 'external' }], ticket: 'T' } as never);
                } else {
                    opts.emitter({ type: 'run-done' });
                }
                return undefined;
            },
        });
        await send(client);
        expect(contexts).toEqual(['c1']);
    });
});
