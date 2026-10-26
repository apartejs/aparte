import type {
    AparteCompactDoneEventDetail,
    AparteCompactErrorEventDetail,
    AparteCompactStartEventDetail,
} from '../types/events.js';

/** What the owner of a transcript has to tell the watcher about it. */
export interface CheckpointWatcherOptions {
    /** The id this chat answers to on `aparte-compact-*` events, `undefined` for an unnamed chat. */
    ownId(): string | undefined;
    /** The bubble drawn for a message id, or `null` while it is not on the page (a framework renders late). */
    bubbleOf(messageId: string): HTMLElement | null;
    /**
     * Whether this chat's transcript holds the message. Answered from the transcript, not the
     * DOM: a framework paints a bubble late, and a message that is on the list belongs to this
     * chat whether or not it is drawn yet. An event about a message this returns false for is
     * another chat's, whatever id it carries.
     */
    owns(messageId: string): boolean;
    /**
     * Whether this watcher is the one answering for the chat. The vanilla viewport and the
     * framework host both exist under a wrapper, and only one of them may write the bubbles:
     * the viewport steps aside once a framework manages the DOM.
     */
    active?(): boolean;
}

/**
 * The id of the chat `el` belongs to: the nearest `<aparte-chat>` or `[data-aparte-chat]`
 * above it that HAS one, `undefined` for an unnamed chat. The same climb the bubble, the
 * composer and the gauge make for their own events, so an event naming a chat and an element
 * answering for it agree about which is which.
 */
export function chatIdOf(el: Element): string | undefined {
    let node: Element | null = el.parentElement;
    while (node) {
        const isHost = node.tagName.toLowerCase() === 'aparte-chat' || node.hasAttribute('data-aparte-chat');
        if (isHost && node.id) return node.id;
        node = node.parentElement;
    }
    return undefined;
}

/**
 * Says on the bubble what a compaction is doing to the message it will sit on.
 *
 * A checkpoint is written onto the first message the model keeps verbatim, and the
 * compaction names that message the moment it starts (`aparte-compact-start.messageId`).
 * From then on, until the summary arrives or fails, that bubble carries
 * `data-checkpoint="pending"` and the separator above it says the context is being
 * summarised; on a failure it carries `data-checkpoint="failed"` (and
 * `data-checkpoint-reason`) and the separator offers Retry. The bubble draws it — this only
 * sets the two attributes, so the vanilla viewport and the framework host, which have
 * different bubbles to find and different lifetimes, share one rule for WHEN.
 *
 * What clears it, and what must not:
 * - a `-done` for that very message, unless it was skipped (a skipped run did not write
 *   what the pending line announced, so the line stays until something answers it);
 * - the next `-start`, which names a message of its own;
 * - a conversation switch (`clear()`), because the bubble is not that chat's any more.
 * A `-done` or `-error` for another message, or for another chat on the page, changes
 * nothing: two chats compact at the same time, and one of them finishing must not wipe the
 * line of the other. A chat with no id is addressed by events with no id, as everywhere, and
 * an event is acted on only when its message is in this chat's transcript (`owns`).
 *
 * The state is remembered here as well as written to the bubble, because under a framework
 * the bubble can be created after the event (`reapply()` writes it again on every sync).
 */
export class CheckpointStateWatcher {
    private _messageId: string | null = null;
    private _state: 'pending' | 'failed' | null = null;
    private _reason = '';
    /** The bubble the attributes were last written to, so they can be taken off it even after it left the lookup. */
    private _marked: HTMLElement | null = null;

    constructor(private readonly _options: CheckpointWatcherOptions) {}

    /** Listen on `window` for the three events; returns the function that stops. */
    start(): () => void {
        // An event naming no chat is for every chat, and a chat with no id is for those only,
        // as everywhere else in the library. The id cannot tell two chats apart, though, once
        // one of them is unnamed: an untargeted event reaches both. The message does — it is
        // in one transcript and not in the other — so what the watcher acts on is an event
        // about a message of its own, checked before anything is cleared.
        const mine = (targetId?: string): boolean => {
            if (this._options.active && !this._options.active()) return false;
            return !targetId || targetId === this._options.ownId();
        };
        const mineMessage = (messageId?: string): messageId is string => !!messageId && this._options.owns(messageId);
        const onStart = (e: Event): void => {
            const detail = (e as CustomEvent<AparteCompactStartEventDetail | undefined>).detail;
            if (!mine(detail?.targetId) || !mineMessage(detail?.messageId)) return;
            this.clear();
            this._set(detail.messageId, 'pending', '');
        };
        const onDone = (e: Event): void => {
            const detail = (e as CustomEvent<AparteCompactDoneEventDetail | undefined>).detail;
            if (!mine(detail?.targetId) || detail?.skipped) return;
            if (detail?.messageId && detail.messageId === this._messageId) this.clear();
        };
        const onError = (e: Event): void => {
            const detail = (e as CustomEvent<AparteCompactErrorEventDetail | undefined>).detail;
            if (!mine(detail?.targetId) || !mineMessage(detail?.messageId)) return;
            if (detail.messageId !== this._messageId) this.clear();
            this._set(detail.messageId, 'failed', detail.error ?? '');
        };
        window.addEventListener('aparte-compact-start', onStart);
        window.addEventListener('aparte-compact-done', onDone);
        window.addEventListener('aparte-compact-error', onError);
        return () => {
            window.removeEventListener('aparte-compact-start', onStart);
            window.removeEventListener('aparte-compact-done', onDone);
            window.removeEventListener('aparte-compact-error', onError);
        };
    }

    /** Take the state off the bubble and forget it. */
    clear(): void {
        const bubble = this._marked ?? (this._messageId ? this._options.bubbleOf(this._messageId) : null);
        this._messageId = null;
        this._state = null;
        this._reason = '';
        this._marked = null;
        // The state first, the reason after: a reason that goes while the state is still
        // `failed` would redraw the separator once for nothing.
        bubble?.removeAttribute('data-checkpoint');
        bubble?.removeAttribute('data-checkpoint-reason');
    }

    /** Write the remembered state onto the bubble, which may have been created since. */
    reapply(): void {
        if (!this._messageId || !this._state) return;
        this._write(this._messageId, this._state, this._reason);
    }

    private _set(messageId: string, state: 'pending' | 'failed', reason: string): void {
        this._messageId = messageId;
        this._state = state;
        this._reason = reason;
        this._write(messageId, state, reason);
    }

    private _write(messageId: string, state: 'pending' | 'failed', reason: string): void {
        const bubble = this._options.bubbleOf(messageId);
        if (!bubble) return;
        if (this._marked && this._marked !== bubble) {
            this._marked.removeAttribute('data-checkpoint');
            this._marked.removeAttribute('data-checkpoint-reason');
        }
        this._marked = bubble;
        // The reason before the state, so a failure draws once, with its reason; a SECOND
        // failure, which leaves the state as it is, changes only the reason, and the bubble
        // redraws on that (it watches the reason while the state is `failed`).
        if (reason) bubble.setAttribute('data-checkpoint-reason', reason);
        else bubble.removeAttribute('data-checkpoint-reason');
        if (bubble.getAttribute('data-checkpoint') !== state) bubble.setAttribute('data-checkpoint', state);
    }
}
