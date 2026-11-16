// @vitest-environment jsdom
/**
 * `setAutoReply(false)` turns the AI off: a person's message is shown and saved, and no
 * turn starts — whatever way a turn would have started (a send, a retry, an edit, a
 * queued message, the resume of a paused reply). The person keeps writing to whoever
 * answers instead: an advisor, another participant.
 *
 * Off for one conversation (`setAutoReply(false, id)`) leaves the others answering; off
 * with no id is the chat's default, and a conversation's own setting wins over it. The
 * setting lives on the config, so two chats on the same config (the page's, by default)
 * are both turned off by a call with no id.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { offerOpenConversation } from '../../conversations/open-conversation.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import '../../components/bubble/aparte-chat-bubble.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/composer/aparte-composer.js';
import type { AparteComposer } from '../../components/composer/aparte-composer.js';

/** A chat target that keeps what it is told, the way a viewport does. */
function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSiblingOf: (_id: string, m: AparteMessage) => { messages.push({ ...m }); return m.id; },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: () => {},
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    document.body.appendChild(el);
    return { el, messages };
}

function runner() {
    const calls: AparteStreamRunOptions[] = [];
    const run = async (opts: AparteStreamRunOptions) => {
        calls.push(opts);
        opts.emitter({ type: 'run-start' });
        opts.emitter({ type: 'turn-start' });
        opts.emitter({ type: 'text-delta', delta: 'Done.' });
        opts.emitter({ type: 'text-flush' });
        opts.emitter({ type: 'run-done' });
        return undefined;
    };
    return { run, calls };
}

function client(el: HTMLElement, run: ReturnType<typeof runner>['run'], options: { model?: boolean } = {}) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    if (options.model !== false) cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const c = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never, streamRunner: run } as never);
    return { c, cfg };
}

type Internals = {
    _handleSend(e: Event): Promise<void>;
    _handleRetry(e: Event): Promise<void>;
    _handleEdit(e: Event): Promise<void>;
};
const internals = (c: AparteClient) => c as unknown as Internals;
const send = async (c: AparteClient, content = 'Is my order shipped?') => {
    const event = new CustomEvent('aparte-send', { detail: { content } as Record<string, unknown> });
    await internals(c)._handleSend(event);
    return event.detail;
};

const answered = (): AparteMessage[] => [
    { id: 'u1', role: 'user', content: 'Hi', timestamp: 1 },
    { id: 'a1', role: 'assistant', content: 'Hello.', status: 'completed', timestamp: 2 },
];

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the AI turned off', () => {
    it('shows and saves the message but starts no turn when auto-reply is off', async () => {
        const { el, messages } = chat();
        const r = runner();
        const { c, cfg } = client(el, r.run);
        cfg.setAutoReply(false);

        const detail = await send(c);

        expect(r.calls).toHaveLength(0);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ role: 'user', content: 'Is my order shipped?' });
        expect(messages.some((m) => m.status === 'pending')).toBe(false);
        // The send carries the id of the message shown, for whoever saves or forwards it.
        expect(detail.messageId).toBe(messages[0]!.id);
    });

    it('keeps the message even with model selection required and none chosen', async () => {
        const { el, messages } = chat();
        const r = runner();
        const { c, cfg } = client(el, r.run, { model: false });
        cfg.setRequireModelSelection(true);
        cfg.setAutoReply(false);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await send(c);

        expect(messages.map((m) => m.content)).toEqual(['Is my order shipped?']);
        expect(r.calls).toHaveLength(0);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('starts no turn on retry, edit or resumeDeferred while off', async () => {
        const paused: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [
                { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
            ] },
        ];
        const { el, messages } = chat(paused);
        const r = runner();
        const { c, cfg } = client(el, r.run);
        cfg.setAutoReply(false);

        await internals(c)._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId: 'a1' } }));
        await internals(c)._handleEdit(new CustomEvent('aparte-edit', { detail: { messageId: 'u1', content: 'delete b' } }));
        const resumed = await c.resumeDeferred(el);

        expect(resumed).toBe(false);
        expect(r.calls).toHaveLength(0);
        expect(messages).toEqual(paused);
    });

    it('turning it back on answers the next message', async () => {
        const { el, messages } = chat();
        const r = runner();
        const { c, cfg } = client(el, r.run);
        cfg.setAutoReply(false);
        await send(c, 'first');
        cfg.setAutoReply(true);

        await send(c, 'second');

        expect(r.calls).toHaveLength(1);
        expect(messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
        // The model reads both: the one written while it was off is part of the conversation.
        const history = r.calls[0]!.baseRequest.messages.map((m) => (typeof m.content === 'string' ? m.content : ''));
        expect(history.join('\n')).toContain('first');
        expect(history.join('\n')).toContain('second');
    });
});

