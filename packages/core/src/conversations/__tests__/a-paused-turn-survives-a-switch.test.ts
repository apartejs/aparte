// @vitest-environment jsdom
/**
 * A paused turn survives leaving its conversation.
 *
 * A server loop pauses on a call only the person can answer, and the person opens
 * another conversation instead of answering. Leaving is leaving — the same as closing
 * the tab: the pause stays in the conversation, and coming back puts the question
 * again, then resumes the run on the server. Nothing about the switch may close the
 * paused call, nor write it into the conversation the person went to.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteConversation } from '../types.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../../client/stream-adapter.js';

/** One element as both the controller's binding and the client's render target. */
function chatHost() {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    let messages: AparteMessage[] = [];
    const last = () => messages[messages.length - 1]!;
    Object.assign(host, {
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

const conv = (id: string, messages: AparteMessage[] = []): AparteConversation => ({ id, title: id, createdAt: 1, updatedAt: 1, messages });

describe('a paused turn and a conversation switch', () => {
    it.each([
        ['loaded up front', false],
        // Loaded on open, a macrotask later: the cut lands while A is still on screen.
        ['loaded on open', true],
    ])('keeps the pause in its conversation, and puts the question again on the way back (%s)', async (_label, lazy) => {
        const saved = new Map<string, AparteConversation>([['a', conv('a')], ['b', conv('b', [{ id: 'b1', role: 'user', content: 'other', timestamp: 1 }])]]);
        const later = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 5));
        const manager = new AparteConversationManager(lazy
            ? {
                loadAll: async () => [...saved.values()].map((c) => structuredClone(c)),
                loadMeta: async () => [...saved.values()].map(({ messages: _m, ...rest }) => rest),
                loadFull: (id: string) => later(saved.has(id) ? structuredClone(saved.get(id)!) : null),
                save: async (c) => { saved.set(c.id, structuredClone(c)); },
                delete: async () => {},
            }
            : {
                loadAll: async () => [...saved.values()].map((c) => structuredClone(c)),
                save: async (c) => { saved.set(c.id, structuredClone(c)); },
                delete: async () => {},
            });
        await manager.init();
        const { host, binding, messages } = chatHost();
        const controller = new AparteConversationController(binding, { manager });
        controller.bind();
        await controller.setConversationId('a');

        const runs: AparteStreamRunOptions[] = [];
        const streamRunner = async (opts: AparteStreamRunOptions) => {
            runs.push(opts);
            opts.emitter({ type: 'run-start' });
            if (runs.length === 1) {
                opts.emitter({ type: 'tool-start', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
                opts.emitter({ type: 'tool-awaiting-approval', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
                opts.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'c1', name: 'delete_file', input: { path: 'a' }, reason: 'approval' }], ticket: 'T' } as never);
                return undefined;
            }
            opts.emitter({ type: 'tool-approved', toolCallId: 'c1' });
            opts.emitter({ type: 'tool-resolved', toolCallId: 'c1', result: 'deleted' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Done.' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        };
        // The first question waits, like a panel nobody answers; the second is approved.
        const asked: string[] = [];
        const approvalResolver = (call: { id: string }, signal: AbortSignal) => {
            asked.push(call.id);
            if (asked.length > 1) return Promise.resolve({ approved: true });
            return new Promise<{ approved: boolean }>((resolve) => signal.addEventListener('abort', () => resolve({ approved: false })));
        };

        const cfg = new AparteConfig();
        cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => host as never, streamRunner, approvalResolver } as never);
        client.start();
        // What is on screen when the turn says it stopped: B, or nothing yet while B loads —
        // never A, so the cut has nothing of A's to close, and the save it triggers none to write.
        let onScreenAtCut: string[] = [];
        host.addEventListener('aparte-message-aborted', () => { onScreenAtCut = messages().map((m) => m.role); });
        try {
            const turn = (client as unknown as { _handleSend: (e: Event) => Promise<void> })
                ._handleSend(new CustomEvent('aparte-send', { detail: { content: 'delete a' } }));
            await vi.waitFor(() => expect(asked).toEqual(['c1']));

            // The person leaves for another conversation instead of answering.
            await controller.setConversationId('b');
            await turn;
            await new Promise((r) => setTimeout(r, 0));

            expect(onScreenAtCut).toEqual(lazy ? [] : ['user']);
            // B is untouched; A keeps its paused call, with the server's ticket.
            expect(saved.get('b')!.messages.map((m) => m.id)).toEqual(['b1']);
            const reply = saved.get('a')!.messages.find((m) => m.role === 'assistant')!;
            expect(reply.segments!.find((s) => s.id === 'tool-c1')).toMatchObject({ status: 'awaiting-approval', deferred: { ticket: 'T' } });

            // Coming back puts the question again, and the answer resumes the run.
            await controller.setConversationId('a');
            await vi.waitFor(() => expect(runs).toHaveLength(2));
            expect(asked).toEqual(['c1', 'c1']);
            expect(runs[1]!.deferral).toEqual({ outcomes: { c1: { kind: 'decision', approved: true } }, token: 'T' });
            await vi.waitFor(() => expect(messages().at(-1)!.segments!.some((s) => (s as { content?: string }).content === 'Done.')).toBe(true));
        } finally {
            client.stop();
            controller.unbind();
        }
    });
});
