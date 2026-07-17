import { writable, type Writable } from 'svelte/store';
import type { AparteMessage, AparteSegment } from '../types.js';

/** The imperative surface `<AparteChat>` exposes (its `export function`s). */
export interface AparteChatInstance {
    appendMessage(message: AparteMessage): void;
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void;
    updateLastMessage(content: string, options?: { append?: boolean }): void;
    addSegment(segment: AparteSegment): void;
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
    removeSegment(segmentId: string): void;
    appendToSegment(segmentId: string, content: string): void;
    getMessages(): AparteMessage[];
    clearMessages(): void;
    addBranch(messageId: string): number;
    addSiblingOf(existingId: string, message: AparteMessage): string | null;
    truncateFrom(messageId: string): void;
    truncateResponsesAfter(userMessageId: string): void;
    injectTokenStream(messageId: string, tokens: AsyncIterable<string>): Promise<void>;
    stopTokenStream(): void;
    setConversationId(id: string | null): Promise<void>;
    isStreaming(): boolean;
}

export interface AparteChatStore {
    /** Subscribe with `$messages` and bind to `<AparteChat messages={$messages}>`. */
    messages: Writable<AparteMessage[]>;
    /** Register the component instance via `bind:this`. */
    connect(component: AparteChatInstance | null): void;
    /** Wire to `on:messagesChange={(e) => chat.onMessagesChange(e.detail)}`. */
    onMessagesChange(messages: AparteMessage[]): void;
    appendMessage(message: AparteMessage): void;
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void;
    updateLastMessage(content: string, options?: { append?: boolean }): void;
    addSegment(segment: AparteSegment): void;
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
    removeSegment(segmentId: string): void;
    appendToSegment(segmentId: string, content: string): void;
    clearMessages(): void;
    addBranch(messageId: string): number;
    addSiblingOf(existingId: string, message: AparteMessage): string | null;
    truncateFrom(messageId: string): void;
    truncateResponsesAfter(userMessageId: string): void;
    injectTokenStream(messageId: string, tokens: AsyncIterable<string>): Promise<void>;
    stopTokenStream(): void;
    setConversationId(id: string | null): Promise<void>;
    isStreaming(): boolean;
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
 */
export function createAparteChat(initial: AparteMessage[] = []): AparteChatStore {
    const messages = writable<AparteMessage[]>([...initial]);
    let comp: AparteChatInstance | null = null;
    return {
        messages,
        connect: (component) => { comp = component; },
        onMessagesChange: (m) => messages.set(m),
        appendMessage: (m) => comp?.appendMessage(m),
        updateMessage: (id, u) => comp?.updateMessage(id, u),
        updateLastMessage: (c, o) => comp?.updateLastMessage(c, o),
        addSegment: (s) => comp?.addSegment(s),
        updateSegment: (id, u) => comp?.updateSegment(id, u),
        removeSegment: (id) => comp?.removeSegment(id),
        appendToSegment: (id, c) => comp?.appendToSegment(id, c),
        clearMessages: () => comp?.clearMessages(),
        addBranch: (id) => comp?.addBranch(id) ?? 0,
        addSiblingOf: (id, m) => comp?.addSiblingOf(id, m) ?? null,
        truncateFrom: (id) => comp?.truncateFrom(id),
        truncateResponsesAfter: (id) => comp?.truncateResponsesAfter(id),
        injectTokenStream: (id, tokens) => comp?.injectTokenStream(id, tokens) ?? Promise.resolve(),
        stopTokenStream: () => comp?.stopTokenStream(),
        setConversationId: (id) => comp?.setConversationId(id) ?? Promise.resolve(),
        isStreaming: () => comp?.isStreaming() ?? false,
    };
}
