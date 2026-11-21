import type {
    AparteAttachment,
    AparteMessage,
    AparteSegment,
    AparteSiblingInfo,
    AparteUsage,
    AparteFinishReason,
    AparteContextSummary,
    AparteMessageToken,
    AparteAuthor,
} from '../../types/index.js';
import { isTerminalStatus } from '../../utils/segments.js';

/**
 * Minimal structural type representing the imperative slice of `AparteChatBubble`
 * needed to reconcile a message into a bubble. Declared loosely so framework
 * wrappers can pass any element that exposes the same surface (custom element
 * registered cross-context, mocked test double, etc.) without dragging the
 * concrete `AparteChatBubble` class through every wrapper's typing.
 */
export interface SyncableBubble {
    getSegments?: () => AparteSegment[];
    setSegments?: (segments: AparteSegment[]) => void;
    updateSegment?: (segmentId: string, updates: Partial<AparteSegment>) => void;
    setContent?: (content: string) => void;
    setTokens?: (tokens: readonly AparteMessageToken[] | undefined) => void;
    setAttachments?: (attachments: AparteAttachment[]) => void;
    setSiblings?: (count: number, index: number) => void;
    setUsage?: (usage: AparteUsage | null | undefined) => void;
    setFinishReason?: (reason: AparteFinishReason | null | undefined) => void;
    setContextSummary?: (summary: AparteContextSummary | null | undefined, options?: { legacy?: boolean }) => void;
    setAuthor?: (author: AparteAuthor | undefined) => void;
    setKind?: (kind: AparteMessage['kind']) => void;
    setNote?: (note: string | undefined) => void;
}

/**
 * The message's segments, its last one flagged `isStreaming: true` while the message streams.
 *
 * A host redraws the bubble with `setSegments` each time a new segment streams in, so the
 * new segment's FIRST chunk is drawn by a full redraw. The stream parser's text carries no
 * flag, and `setup` reads a missing flag as finished (a restored message carries none
 * either), so that chunk went through the one-shot Markdown provider: with marked,
 * `Done: **Book ` showed its `**` raw until the next chunk reached the streaming renderer.
 * Only the last segment is arriving; only a text or reasoning one is written as Markdown;
 * and a flag the producer set is kept. The bubble settles it when the message ends — this
 * function's caller sends `isStreaming: false` then.
 */
/** Fields core stamps on a segment as it joins a bubble: never a change the parent made. */
const STAMPED = new Set(['id', 'type', 'messageId', 'index', 'meta']);

/** An object field, serialised once per object: a re-render hands the same ones again. */
const serialised = new WeakMap<object, string>();
const valueKey = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    let key = serialised.get(value);
    if (key === undefined) {
        key = JSON.stringify(value);
        serialised.set(value, key);
    }
    return key;
};

/**
 * What each bubble was last handed, segment by segment: a shallow copy of each, so a field the
 * parent then writes IN PLACE on the segment it shares with the bubble (`seg.status = 'resolved'`
 * in Svelte or Vue) still reads as a change. Compared with the bubble's own segment, which is that
 * very object, it read as none. An object field changed inside, without a new object, still reads
 * as the same: its serialisation is kept per object.
 */
const handed = new WeakMap<SyncableBubble, Map<string, AparteSegment>>();
const remember = (bubble: SyncableBubble, segments: readonly AparteSegment[]): void => {
    handed.set(bubble, new Map(segments.map((seg) => [seg.id, { ...seg } as AparteSegment])));
};

/** What `seg` says that `had` does not, field by field; `null` when nothing changed. */
function changedFields(seg: AparteSegment, had: AparteSegment | undefined): Partial<AparteSegment> | null {
    const patch: Record<string, unknown> = {};
    let changed = false;
    const before = (had ?? {}) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(seg)) {
        if (STAMPED.has(key)) continue;
        if (valueKey(value) === valueKey(before[key])) continue;
        patch[key] = value;
        changed = true;
    }
    return changed ? (patch as Partial<AparteSegment>) : null;
}

function withLastArriving(message: AparteMessage): AparteSegment[] {
    const segments = message.segments!;
    const last = segments[segments.length - 1];
    if (message.status !== 'streaming' || !last || last.isStreaming !== undefined) return segments;
    if (last.type !== 'text' && last.type !== 'thinking') return segments;
    return [...segments.slice(0, -1), { ...last, isStreaming: true } as AparteSegment];
}

