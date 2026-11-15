import type { Snippet } from 'svelte';
import type { AparteConfig, AparteTypeToFocus } from '@aparte/core';
import type { AparteMessage } from '../types.js';
import type { AparteChatEventCallbacks } from '../generated/chat-events.js';

/**
 * The props of the Svelte 5 `<AparteChat>`: the same surface as the other three wrappers,
 * in runes — `messages` is bindable, the five places for your own markup are snippets, and
 * every event is a callback prop. The chat's events — `onmessageSent`, `onlinkClick`,
 * `onretry`… — are generated from `<aparte-chat>`'s own list ({@link AparteChatEventCallbacks}):
 * each receives the event's detail, then the event. Declared here are the data, the snippets
 * and what the host reports back (`onmessagesChange` and the three after it).
 */
/**
 * The events a plugin adds to `HTMLElementEventMap` (`aparte-subagent-open`…) as the event
 * attributes Svelte 5 gives them — `onaparte-subagent-open={(event) => …}` — typed by that map.
 */
type AparteElementEventAttributes = {
    [K in Extract<keyof HTMLElementEventMap, `aparte-${string}`> as `on${K}`]?: (event: HTMLElementEventMap[K]) => void;
};

export interface AparteChatProps extends AparteChatEventCallbacks, AparteElementEventAttributes {
    /**
     * Any other `onaparte-*` event — a plugin's whose package is not imported, or your own. The
     * attribute is set on the chat's root element (`getElement()`), where the event arrives.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any event's detail
    [event: `onaparte-${string}`]: ((event: CustomEvent<any>) => void) | undefined;    /** The host element's `id`, and therefore the `targetId` every event this chat carries. Generated when omitted. */
    id?: string;
    /** The messages on the active path. Bindable: `bind:messages` keeps yours in step with what the chat does. */
    messages?: AparteMessage[];
    placeholder?: string;
    disabled?: boolean;
    /** A waiting line you drive yourself; the chat turns it off on the first streamed token. */
    isTyping?: boolean;
    typingText?: string;
    /** When false, Shift+Enter submits and a bare Enter inserts a newline. */
    submitOnEnter?: boolean;
    /** Where a key goes when it is typed while no field has the caret: `chat` (the default) returns it to the input after a click or a selection in the chat, `page` from anywhere in the page, `off` never. */
    typeToFocus?: AparteTypeToFocus;
    /** Freeze viewport spacer recalculation for this many ms after a conversation swap. */
    layoutTransitionMs?: number;
    /** The composer sits centred, with `emptyState` above it, until the first message. */
    centerWhenEmpty?: boolean;
    /** A wait of your own: skeleton turns, no empty state, composer disabled. */
    loading?: boolean;
    /** Overlay the composer on the transcript. It can change after mount. */
    overlayComposer?: boolean;
    /** The file picker and the chips strip in the default composer. Off by default: your loop must read `files`. */
    attachments?: boolean;
    /** The presenter for questions to the person (approvals, `ask_user`). On by default. */
    elicitation?: boolean;
    /** Extra class names for the root element (`[data-aparte-chat]`). */
    class?: string;
    /** Inline style for the root element. */
    style?: string;
    /** Active conversation id (loads and persists through the registered conversation manager). */
    conversationId?: string | null;
    /** An instance config for this chat. A new one is applied once the turn in flight has ended, the messages kept. */
    config?: AparteConfig;

    /** The chat before the first message. */
    emptyState?: Snippet;
    /** The space above the composer. */
    aboveComposer?: Snippet;
    /** The composer, replaced by yours. */
    composer?: Snippet;
    /** The composer's bottom row; not drawn when you fill `composer`. */
    toolbar?: Snippet;
    /** Each message, drawn by you. */
    bubble?: Snippet<[AparteMessage]>;

    /**
     * The active path changed. With `bind:messages` you rarely need it. Without `bind:`, a parent
     * that keeps the list writes it back here — `onmessagesChange={(m) => (msgs = m)}` — in the
     * callback itself: a write-back after an `await` arrives later, as the parent's own word.
     */
    onmessagesChange?: (messages: AparteMessage[]) => void;
    /** One message was appended. */
    onmessageAppended?: (message: AparteMessage) => void;
    /** The waiting line toggled. */
    ontypingChange?: (typing: boolean) => void;
    /** The chat created a conversation (persistence). */
    onconversationCreated?: (id: string) => void;
}
