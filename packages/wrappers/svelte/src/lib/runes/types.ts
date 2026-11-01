import type { Snippet } from 'svelte';
import type { AparteConfig } from '@aparte/core';
import type { AparteActionEventDetail, AparteMessage, AparteSendEventDetail } from '../types.js';

/**
 * The props of the Svelte 5 `<AparteChat>`: the same surface as the other three wrappers,
 * in runes — `messages` is bindable, the five places for your own markup are snippets, and
 * every event is a callback prop.
 */
export interface AparteChatProps {
    /** The host element's `id`, and therefore the `targetId` every event this chat carries. Generated when omitted. */
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
    /** An instance config for this chat; read once, when the host mounts. */
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

    /** The person sent a message. It is already in the thread: do not add it again. */
    onmessageSent?: (detail: AparteSendEventDetail) => void;
    /** A custom bubble action was clicked. */
    onaction?: (detail: AparteActionEventDetail) => void;
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
