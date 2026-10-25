import type { AparteCompactDoneEventDetail } from '../types/events.js';
import type { AparteMessage } from '../types/models.js';
import { chatBoundaryOf } from '../utils/chat-boundary.js';

/** The two methods a transcript owner exposes: where a message is read and where it is written. */
interface TranscriptStore {
    getMessages(): AparteMessage[];
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void;
}

const isStore = (candidate: unknown): candidate is TranscriptStore =>
    !!candidate
    && typeof (candidate as TranscriptStore).getMessages === 'function'
    && typeof (candidate as TranscriptStore).updateMessage === 'function';

/**
 * The element that owns the transcript the bubble `from` is a part of.
 *
 * Under a wrapper that is the chat host (`<aparte-chat>`, or the `[data-aparte-chat]` root
 * of React, Vue and Svelte): its `getMessages` and `updateMessage` are the framework's own
 * list, and the viewport inside it holds only a copy rebuilt for branch operations —
 * writing the copy would leave the list, and so the storage, with the checkpoint. A chat
 * with no framework has no such methods on its host, and the viewport is the store.
 */
function storeOf(from: Element): TranscriptStore | null {
    const boundary = chatBoundaryOf(from);
    if (isStore(boundary)) return boundary;
    const viewport = from.closest('aparte-chat-viewport');
    return isStore(viewport) ? viewport : null;
}

/**
 * Restore: take every checkpoint off the transcript `from` belongs to, so the model reads
 * the original messages again, and say so on `window`.
 *
 * EVERY checkpoint of the active path, not the one Restore was pressed on. A path that was
 * summarised twice carries two (the second summary was written over the first), and
 * removing only the newer would put the older summary back in front of messages the reader
 * asked to have restored — a partial restore that looks like a complete one.
 *
 * Each removal goes through the chat's own `updateMessage`, which is what makes it reach
 * the framework's list and the saved conversation as well as the bubble on screen; the
 * `aparte-compact-done` that follows is what the conversation controller saves on and the
 * gauge measures again on. A `restored: true` detail carries no summary: nothing was
 * summarised, something was undone.
 *
 * Returns how many checkpoints were removed. Nothing is dispatched when the bubble belongs
 * to no transcript that can be written — a restore that claimed to have happened would be
 * the worse answer.
 */
export function restoreContext(from: Element, detail: { messageId?: string; targetId?: string }): number {
    const store = storeOf(from);
    if (!store) return 0;
    const carrying = store.getMessages().filter((m) => m.contextSummary !== undefined).map((m) => m.id);
    for (const id of carrying) store.updateMessage(id, { contextSummary: undefined });
    const done: AparteCompactDoneEventDetail = { restored: true };
    if (detail.messageId) done.messageId = detail.messageId;
    if (detail.targetId) done.targetId = detail.targetId;
    window.dispatchEvent(new CustomEvent<AparteCompactDoneEventDetail>('aparte-compact-done', { detail: done }));
    return carrying.length;
}
