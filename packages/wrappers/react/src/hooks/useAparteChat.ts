import { useRef, useState } from 'react';
import type { AparteMessage, AparteSegment } from '../types.js';
import type { AparteChatHandle } from '../components/AparteChat.js';

/**
 * Idiomatic React ergonomics for `<AparteChat>`. Owns the `messages` state and
 * the component ref so the consumer doesn't have to wire `onMessagesChange`
 * back into `messages` by hand. Spread `ref` + `messages` + `onMessagesChange`
 * onto `<AparteChat>` and drive it with the returned imperative helpers.
 *
 * @example
 * const chat = useAparteChat();
 * return (
 *   <AparteChat
 *     ref={chat.ref}
 *     messages={chat.messages}
 *     onMessagesChange={chat.setMessages}
 *     onMessageSent={(e) => chat.appendMessage({ id: crypto.randomUUID(), role: 'user', content: e.content, timestamp: e.timestamp })}
 *   />
 * );
 */
export interface UseAparteChat {
    messages: AparteMessage[];
    setMessages: React.Dispatch<React.SetStateAction<AparteMessage[]>>;
    // Typed to match `<AparteChat>`'s forwardRef target so `ref={chat.ref}`
    // typechecks verbatim — @types/react 18.3's variance rejects the
    // useRef(null) `RefObject<T | null>` shape against `Ref<T>`, so the (safe)
    // cast lives here once, not in every consumer.
    ref: React.RefObject<AparteChatHandle>;
    // ── imperative helpers (delegate to the component handle) ──
    appendMessage: (message: AparteMessage) => void;
    updateMessage: (messageId: string, updates: Partial<AparteMessage>) => void;
    updateLastMessage: (content: string, options?: { append?: boolean }) => void;
    addSegment: (segment: AparteSegment) => void;
    updateSegment: (segmentId: string, updates: Partial<AparteSegment>) => void;
    removeSegment: (segmentId: string) => void;
    appendToSegment: (segmentId: string, content: string) => void;
    clearMessages: () => void;
    addBranch: (messageId: string) => number;
    addSiblingOf: (existingId: string, message: AparteMessage) => string | null;
    truncateFrom: (messageId: string) => void;
    truncateResponsesAfter: (userMessageId: string) => void;
    injectTokenStream: (messageId: string, tokens: AsyncIterable<string>) => Promise<void>;
    stopTokenStream: () => void;
    setConversationId: (id: string | null) => Promise<void>;
    isStreaming: () => boolean;
}

export function useAparteChat(initial: AparteMessage[] = []): UseAparteChat {
    const [messages, setMessages] = useState<AparteMessage[]>(initial);
    const ref = useRef<AparteChatHandle | null>(null);
    const h = () => ref.current;
    return {
        messages,
        setMessages,
        ref: ref as React.RefObject<AparteChatHandle>,
        appendMessage: (m) => h()?.appendMessage(m),
        updateMessage: (id, u) => h()?.updateMessage(id, u),
        updateLastMessage: (c, o) => h()?.updateLastMessage(c, o),
        addSegment: (s) => h()?.addSegment(s),
        updateSegment: (id, u) => h()?.updateSegment(id, u),
        removeSegment: (id) => h()?.removeSegment(id),
        appendToSegment: (id, c) => h()?.appendToSegment(id, c),
        clearMessages: () => h()?.clearMessages(),
        addBranch: (id) => h()?.addBranch(id) ?? 0,
        addSiblingOf: (id, m) => h()?.addSiblingOf(id, m) ?? null,
        truncateFrom: (id) => h()?.truncateFrom(id),
        truncateResponsesAfter: (id) => h()?.truncateResponsesAfter(id),
        injectTokenStream: (id, tokens) => h()?.injectTokenStream(id, tokens) ?? Promise.resolve(),
        stopTokenStream: () => h()?.stopTokenStream(),
        setConversationId: (id) => h()?.setConversationId(id) ?? Promise.resolve(),
        isStreaming: () => h()?.isStreaming() ?? false,
    };
}
