import { get, writable, type Writable } from 'svelte/store';
import type { AparteChatImperativeApi } from '@aparte/core';
import type { AparteMessage } from '../types.js';

/**
 * The messages store and the connection, plus the whole imperative surface — it extends
 * {@link AparteChatImperativeApi}, so a method added there is here, not left behind.
 */
export interface AparteChatStore extends AparteChatImperativeApi {
    /** Subscribe with `$messages` and bind to `<AparteChat messages={$messages}>`. */
    messages: Writable<AparteMessage[]>;
    /** Register the component instance via `bind:this`. */
    connect(component: AparteChatImperativeApi | null): void;
    /** Wire to `on:messagesChange={(e) => chat.onMessagesChange(e.detail)}`. */
    onMessagesChange(messages: AparteMessage[]): void;
}

/**
 * Idiomatic Svelte ergonomics for `<AparteChat>`. Owns the `messages` store so the
 * consumer skips the manual `on:messagesChange` → `messages` round-trip.
 *
 * @example
 * const chat = createAparteChat();
 * const { messages } = chat;
 * let comp;
 * $: chat.connect(comp);
 * // <AparteChat bind:this={comp} messages={$messages}
 * //   on:messagesChange={(e) => chat.onMessagesChange(e.detail)} />
 *
 * For the Svelte 4 component. On Svelte 5, `bind:messages` on the `<AparteChat>` from
 * `@aparte/svelte/runes` does the same without a store.
 */
export function createAparteChat(initial: AparteMessage[] = []): AparteChatStore {
    const messages = writable<AparteMessage[]>([...initial]);
    let comp: AparteChatImperativeApi | null = null;
    return {
        messages,
        connect: (component) => { comp = component; },
        onMessagesChange: (m) => messages.set(m),
        appendMessage: (m, o) => comp?.appendMessage(m, o),
        updateMessage: (id, u) => comp?.updateMessage(id, u),
        updateLastMessage: (c, o) => comp?.updateLastMessage(c, o),
        addSegment: (s) => comp?.addSegment(s),
        updateSegment: (id, u) => comp?.updateSegment(id, u),
        removeSegment: (id) => comp?.removeSegment(id),
        appendToSegment: (id, c) => comp?.appendToSegment(id, c),
        getMessages: () => comp?.getMessages() ?? get(messages),
        clearMessages: (o) => comp?.clearMessages(o),
        addBranch: (id) => comp?.addBranch(id) ?? 0,
        addSiblingOf: (id, m) => comp?.addSiblingOf(id, m) ?? null,
        truncateFrom: (id) => comp?.truncateFrom(id),
        truncateResponsesAfter: (id) => comp?.truncateResponsesAfter(id),
        injectTokenStream: (id, tokens) => comp?.injectTokenStream(id, tokens) ?? Promise.resolve(),
        stopTokenStream: () => comp?.stopTokenStream(),
        setConversationId: (id) => comp?.setConversationId(id) ?? Promise.resolve(),
        getConversationId: () => comp?.getConversationId() ?? null,
        isStreaming: () => comp?.isStreaming() ?? false,
        scrollToBottom: () => comp?.scrollToBottom(),
        focusInput: () => comp?.focusInput(),
        getViewport: () => comp?.getViewport() ?? null,
        getElement: () => comp?.getElement() ?? null,
        getComposer: () => comp?.getComposer() ?? null,
    };
}
