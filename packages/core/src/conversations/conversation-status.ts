/**
 * What each conversation is doing, for every conversation list on the page.
 *
 * The conversation controller says it as turns start, pause and end, and a list applies it
 * to its row. An event alone was edge-triggered: a list that connected after it — a drawer
 * drawn on open, a history screen, a remount — never learnt that a conversation was
 * answering or waiting. So the state is also kept here, page-wide, and a list reads it
 * when it connects. Keyed by conversation id, as the event is: two independent chats with
 * colliding ids share it.
 *
 * No DOM at module level: the controller is also loaded in Node.
 */

/**
 * What a conversation is doing, as its row says it: `running` while an AI answers in it,
 * `waiting` while its turn waits on the page — a run paused on a question, an approval or a
 * browser tool, the one state a conversation keeps after the person has gone elsewhere.
 */
export type AparteConversationStatus = 'running' | 'waiting';

const known = new Map<string, AparteConversationStatus>();

/** Keep a conversation's state without telling anyone: for a list applying an event it heard. */
export function rememberConversationStatus(id: string, status: AparteConversationStatus | null): void {
    if (status) known.set(id, status);
    else known.delete(id);
}

/** Keep a conversation's state and tell every list: `aparte-conversation-status` on `window`. */
export function tellConversationStatus(id: string, status: AparteConversationStatus | null): void {
    rememberConversationStatus(id, status);
    try {
        window.dispatchEvent(new CustomEvent('aparte-conversation-status', { detail: { id, status } }));
    } catch {
        /* environments without window */
    }
}

/** A conversation's state as last told; `null` for neither. */
export function conversationStatusOf(id: string): AparteConversationStatus | null {
    return known.get(id) ?? null;
}

/** Forget every state. Internal: for tests, which share the page between cases. */
export function forgetConversationStatuses(): void {
    known.clear();
}
