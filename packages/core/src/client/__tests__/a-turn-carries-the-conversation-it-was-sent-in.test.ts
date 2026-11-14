// @vitest-environment jsdom
/**
 * A turn carries the id of the conversation the person sent it in.
 *
 * A server that keeps a journal per conversation has to know which conversation a turn
 * belongs to, and the page knew nothing it could say: the client built each request from
 * the history alone, so a runner, a provider or a server tool could not tell conversation
 * A's message from conversation B's. An app wrote the answer by hand, from a ref it kept
 * in step with `onConversationCreated` and `aparte-conversation-select`.
 *
 * The run's options now carry it, beside `messageId`. Three things are pinned below:
 *
 * - **It is the conversation open when the message was sent**, read at that moment and
 *   not after the awaits a turn starts with (a key to resolve, a file to read), so a
 *   person who opens another conversation a moment later does not move the turn.
 * - **It is known for a first message**, whose conversation does not exist until the
 *   send creates it.
 * - **A chat with no conversation says nothing**: the option is left out, not `null`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../../conversations/conversation-controller.js';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import type { AparteConversation } from '../../conversations/types.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteToolContext } from '../../types/tools.js';

/** One element as both the controller's binding and the client's render target. */
function chatHost() {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    let messages: AparteMessage[] = [];
    // A switch clears the transcript under a turn that has not started yet: nothing to write to.
    const last = () => messages[messages.length - 1];
    Object.assign(host, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); if (m) m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m?.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        getMessages: () => messages,
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
    });
    const binding: AparteChatBinding = {
        hostId: 'host', host,
        setMessages: (m) => { messages = structuredClone(m); },
        appendMessage: (m) => { messages.push(m); },
        getMessages: () => messages,
        clearMessages: () => { messages = []; },
        setLoading: () => {},
    };
    return { host, binding, messages: () => messages };
}

const stored = (id: string): AparteConversation => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [] });

async function managerWith(...ids: string[]) {
    const saved = new Map(ids.map((id) => [id, stored(id)]));
    const manager = new AparteConversationManager({
        loadAll: async () => [...saved.values()].map((c) => structuredClone(c)),
        save: async (c) => { saved.set(c.id, structuredClone(c)); },
        delete: async () => {},
    });
    await manager.init();
    return manager;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    document.body.innerHTML = '';
});

/** A runner's whole reply: a short answer, no tools. */
const answer = (opts: AparteStreamRunOptions): void => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'turn-start' });
    opts.emitter({ type: 'text-delta', delta: 'ok' });
    opts.emitter({ type: 'text-flush' });
    opts.emitter({ type: 'run-done' });
};

/**
 * A chat with a client whose runner records what it is handed. `conversations` are the
 * ones the manager holds, `open` the one the chat has on screen (none by default), and
 * `withManager: false` a chat that has no conversation lifecycle at all. `runner` is
 * what each run does, given the run's number; it answers by default.
 */
async function openChat(options: {
    conversations?: string[];
    open?: string;
    withManager?: boolean;
    runner?: (opts: AparteStreamRunOptions, run: number) => void | Promise<void>;
    clientOptions?: Record<string, unknown>;
} = {}) {
    const { host, binding, messages } = chatHost();
    const manager = options.withManager === false ? undefined : await managerWith(...(options.conversations ?? ['a', 'b']));
    const created: string[] = [];
    const controller = new AparteConversationController(binding, {
        ...(manager ? { manager } : {}),
        onConversationCreated: (id) => created.push(id),
    });
    controller.bind();
    if (options.open) await controller.setConversationId(options.open);

    const seen: AparteStreamRunOptions[] = [];
    const client = new AparteClient({
        autoRegister: false,
        ...options.clientOptions,
        streamRunner: async (opts: AparteStreamRunOptions) => {
            seen.push(opts);
            await (options.runner ?? answer)(opts, seen.length);
            return undefined;
        },
    } as never);
    client.start();
    cleanups.push(() => { client.stop(); controller.unbind(); });

    const dispatch = (type: string, detail: Record<string, unknown>) => host.dispatchEvent(
        new CustomEvent(type, { detail: { targetId: 'host', ...detail }, bubbles: true, composed: true }),
    );
    const send = (content = 'hello', extra: Record<string, unknown> = {}) => dispatch('aparte-send', { content, timestamp: Date.now(), ...extra });
    return { host, controller, manager, created, seen, messages, send, dispatch };
}

