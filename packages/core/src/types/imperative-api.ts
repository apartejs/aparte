import type { AparteMessage } from './models.js';
import type { AparteSegment } from './segments.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';

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
    /**
     * Append a message. `{ historical: true }` says it is RESTORED, not live: its
     * segments are adopted as they are — no fresh timing stamps, `isStreaming` forced
     * off — the way a stored conversation is loaded, so a tool call read back from
     * your own backend renders settled rather than spinning. Use it when you replay
     * history one message at a time; a live turn passes nothing.
     */
    appendMessage: (message: AparteMessage, options?: { historical?: boolean }) => void;
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
    clearMessages: (options?: { revokeAttachments?: boolean }) => void;
    // ── branch / edit ──
    addBranch: (messageId: string) => number;
    addSiblingOf: (existingId: string, message: AparteMessage) => string | null;
    truncateFrom: (messageId: string) => void;
    truncateResponsesAfter: (userMessageId: string) => void;
    // ── manual token streaming (agnostic AsyncIterable) ──
    /**
     * Stream tokens into a message from your own loop (no `AparteClient`
     * involved). It sends the turn's lifecycle events itself — `aparte-message-start`,
     * then `-done`, `-aborted` or `-error` — so the composer shows Stop, its Stop
     * cancels the stream, and the conversation manager saves the reply. Resolves when
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
    /**
     * Open a conversation now — the same id again re-reads it from the conversation manager.
     * The `conversationId` prop is the declarative path, and it is a no-op for the
     * conversation the chat already shows or is creating.
     */
    setConversationId: (id: string | null) => Promise<void>;
    /**
     * The conversation this chat shows: the one it opened, or the one its first message is
     * creating; `null` before either. Per chat — the conversation manager's `activeId` names
     * whichever chat opened one last — so it is what a list beside several chats highlights.
     */
    getConversationId: () => string | null;
    // ── misc ──
    scrollToBottom: () => void;
    focusInput: () => void;
    isStreaming: () => boolean;
    /** The `<aparte-chat-viewport>` element — same `getViewport()` on all four wrappers. */
    getViewport: () => HTMLElement | null;
    /**
     * The chat's root element — the `div[data-aparte-chat]` in React, Vue and Svelte, the
     * host `<aparte-chat>` in Angular — once mounted, `null` before. Every event the chat's
     * parts send bubbles up to it, so this is where to listen for one core has no prop for:
     * a plugin's (`aparte-subagent-open`, `aparte-artifact-open`…) or your own.
     * `getElement().addEventListener('aparte-subagent-open', …)`. Same name as
     * {@link AparteUiHandle.getElement}.
     */
    getElement: () => HTMLElement | null;
    /**
     * The chat's `<aparte-composer>` element, once mounted, `null` before — for its methods
     * and the events it sends. `setValue(text)` writes the draft, `submit()` sends it as
     * the Send button does (and stops the reply while one streams), `addAttachments(files)`
     * adds files to it, `focus()` and `reset()`. {@link focusInput} focuses its field.
     *
     * A send held with `aparte-before-send` stays in the composer: `getComposer()?.submit()`
     * sends it once it can go.
     */
    getComposer: () => AparteComposer | null;
}

/**
 * The imperative surface every framework `<AparteUi>` proxy exposes — React's ref
 * handle, Vue's template ref, Svelte's `bind:this`, Angular's `@ViewChild`.
 *
 * It lives here for the same reason {@link AparteChatImperativeApi} does: it was
 * hand-copied into all four wrappers, each docblock promising "the same contract on
 * all four", and it had already drifted once (two of them returned
 * `HTMLElement | null` / `unknown` instead of the generic form). One declaration, four
 * re-exports, and a divergence is a compile error rather than a promise in prose.
 */
export interface AparteUiHandle {
    /** The proxied custom element, once mounted. */
    getElement<T extends HTMLElement = HTMLElement>(): T | null;
    /** Call a method on it — the escape hatch for an element-specific API. */
    callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined;
}
