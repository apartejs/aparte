import type {
    AparteAttachment,
    AparteMessage,
    AparteSegment,
    AparteSiblingInfo,
    AparteUsage,
} from '../../types/index.js';

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
    setAttachments?: (attachments: AparteAttachment[]) => void;
    setSiblings?: (count: number, index: number) => void;
    setUsage?: (usage: AparteUsage | null | undefined) => void;
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
 *   <details> open/closed state on thinking blocks, etc.)
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
    if (message.segments && message.segments.length > 0) {
        const existing = bubble.getSegments?.() ?? [];
        if (existing.length === message.segments.length) {
            // A re-sync of a message that is NOT actively streaming (load,
            // branch switch, post-completion re-render) stamps its segments
            // `isStreaming: false`. The text renderer then reconciles via the
            // one-shot Markdown path — the incremental streaming parser buffers
            // its trailing token-lookahead and would otherwise drop a final
            // glyph (e.g. an emoji). A still-streaming message is left alone so
            // its live incremental rendering (partial **bold**, …) is intact.
            const settled = message.status != null
                && message.status !== 'streaming' && message.status !== 'pending';
            for (const seg of message.segments) {
                if ('content' in seg) {
                    const patch = { content: (seg as { content: unknown }).content } as Partial<AparteSegment>;
                    if (settled) (patch as { isStreaming?: boolean }).isStreaming = false;
                    bubble.updateSegment?.(seg.id, patch);
                }
            }
        } else {
            bubble.setSegments?.(message.segments);
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
}