describe('the AI turned off per conversation', () => {
    it('applies per conversation: off for c1 leaves c2 answering', async () => {
        const { el } = chat();
        let open = 'c1';
        offerOpenConversation(el, () => open);
        const r = runner();
        const { c, cfg } = client(el, r.run);
        cfg.setAutoReply(false, 'c1');

        await send(c, 'to c1');
        expect(r.calls).toHaveLength(0);

        open = 'c2';
        await send(c, 'to c2');
        expect(r.calls).toHaveLength(1);
        expect(cfg.getAutoReply('c1')).toBe(false);
        expect(cfg.getAutoReply('c2')).toBe(true);
        expect(cfg.getAutoReply()).toBe(true);
    });

    it('off without an id applies to the whole chat, and a conversation of its own wins', async () => {
        const { el } = chat();
        let open = 'c1';
        offerOpenConversation(el, () => open);
        const r = runner();
        const { c, cfg } = client(el, r.run);
        cfg.setAutoReply(false);
        cfg.setAutoReply(true, 'c2');

        await send(c, 'to c1');
        expect(r.calls).toHaveLength(0);
        open = 'c2';
        await send(c, 'to c2');
        expect(r.calls).toHaveLength(1);
        expect(cfg.getAutoReply('c3')).toBe(false);
    });

    it('two chats on the page config are both turned off by a call with no id', () => {
        // The setting is the config's: a page whose chats share the global config turns
        // every one of them off. One chat apart needs its own config, or a conversation id.
        aparteGlobalConfig.setAutoReply(false);
        expect(aparteGlobalConfig.getAutoReply()).toBe(false);
        expect(aparteGlobalConfig.getAutoReply('any')).toBe(false);
    });

    it('says the change, like any config change', () => {
        const cfg = new AparteConfig();
        const heard = vi.fn();
        cfg.subscribe(heard);
        cfg.setAutoReply(false, 'c1');
        cfg.setAutoReply(false, 'c1');
        expect(heard).toHaveBeenCalledTimes(1);
    });
});

describe('the transcript while the AI is off', () => {
    const buttons = (vp: HTMLElement, action: string) =>
        [...vp.querySelectorAll<HTMLButtonElement>(`aparte-chat-bubble .aparte-action-bar [data-action="${action}"]`)];

    it('disables retry and edit while off, and gives them back when on', async () => {
        aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
        const vp = document.createElement('aparte-chat-viewport') as HTMLElement & { setMessages(m: AparteMessage[]): void };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.setMessages).toBe('function'));
        vp.setMessages(answered());
        await vi.waitFor(() => expect(buttons(vp, 'retry')).toHaveLength(1));
        expect(buttons(vp, 'edit')).toHaveLength(1);
        expect([...buttons(vp, 'retry'), ...buttons(vp, 'edit')].every((b) => !b.disabled)).toBe(true);

        aparteGlobalConfig.setAutoReply(false);
        await vi.waitFor(() => expect([...buttons(vp, 'retry'), ...buttons(vp, 'edit')].every((b) => b.disabled)).toBe(true));

        aparteGlobalConfig.setAutoReply(true);
        await vi.waitFor(() => expect([...buttons(vp, 'retry'), ...buttons(vp, 'edit')].every((b) => !b.disabled)).toBe(true));
    });
});

describe('the composer while the AI is off', () => {
    async function composer(): Promise<AparteComposer> {
        const host = document.createElement('div');
        host.setAttribute('data-aparte-chat', '');
        host.id = 'chat-a';
        host.innerHTML = '<aparte-composer><div class="aparte-composer-shell"><div class="aparte-composer-row"><textarea></textarea></div></div></aparte-composer>';
        document.body.appendChild(host);
        const el = host.querySelector('aparte-composer') as AparteComposer;
        await vi.waitFor(() => expect(typeof el.streaming).toBe('boolean'));
        return el;
    }
    const lifecycle = (name: string): void => {
        window.dispatchEvent(new CustomEvent(name, { detail: { targetId: 'chat-a', messageId: 'r1' } }));
    };

    it('sends every queued message when the reply ends, since nothing answers them', async () => {
        aparteGlobalConfig.setQueueWhileStreaming(true);
        const el = await composer();
        const sent: string[] = [];
        const listening = new AbortController();
        document.addEventListener('aparte-send', (e) => sent.push((e as CustomEvent).detail.content), { signal: listening.signal });
        lifecycle('aparte-message-start');
        el.setValue('one'); el.queue();
        el.setValue('two'); el.queue();
        aparteGlobalConfig.setAutoReply(false);

        lifecycle('aparte-message-done');

        await vi.waitFor(() => expect(sent).toEqual(['one', 'two']));
        expect(el.queued).toEqual([]);
        listening.abort();
    });

    it('is not greyed out by a model choice the AI would need', async () => {
        aparteGlobalConfig.setRequireModelSelection(true);
        const el = await composer();
        expect(el.hasAttribute('data-model-gated')).toBe(true);

        aparteGlobalConfig.setAutoReply(false);

        await vi.waitFor(() => expect(el.hasAttribute('data-model-gated')).toBe(false));
    });

    it('follows the conversation that opens, when the AI is off in one of them only', async () => {
        aparteGlobalConfig.setRequireModelSelection(true);
        aparteGlobalConfig.setAutoReply(false, 'c1');
        const el = await composer();
        let open = 'c2';
        offerOpenConversation(el.parentElement!, () => open);
        const loaded = (): void => {
            el.parentElement!.dispatchEvent(new CustomEvent('aparte-conversation-loaded', { bubbles: true, composed: true, detail: { targetId: 'chat-a', conversationId: open } }));
        };

        open = 'c1'; loaded();
        expect(el.hasAttribute('data-model-gated')).toBe(false);
        open = 'c2'; loaded();
        expect(el.hasAttribute('data-model-gated')).toBe(true);
    });
});
