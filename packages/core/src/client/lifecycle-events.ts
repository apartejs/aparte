/**
 * The DOM lifecycle dispatchers, once.
 *
 * These two functions existed TWICE — as private methods on `AparteClient` and as
 * module-level copies in `stream-adapter.ts` — one per streaming loop. That is not a
 * size problem, it is a correctness problem the repo has already paid for, and the
 * adapter copy's own JSDoc recorded the bill:
 *
 *   the `targetId` stamp was missing from the adapter copy, and `aparte-composer`'s
 *   `_isForThisComposer` treats an ABSENT `targetId` as "for me" — deliberately, so a
 *   single-chat page needs no wiring. So on a two-chat page the engine path made
 *   stopping chat A reset chat B's composer as well. Core's inline path had always
 *   stamped it. The parity suite could not see it, because its recorder element has
 *   no `id`: both paths produced `targetId: undefined` and agreed.
 *
 * A duplicate that has already drifted once will drift again, and the suite that
 * exists to catch divergence between the two loops is structurally blind to this
 * one. So there is one copy now, and both loops call it.
 *
 * ## Why the target is declared here
 *
 * `stream-adapter.ts` must import this module, so importing its `StreamAdapterTarget`
 * back would close a real cycle. The structural type below is the intersection both
 * callers satisfy: core's client passes an `HTMLElement`, the adapter passes its
 * duck-typed target, and neither needs anything else.
 */

/** Anything that can receive a DOM event and may carry an id. */
export interface AparteLifecycleTarget {
    readonly id?: string;
    dispatchEvent(event: Event): boolean;
}

/**
 * Dispatch one bubbling, composed lifecycle event, stamped with the target's id so
 * several chats on one page stay isolated — a composer reacts only to its own host's
 * turn, while an id-less single-instance page still broadcasts.
 *
 * The `typeof detail === 'object'` guard comes from the adapter copy and is kept
 * deliberately: it is a superset of the client copy's unconditional spread, so
 * unifying on it cannot change any existing call, and it is the only difference
 * between the two versions that was ever load-bearing.
 *
 * `targetId` is the id of the chat the target BELONGS to, and the caller has to say
 * it, because `target.id` is not it. The target is whatever RENDERS — an
 * `<aparte-chat>` shell delegates to its `.viewport`, which carries no id — so the
 * stamp read empty for every shell-shaped chat, and a missing id means "for every
 * chat on the page" on the receive side. `target.id` stays the fallback: it is right
 * whenever the render target IS the chat host, which is the viewport-only shape.
 */
export function dispatchLifecycleEvent(
    target: AparteLifecycleTarget,
    name: string,
    detail: unknown,
    targetId?: string,
): void {
    const id = targetId ?? (target.id || undefined);
    const stamped = detail && typeof detail === 'object'
        ? { targetId: id, ...(detail as Record<string, unknown>) }
        : detail;
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: stamped }));
}
