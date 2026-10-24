// @vitest-environment jsdom
/**
 * The list hears a pause, and the run that resumes it — with the real client.
 *
 * The controller read `running` from `aparte-message-start` and `waiting` from
 * `aparte-message-paused`, and the client sent neither at a pause's boundaries: an
 * answered pause ran again with no event (the row kept "Waiting for you" while the AI
 * answered), and a turn that started from a saved pause said `start` and then waited on
 * the person (the row shimmered "Answering" while it asked). The client now says
 * `aparte-message-paused` when a turn starts from a saved pause, and the new
 * `aparte-message-resumed` when a pause's answers send the run on its way again.
 *
 * And a turn already waiting on a live pause is not started a second time when its
 * conversation is loaded again (a re-click on the open conversation): the resume path
 * only knew the resumes it had started itself.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteConversation } from '../types.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../../client/stream-adapter.js';
import type { AparteConversationStatusDetail } from '../../components/conversation-list/aparte-conversation-list.js';
import { forgetConversationStatuses } from '../conversation-status.js';

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

/** A server loop that pauses once on an approval, then finishes. */
function pausingRunner(runs: AparteStreamRunOptions[]) {
    return async (opts: AparteStreamRunOptions) => {
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
}

function clientFor(host: HTMLElement, streamRunner: unknown, approvalResolver: unknown): AparteClient {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => host as never, streamRunner, approvalResolver } as never);
    client.start();
    return client;
}

function listen(): { heard: (AparteConversationStatus | null)[]; stop: () => void } {
    forgetConversationStatuses();
    const heard: (AparteConversationStatus | null)[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent<AparteConversationStatusDetail>).detail.status);
    window.addEventListener('aparte-conversation-status', on);
    return { heard, stop: () => window.removeEventListener('aparte-conversation-status', on) };
}
type AparteConversationStatus = 'running' | 'waiting';

describe('the list across a pause', () => {
    it('running, waiting at the pause, running again once answered, nothing at the end', async () => {
        const saved = new Map<string, AparteConversation>([['a', conv('a')]]);
        const manager = new AparteConversationManager({
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
        let answer!: (v: { approved: boolean }) => void;
        const client = clientFor(host, pausingRunner(runs), () => new Promise((r) => { answer = r; }));
        const { heard, stop } = listen();
        try {
            const turn = (client as unknown as { _handleSend: (e: Event) => Promise<void> })
                ._handleSend(new CustomEvent('aparte-send', { detail: { content: 'delete a' } }));
            await vi.waitFor(() => expect(heard).toEqual(['running', 'waiting']));
            answer({ approved: true });
            await turn;
            await vi.waitFor(() => expect(messages().at(-1)!.segments!.some((s) => (s as { content?: string }).content === 'Done.')).toBe(true));
            expect(heard).toEqual(['running', 'waiting', 'running', null]);
        } finally {
            stop();
            client.stop();
            controller.unbind();
        }
    });

    it('a turn that starts from a saved pause waits first, then runs once answered', async () => {
        const reply: AparteMessage = {
            id: 'r1', role: 'assistant', content: '', timestamp: 2,
            segments: [{ id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment],
        };
        const saved = new Map<string, AparteConversation>([['a', conv('a', [{ id: 'u1', role: 'user', content: 'delete a', timestamp: 1 }, reply])]]);
        const manager = new AparteConversationManager({
            loadAll: async () => [...saved.values()].map((c) => structuredClone(c)),
            save: async (c) => { saved.set(c.id, structuredClone(c)); },
            delete: async () => {},
        });
        await manager.init();
        const { host, binding } = chatHost();
        const controller = new AparteConversationController(binding, { manager });
        controller.bind();
        const runs: AparteStreamRunOptions[] = [{} as AparteStreamRunOptions]; // the run that paused, before the reload
        let answer!: (v: { approved: boolean }) => void;
        const client = clientFor(host, pausingRunner(runs), () => new Promise((r) => { answer = r; }));
        const { heard, stop } = listen();
        try {
            await controller.setConversationId('a');
            await vi.waitFor(() => expect(heard).toEqual(['running', 'waiting']));
            answer({ approved: true });
            await vi.waitFor(() => expect(heard).toEqual(['running', 'waiting', 'running', null]));
        } finally {
            stop();
            client.stop();
            controller.unbind();
        }
    });

    it('a live pause is not started a second time when its conversation is loaded again', async () => {
        const saved = new Map<string, AparteConversation>([['a', conv('a')]]);
        const manager = new AparteConversationManager({
            loadAll: async () => [...saved.values()].map((c) => structuredClone(c)),
            save: async (c) => { saved.set(c.id, structuredClone(c)); },
            delete: async () => {},
        });
        await manager.init();
        const { host, binding } = chatHost();
        const controller = new AparteConversationController(binding, { manager });
        controller.bind();
        await controller.setConversationId('a');
        const runs: AparteStreamRunOptions[] = [];
        const asked: string[] = [];
        const client = clientFor(host, pausingRunner(runs), (call: { id: string }) => { asked.push(call.id); return new Promise(() => {}); });
        try {
            void (client as unknown as { _handleSend: (e: Event) => Promise<void> })
                ._handleSend(new CustomEvent('aparte-send', { detail: { content: 'delete a' } }));
            await vi.waitFor(() => expect(asked).toEqual(['c1']));
            // The person clicks the conversation they are in: it loads again.
            await controller.setConversationId('a');
            await new Promise((r) => setTimeout(r, 20));
            expect(asked, 'the question is not put twice').toEqual(['c1']);
            expect(runs).toHaveLength(1);
        } finally {
            client.stop();
            controller.unbind();
        }
    });
});
