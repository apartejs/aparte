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
    /**
     * Append text to a segment of the last message — the streaming path for a
     * thinking block, a tool pill, or any segment that grows token by token.
     *
     * Each chunk is written straight into the bubble, and the framework's message
     * list is synced **once per frame** rather than per chunk, so streaming a
     * segment costs about one render per frame instead of one per token.
     *
     * Note that segments and `content` are mutually exclusive at render time: as
     * soon as a message has segments the bubble hides its plain `content`, so a
     * message driven by `injectTokenStream` (which writes `content`) can't also show
     * a `thinking` segment — put the text in a segment of its own instead.
     */
    appendToSegment: (segmentId: string, content: string) => void;
    getMessages: () => AparteMessage[];
    clearMessages: () => void;
    // ── branch / edit ──
    addBranch: (messageId: string) => number;
    addSiblingOf: (existingId: string, message: AparteMessage) => string | null;
    truncateFrom: (messageId: string) => void;
    truncateResponsesAfter: (userMessageId: string) => void;
    // ── manual token streaming (agnostic AsyncIterable) ──
    /**
     * Stream tokens into a message from your own loop (no `AparteClient`
     * involved) — the display-only / bring-your-own-loop mode. Resolves when
     * the iterable completes; the message is then marked complete.
     *
     * If `messageId` doesn't exist the viewport auto-creates an empty
     * assistant message — but only in its internal repo, NOT in the
     * framework's message state. In a wrapper, call
     * `appendMessage({ id, role: 'assistant', content: '' , timestamp: Date.now() })`
     * first so both stay in sync. Starting a new stream cancels the previous
     * one; {@link stopTokenStream} cancels explicitly. See the
     * "Bring your own loop" guide.
     */
    injectTokenStream: (messageId: string, tokens: AsyncIterable<string>) => Promise<void>;
    /** Abort an in-flight {@link injectTokenStream} loop (the source iterable is `return()`ed). */
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