/**
 * Reconcile a bubble element with a message and optional sibling metadata.
 *
 * **For framework wrappers** (Angular, React, Vue, Svelte) that own bubble
 * creation through their own template engine. After the framework has
 * mounted/diffed its bubbles, call this helper for each (bubble, message,
 * siblingInfo) tuple to push the imperative state — segments, attachments,
 * and the sibling-picker — that cannot travel via attribute bindings.
 *
 * The default vanilla viewport (`AparteChatViewport` with `_frameworkManagedDOM
 * === false`) uses this helper internally, so the contract stays in lockstep
 * across the core and every wrapper.
 *
 * Idempotent. Safe to call on every render. Segment count drives the strategy:
 * - same count → reconcile content per segment (cheap, preserves user-toggled
 *   `<details>` open/closed state on thinking blocks, etc.)
 * - count changed (new segment streamed, branch switched, etc.) → full rebuild
 *   via setSegments
 *
 * Plain `content` is only pushed when no segments are present — segments take
 * precedence in the bubble's render logic.
 *
 * Sibling-picker is only shown when `siblingInfo.count > 1`; below that, the
 * bubble hides the picker on its own.
 */
export function populateBubbleFromMessage(
    bubble: SyncableBubble,
    message: AparteMessage,
    siblingInfo?: AparteSiblingInfo,
): void {
    // Before the content: a rewritten message is drawn with the tokens it now has.
    bubble.setTokens?.(message.tokens);
    // Also with none: a branch switch reuses the bubble, and the next message may have no author.
    bubble.setAuthor?.(message.author);
    // The frame before the content: a notice is a line, not a bubble.
    bubble.setKind?.(message.kind);

    if (message.segments && message.segments.length > 0) {
        const existing = bubble.getSegments?.() ?? [];
        // A segment the message holds under an id the bubble does not: one the parent replaced.
        // The patches below would find nothing to patch, so the bubble is drawn again whole.
        const held = new Set(existing.map((s) => s.id));
        const replaced = message.segments.some((seg) => !held.has(seg.id));
        if (existing.length === message.segments.length && !replaced) {
            // A re-sync of a message that is NOT actively streaming (load,
            // branch switch, post-completion re-render) stamps its segments
            // `isStreaming: false`. The text renderer then reconciles via the
            // one-shot Markdown path — the incremental streaming parser buffers
            // its trailing token-lookahead and would otherwise drop a final
            // glyph (e.g. an emoji). A still-streaming message is left alone so
            // its live incremental rendering (partial **bold**, …) is intact.
            // One rule, one place: the same predicate the two segment-array owners
            // use to decide a turn is over. It was spelled out inline here and
            // nowhere else, which is how it came to be applied to the bubble's
            // segments and never to the model's.
            const settled = isTerminalStatus(message.status);
            const last = handed.get(bubble);
            for (const seg of message.segments) {
                const had = existing.find((s) => s.id === seg.id);
                // Every field it changed since it was last handed over, a text segment's too: its
                // label, its language, an error's details. Patched for `content` alone, those never
                // showed; and a call the parent marked resolved kept spinning.
                const patch = (changedFields(seg, last?.get(seg.id) ?? had) ?? {}) as Partial<AparteSegment> & Record<string, unknown>;
                if ('content' in seg) {
                    // Its text, always: the bubble may hold a shorter one the parent's grew from.
                    patch['content'] = (seg as { content: unknown }).content;
                    if (settled && had?.isStreaming !== false) patch['isStreaming'] = false;
                    // Sources often arrive after the text: a re-sync carries them too, and
                    // takes back those the segment no longer has.
                    const held = had as { sources?: unknown; citations?: unknown } | undefined;
                    if (seg.type === 'text' && (seg.sources || seg.citations || held?.sources || held?.citations)) Object.assign(patch, { sources: seg.sources, citations: seg.citations });
                }
                if (Object.keys(patch).length > 0) bubble.updateSegment?.(seg.id, patch);
            }
            remember(bubble, message.segments);
        } else {
            bubble.setSegments?.(withLastArriving(message));
            remember(bubble, message.segments);
        }
    } else if (message.content !== undefined) {
        bubble.setContent?.(message.content);
    }

    if (message.attachments && message.attachments.length > 0) {
        bubble.setAttachments?.(message.attachments);
    }

    if (siblingInfo && siblingInfo.count > 1) {
        bubble.setSiblings?.(siblingInfo.count, siblingInfo.index);
    }

    if (message.usage !== undefined) {
        bubble.setUsage?.(message.usage);
    }

    // Also on a message with none: a branch switch reuses the bubble, and it must not
    // keep the "cut off" note of the reply it showed before.
    bubble.setFinishReason?.(message.finishReason);

    // Likewise with none: the separator above a message goes when its checkpoint does (a
    // Restore, a branch switch onto a path that never had one). `legacy` says the message
    // IS the summary an older compaction wrote, which the bubble then replaces with the
    // separator.
    bubble.setContextSummary?.(message.contextSummary, { legacy: message.compaction === true });

    // Also with none: the note of the message a reused bubble showed before goes.
    bubble.setNote?.(message.note);
}
