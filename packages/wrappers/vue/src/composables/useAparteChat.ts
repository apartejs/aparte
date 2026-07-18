import { ref, type Ref } from 'vue';
import type { AparteChatImperativeApi } from '@aparte/core';
import type { AparteMessage, AparteSegment } from '../types.js';

/**
 * The imperative surface `<AparteChat>` exposes via `defineExpose` — the
 * canonical contract shared by all four wrappers (`AparteChatImperativeApi`).
 */
export type AparteChatInstance = AparteChatImperativeApi;

/**
 * Idiomatic Vue ergonomics for `<AparteChat>`. Owns the `messages` ref and a
 * component template ref so the consumer skips the manual
 * `@messages-change` → `messages` round-trip.
 *
 * @example
 * const chat = useAparteChat();
 * // template:
 * // <AparteChat :ref="chat.chatRef" :messages="chat.messages.value"
 * //   @messages-change="chat.onMessagesChange" />
 */
export function useAparteChat(initial: AparteMessage[] = []) {
    const messages = ref<AparteMessage[]>([...initial]) as Ref<AparteMessage[]>;
    const chatRef = ref<AparteChatInstance | null>(null);
    const c = () => chatRef.value;
    const onMessagesChange = (m: AparteMessage[]) => { messages.value = m; };

    return {
        messages,
        chatRef,
        onMessagesChange,
        appendMessage: (m: AparteMessage) => c()?.appendMessage(m),
        updateMessage: (id: string, u: Partial<AparteMessage>) => c()?.updateMessage(id, u),
        updateLastMessage: (content: string, o?: { append?: boolean }) => c()?.updateLastMessage(content, o),
        addSegment: (s: AparteSegment) => c()?.addSegment(s),
        updateSegment: (id: string, u: Partial<AparteSegment>) => c()?.updateSegment(id, u),
        removeSegment: (id: string) => c()?.removeSegment(id),
        appendToSegment: (id: string, content: string) => c()?.appendToSegment(id, content),
        clearMessages: () => c()?.clearMessages(),
        addBranch: (id: string) => c()?.addBranch(id) ?? 0,
        addSiblingOf: (id: string, m: AparteMessage) => c()?.addSiblingOf(id, m) ?? null,
        truncateFrom: (id: string) => c()?.truncateFrom(id),
        truncateResponsesAfter: (id: string) => c()?.truncateResponsesAfter(id),
        injectTokenStream: (id: string, tokens: AsyncIterable<string>) =>
            c()?.injectTokenStream(id, tokens) ?? Promise.resolve(),
        stopTokenStream: () => c()?.stopTokenStream(),
        setConversationId: (id: string | null) => c()?.setConversationId(id) ?? Promise.resolve(),
        isStreaming: () => c()?.isStreaming() ?? false,
    };
}
