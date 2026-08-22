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
import type { AparteArtifactSegment } from '../types/segments.js';

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
 */
export function dispatchLifecycleEvent(
    target: AparteLifecycleTarget,
    name: string,
    detail: unknown,
): void {
    const id = target.id || undefined;
    const stamped = detail && typeof detail === 'object'
        ? { targetId: id, ...(detail as Record<string, unknown>) }
        : detail;
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: stamped }));
}

/**
 * Dispatch the artifact lifecycle: `aparte-artifact-start` once per segment id,
 * `aparte-artifact-delta` when the body actually grew, and `aparte-artifact-ready`
 * when `isFinal`. `progress` tracks the per-id length already broadcast, so a
 * re-render cannot replay a delta.
 *
 * The segment parameter is structural rather than `AparteArtifactSegment` because the
 * adapter builds its segments from stream events and never constructs the full type;
 * the import above keeps the two documented as the same thing.
 */
export function dispatchArtifactLifecycle(
    target: AparteLifecycleTarget,
    messageId: string,
    segment: Pick<AparteArtifactSegment, 'id'> & Partial<Pick<AparteArtifactSegment, 'content' | 'mimeType' | 'artifactType' | 'title'>>,
    progress: Map<string, number>,
    isFinal: boolean,
): void {
    const id = segment.id;
    const content = segment.content ?? '';

    if (progress.get(id) === undefined) {
        target.dispatchEvent(new CustomEvent('aparte-artifact-start', {
            bubbles: true,
            composed: true,
            detail: {
                messageId,
                segmentId: id,
                mimeType: segment.mimeType,
                artifactType: segment.artifactType,
                title: segment.title,
            },
        }));
        progress.set(id, 0);
    }

    const lastLen = progress.get(id) ?? 0;
    if (content.length > lastLen) {
        target.dispatchEvent(new CustomEvent('aparte-artifact-delta', {
            bubbles: true,
            composed: true,
            detail: { segmentId: id, chunk: content.slice(lastLen) },
        }));
        progress.set(id, content.length);
    }

    if (isFinal) {
        target.dispatchEvent(new CustomEvent('aparte-artifact-ready', {
            bubbles: true,
            composed: true,
            detail: {
                messageId,
                segmentId: id,
                mimeType: segment.mimeType,
                artifactType: segment.artifactType,
                title: segment.title,
                content,
            },
        }));
    }
}
