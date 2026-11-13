/**
 * A list of segments that is not a message: what a stream adapter can write into when what it
 * writes is not the reply on screen — a sub-agent's conversation, kept on the call that opened
 * it, or anything a plugin draws apart from the transcript.
 *
 * It stamps what joins it exactly as the two owners of a message's array do (`segments.ts`),
 * so a segment that lives here carries the same identity and the same measurements: `index`
 * is its position in THIS list, `startedAt` the moment it joined, `endedAt` the moment its
 * content last arrived. A list handed over at creation is adopted, not inserted: a list saved
 * while it ran comes back settled — nothing streaming, an open call stopped — and no time is
 * invented for it.
 *
 * DOM-free, so the SSR barrel carries it and a plugin's wiring can be tested in Node.
 */
import type { AparteConfig } from '../config/aparte-config.js';
import type { StreamAdapterTarget } from '../client/stream-adapter.js';
import type { AparteSegment } from '../types/index.js';
import { adoptSegment, mergeSegmentUpdate, stampSegmentOnInsert, stampSegmentOnUpdate } from './segments.js';

/**
 * A segment list a stream adapter writes into (`createStreamAdapter({ target: list, … })`):
 * its segments, and a way to hear each change.
 */
export interface AparteSegmentList extends StreamAdapterTarget {
    /** The segments, in order. A new array after every change; never mutate it. */
    readonly segments: readonly AparteSegment[];
    /** Called after each segment added or updated. Returns the function that stops it. */
    onChange(fn: () => void): () => void;
}

/**
 * A segment list a stream adapter can write into, stamped like a message's.
 *
 * `messageId` is the id stamped on each segment — the message the list belongs to. With a
 * `config`, a segment joining the list takes that config's segment defaults
 * (`setSegmentDefaults`), as it would in a chat. `segments` is a list saved earlier, adopted.
 *
 * `addSegment` and `updateSegment` are the writes; `updateMessage` and `setUsage` do nothing
 * (there is no message here), and `dispatchEvent` dispatches nothing: the events of the run
 * are the caller's to hear, with `observeRunEvents`.
 *
 * @example
 * const list = createSegmentList({ messageId });
 * const adapter = createStreamAdapter({ target: list, config, messageId });
 * list.onChange(() => draw(list.segments));
 */
export function createSegmentList(opts: {
    messageId: string;
    segments?: readonly AparteSegment[];
    config?: AparteConfig;
}): AparteSegmentList {
    const { messageId, config } = opts;
    let segments: readonly AparteSegment[] = (opts.segments ?? []).reduce<AparteSegment[]>((acc, segment) => {
        // A list handed over is history: settled, numbered, and never given a time.
        acc.push(adoptSegment(acc, segment, messageId));
        return acc;
    }, []);
    const listeners = new Set<() => void>();

    const changed = (): void => {
        for (const fn of [...listeners]) {
            try {
                fn();
            } catch (err) {
                console.error('[aparte] A segment-list listener threw', err);
            }
        }
    };

    return {
        get segments() {
            return segments;
        },
        onChange(fn) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        addSegment(segment) {
            const stamped = stampSegmentOnInsert(segments, segment, messageId, config?.getSegmentDefaults(segment.type));
            segments = [...segments, stamped];
            changed();
        },
        updateSegment(segmentId, updates) {
            const at = segments.findIndex((s) => s.id === segmentId);
            if (at === -1) return;
            const current = segments[at]!;
            const next = segments.slice();
            next[at] = mergeSegmentUpdate(current, stampSegmentOnUpdate(current, updates));
            segments = next;
            changed();
        },
        // The list is the message's segments: what an adapter reads to find what a run before
        // it placed (a resumed run's adapter is a new one).
        getMessage(id) {
            return id === messageId ? { segments } : undefined;
        },
        updateMessage() { /* no message here */ },
        setUsage() { /* no message here */ },
        dispatchEvent() {
            return true;
        },
    };
}
