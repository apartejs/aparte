/**
 * What `<AparteChat>` does with the conversation it is given, and with a `config` that changes.
 * The React suite of the same name says why; this one adds the binding Vue makes natural, the
 * prop bound to `useConversationManager()`'s `activeId` — which names the new conversation
 * BEFORE the chat that is creating it holds the id.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import {
    AparteClient, AparteConfig, registerAllComponents, resolveConfig,
    type AparteChatImperativeApi, type AparteConversation, type AparteMessage, type AparteStorageAdapter,
} from '@aparte/core';
import AparteChat from '../AparteChat.vue';
import { useConversationManager } from '../../composables/useConversationManager.js';

registerAllComponents();

/** What a bubble reads: the text, whether the message carries it in `content` or in text segments. */
const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

function gatedClient(config: AparteConfig, chatId: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const client = new AparteClient({
        config,
        autoRegister: false,
        scopeToTargetId: chatId,
        streamRunner: async (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Hel' });
            await gate;
            opts.emitter({ type: 'text-delta', delta: 'lo' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    client.start();
    return { client, release };
}

function send(root: Element, chatId: string, content: string) {
    root.querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, targetId: chatId, timestamp: Date.now() }, bubbles: true, composed: true,
    }));
}

type Bound = 'conversationCreated' | 'the manager\'s activeId';

describe.each<Bound>(['conversationCreated', 'the manager\'s activeId'])('<AparteChat> given back the conversation it created through %s', (bound) => {
    it('keeps the first reply in its bubble and the person\'s message in place', async () => {
        const config = new AparteConfig();
        const { client, release } = gatedClient(config, 'chat-a');
        const chat = ref<AparteChatImperativeApi | null>(null);
        const seen: Array<string | null> = [];
        const Page = defineComponent({
            setup() {
                const cm = useConversationManager();
                const id = ref<string | null>(null);
                const ready = ref(false);
                void cm.init(memoryAdapter(), config).then(() => { ready.value = true; });
                return () => {
                    const conversationId = bound === 'conversationCreated' ? id.value : cm.activeId.value;
                    seen.push(conversationId);
                    return ready.value ? h(AparteChat, {
                        ref: chat, id: 'chat-a', config, conversationId,
                        onConversationCreated: (created: string) => { id.value = created; },
                    }) : null;
                };
            },
        });
        const wrapper = mount(Page, { attachTo: document.body });
        await vi.waitFor(() => expect(chat.value).not.toBeNull());
        await new Promise((r) => setTimeout(r, 0));

        send(wrapper.element.ownerDocument.body, 'chat-a', 'hello');
        await vi.waitFor(() => expect(seen.at(-1)).not.toBeNull());
        await vi.waitFor(() => expect(chat.value!.isStreaming()).toBe(true));
        release();
        await vi.waitFor(() => expect(chat.value!.isStreaming()).toBe(false));

        expect(chat.value!.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]);
        expect(chat.value!.getConversationId()).toBe(seen.at(-1));
        client.stop();
        wrapper.unmount();
    });
});

describe('<AparteChat config>', () => {
    it('follows a new config, once the turn in flight has ended', async () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const wrapper = mount(AparteChat, { props: { id: 'chat-c', config: first } });
        await new Promise((r) => setTimeout(r, 0));
        const root = (wrapper.vm as unknown as AparteChatImperativeApi).getElement()!;
        expect(resolveConfig(root)).toBe(first);

        await wrapper.setProps({ config: second });
        expect(resolveConfig(root)).toBe(second);

        root.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        await wrapper.setProps({ config: first });
        expect(resolveConfig(root)).toBe(second);
        root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } }));
        expect(resolveConfig(root)).toBe(first);
        wrapper.unmount();
    });
});
