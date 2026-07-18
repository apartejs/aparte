import type { AparteMessage } from './models.js';
import type { AparteSegment } from './segments.js';

/**
 * The canonical imperative surface a framework `<AparteChat>` exposes (React's
 * ref handle, Vue/Svelte's instance, Angular's component). All four delegate to
 * the framework-agnostic `AparteChatHost`, so this ONE contract is the single
 * source of truth, and each wrapper enforces it against the compiler — React via
 * the ref-handle type on a return-annotated `useImperativeHandle`, Angular via
 * `implements`, Vue via `satisfies` on `defineExpose`, Svelte via a type-checked
 * parity factory — so a missing or mistyped method is a build error in that
 * wrapper, not a silent divergence.
 */
export interface AparteChatImperativeApi {
    // ── message + streaming surface ──
    appendMessage: (message: AparteMessage) => void;
    updateMessage: (messageId: string, updates: Partial<AparteMessage>) => void;
    updateLastMessage: (content: string, options?: { append?: boolean }) => void;
    addSegment: (segment: AparteSegment) => void;
    updateSegment: (segmentId: string, updates: Partial<AparteSegment>) => void;
    removeSegment: (segmentId: string) => void;
    appendToSegment: (segmentId: string, content: string) => void;
    getMessages: () => AparteMessage[];
    clearMessages: () => void;
    // ── branch / edit ──
    addBranch: (messageId: string) => number;
    addSiblingOf: (existingId: string, message: AparteMessage) => string | null;
    truncateFrom: (messageId: string) => void;
    truncateResponsesAfter: (userMessageId: string) => void;
    // ── manual token streaming (agnostic AsyncIterable) ──
    injectTokenStream: (messageId: string, tokens: AsyncIterable<string>) => Promise<void>;
    stopTokenStream: () => void;
    // ── conversation lifecycle ──
    setConversationId: (id: string | null) => Promise<void>;
    // ── misc ──
    scrollToBottom: () => void;
    focusInput: () => void;
    isStreaming: () => boolean;
    /** The `<aparte-chat-viewport>` element — same `getViewport()` on all four wrappers. */
    getViewport: () => HTMLElement | null;
}