describe('a turn carries the conversation it was sent in', () => {
    it('hands a runner the id of the conversation open in the chat', async () => {
        const { seen, send } = await openChat({ open: 'a' });
        send();
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0]!.conversationId).toBe('a');
    });

    it('gives each turn the id of the conversation open when it was sent', async () => {
        const { seen, send, controller } = await openChat({ open: 'a' });
        send('in a');
        await vi.waitFor(() => expect(seen).toHaveLength(1));

        await controller.setConversationId('b');
        send('in b');
        await vi.waitFor(() => expect(seen).toHaveLength(2));

        expect(seen.map((run) => run.conversationId)).toEqual(['a', 'b']);
    });

    it('keeps the conversation of the send when the person opens another while the turn is starting', async () => {
        // The turn starts with a key to resolve (and files to read). A switch in the middle
        // of that is after the send: the message was written, and is saved, in `a`.
        let release!: (key: string) => void;
        const key = new Promise<string>((resolve) => { release = resolve; });
        const { seen, send, controller } = await openChat({ open: 'a', clientOptions: { keyResolver: () => key } });
        send('in a', { providerId: 'mock' });
        await controller.setConversationId('b');
        release('a-key');
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0]!.conversationId).toBe('a');
    });

    it('carries the id of the conversation a first message creates', async () => {
        const { seen, send, created, manager } = await openChat();
        expect(manager!.activeId).toBeNull();
        send('the very first message');
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        await vi.waitFor(() => expect(created).toHaveLength(1));
        expect(seen[0]!.conversationId).toBe(created[0]);
        expect(seen[0]!.conversationId).toBe(manager!.activeId);
    });

    it('leaves the id out when the chat has no conversation to be in', async () => {
        const noManager = await openChat({ withManager: false });
        noManager.send();
        await vi.waitFor(() => expect(noManager.seen).toHaveLength(1));
        expect('conversationId' in noManager.seen[0]!).toBe(false);
    });

    it('leaves the id out of a chat nothing manages', async () => {
        // No controller at all: the chat is the viewport alone, as a bare page has it.
        const { host } = chatHost();
        const seen: AparteStreamRunOptions[] = [];
        const client = new AparteClient({
            autoRegister: false,
            streamRunner: async (opts) => {
                seen.push(opts);
                opts.emitter({ type: 'run-start' });
                opts.emitter({ type: 'run-done' });
                return undefined;
            },
        });
        client.start();
        cleanups.push(() => client.stop());
        host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi', targetId: 'host', timestamp: 1 }, bubbles: true, composed: true }));
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect('conversationId' in seen[0]!).toBe(false);
    });

    it('carries it on a retry and on an edit, in the conversation they are made in', async () => {
        const { seen, send, dispatch, messages } = await openChat({ open: 'a' });
        send('first');
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        await vi.waitFor(() => expect(messages().some((m) => m.role === 'assistant' && m.status === 'completed')).toBe(true));
        const reply = messages().find((m) => m.role === 'assistant')!;
        const question = messages().find((m) => m.role === 'user')!;

        dispatch('aparte-retry', { messageId: reply.id });
        await vi.waitFor(() => expect(seen).toHaveLength(2));

        dispatch('aparte-edit', { messageId: question.id, content: 'first, reworded' });
        await vi.waitFor(() => expect(seen).toHaveLength(3));

        expect(seen.map((run) => run.conversationId)).toEqual(['a', 'a', 'a']);
    });

    describe('a tool that runs in the page', () => {
        // The context a handler is given, whichever loop runs it: the same field a server tool reads.
        async function callNote(open: Parameters<typeof openChat>[0]) {
            const contexts: AparteToolContext[] = [];
            const config = new AparteConfig();
            config.registerTool(
                { name: 'note', description: 'Note.', inputSchema: { type: 'object', properties: {} } },
                (async (call: { id: string }, _signal: AbortSignal, context?: AparteToolContext) => {
                    contexts.push({ ...context });
                    return { toolCallId: call.id, content: 'noted' };
                }) as never,
            );
            const chat = await openChat({
                ...open,
                clientOptions: { config },
                runner: async (opts) => {
                    await opts.toolLookup('note')?.({ id: 't1', name: 'note', input: {} }, new AbortController().signal);
                    answer(opts);
                },
            });
            chat.send('note this');
            await vi.waitFor(() => expect(contexts).toHaveLength(1));
            return contexts[0]!;
        }

        it('is given the conversation of the turn in its context', async () => {
            expect((await callNote({ open: 'a' })).conversationId).toBe('a');
        });

        it('is given none when the chat has none', async () => {
            expect('conversationId' in await callNote({ withManager: false })).toBe(false);
        });
    });

    it('keeps it when a paused run is resumed', async () => {
        // A server loop that pauses on a call the person must approve, then finishes.
        const pauseThenFinish = (opts: AparteStreamRunOptions, run: number) => {
            const call = { toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } };
            opts.emitter({ type: 'run-start' });
            if (run === 1) {
                opts.emitter({ type: 'tool-start', ...call });
                opts.emitter({ type: 'tool-awaiting-approval', ...call });
                opts.emitter({ type: 'run-suspended', pending: [{ ...call, reason: 'approval' }], ticket: 'T' } as never);
                return;
            }
            opts.emitter({ type: 'tool-approved', toolCallId: 'c1' });
            opts.emitter({ type: 'tool-resolved', toolCallId: 'c1', result: 'deleted' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Done.' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
        };
        const { seen, send } = await openChat({
            open: 'b',
            runner: pauseThenFinish,
            clientOptions: { approvalResolver: async () => ({ approved: true }) },
        });
        send('delete a');
        await vi.waitFor(() => expect(seen).toHaveLength(2));
        // The second run is the resume, and a server routing by conversation needs the id on it too.
        expect(seen[1]!.deferral).toBeDefined();
        expect(seen.map((run) => run.conversationId)).toEqual(['b', 'b']);
    });
});
