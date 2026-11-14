/**
 * Which conversation a chat has open, readable from outside the chat.
 *
 * The conversation controller is the one that knows: it opens, switches and creates a
 * chat's conversation. `AparteClient` does not live in the chat, it lives beside it — it
 * finds the element it renders into by id — so the controller leaves a reader on the
 * chat's host element, and the client climbs from the element it renders into until it
 * finds one.
 *
 * A symbol slot on the element, as `attachConfig` leaves an instance config: no attribute
 * written into a DOM a framework owns, and no method on the element for an app to take as
 * API. `Symbol.for`, so two copies of core on one page still agree on the slot.
 */

const OPEN_CONVERSATION = Symbol.for('aparte.openConversation');

interface ConversationHost {
    [OPEN_CONVERSATION]?: () => string | null;
}

/**
 * Leave `read` on `host`, the chat's element, for {@link openConversationOf}. Returns what
 * takes it away again — and only if it is still the one that was left, so the teardown of a
 * controller a framework has already replaced on the same element undoes nothing.
 */
export function offerOpenConversation(host: HTMLElement, read: () => string | null): () => void {
    const slot = host as unknown as ConversationHost;
    slot[OPEN_CONVERSATION] = read;
    return () => {
        if (slot[OPEN_CONVERSATION] === read) delete slot[OPEN_CONVERSATION];
    };
}

/**
 * The id of the conversation open in the chat `el` is in, as of this moment — `null` when
 * the chat has none open, or when nothing manages the chat's conversations at all.
 *
 * Read when the person acts, not before: it answers for now, and a conversation the person
 * opens a moment later is another answer.
 */
export function openConversationOf(el: Element | null | undefined): string | null {
    for (let node: Element | null | undefined = el; node; node = node.parentElement) {
        const read = (node as unknown as ConversationHost)[OPEN_CONVERSATION];
        if (read) return read();
    }
    return null;
}
