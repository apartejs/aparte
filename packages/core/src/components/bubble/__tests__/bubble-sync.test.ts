import { describe, it, expect, vi } from 'vitest';
import { populateBubbleFromMessage, type SyncableBubble } from '../bubble-sync.js';
import type { AparteMessage, AparteSegment, AparteSiblingInfo } from '../../../types/index.js';

/**
 * populateBubbleFromMessage — unit tests
 *
 * The helper centralises the imperative "push message → bubble" reconciliation
 * logic shared between the vanilla viewport and every framework wrapper.
 */

function makeBubble(initialSegments: AparteSegment[] = []): SyncableBubble {
    let segments = [...initialSegments];
    return {
        getSegments: vi.fn(() => segments),
        setSegments: vi.fn((s: AparteSegment[]) => { segments = [...s]; }),
        updateSegment: vi.fn(),
        setContent: vi.fn(),
        setAttachments: vi.fn(),
        setSiblings: vi.fn(),
    };
}

function makeMsg(overrides: Partial<AparteMessage> = {}): AparteMessage {
    return {
        id: 'm1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        status: 'completed',
        ...overrides,
    };
}

describe('populateBubbleFromMessage', () => {
    describe('content / segments precedence', () => {
        it('pushes plain content when no segments are present', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ content: 'hello' }));
            expect(bubble.setContent).toHaveBeenCalledWith('hello');
            expect(bubble.setSegments).not.toHaveBeenCalled();
        });

        it('does not push content when segments are present (segments take over)', () => {
            const bubble = makeBubble();
            const segments = [{ id: 's1', type: 'text', content: 'rich' }] as AparteSegment[];
            populateBubbleFromMessage(bubble, makeMsg({ content: 'ignored', segments }));
            expect(bubble.setContent).not.toHaveBeenCalled();
            expect(bubble.setSegments).toHaveBeenCalledWith(segments);
        });

        it('pushes empty string content', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ content: '' }));
            expect(bubble.setContent).toHaveBeenCalledWith('');
        });

        it('skips content when undefined and no segments (avoids wiping the bubble)', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ content: undefined }));
            expect(bubble.setContent).not.toHaveBeenCalled();
            expect(bubble.setSegments).not.toHaveBeenCalled();
        });
    });

    describe('segment reconciliation strategy', () => {
        it('full rebuild via setSegments when count differs from existing', () => {
            const existing = [{ id: 's1', type: 'text', content: 'a' }] as AparteSegment[];
            const bubble = makeBubble(existing);
            const next = [
                { id: 's1', type: 'text', content: 'a' },
                { id: 's2', type: 'text', content: 'b' },
            ] as AparteSegment[];
            populateBubbleFromMessage(bubble, makeMsg({ segments: next }));
            expect(bubble.setSegments).toHaveBeenCalledWith(next);
            expect(bubble.updateSegment).not.toHaveBeenCalled();
        });

        it('per-segment updateSegment when count is unchanged (preserves user UI state)', () => {
            const existing = [
                { id: 's1', type: 'text', content: 'a' },
                { id: 's2', type: 'text', content: 'b' },
            ] as AparteSegment[];
            const bubble = makeBubble(existing);
            const next = [
                { id: 's1', type: 'text', content: 'a-updated' },
                { id: 's2', type: 'text', content: 'b-updated' },
            ] as AparteSegment[];
            populateBubbleFromMessage(bubble, makeMsg({ segments: next }));
            expect(bubble.setSegments).not.toHaveBeenCalled();
            // A `completed` message is settled → its segments are stamped
            // `isStreaming: false` so the text renderer reconciles via the
            // one-shot Markdown path (no dropped trailing glyph).
            expect(bubble.updateSegment).toHaveBeenCalledWith('s1', { content: 'a-updated', isStreaming: false });
            expect(bubble.updateSegment).toHaveBeenCalledWith('s2', { content: 'b-updated', isStreaming: false });
        });

        it('does not stamp isStreaming while the message is still streaming', () => {
            const existing = [{ id: 's1', type: 'text', content: 'a' }] as AparteSegment[];
            const bubble = makeBubble(existing);
            const next = [{ id: 's1', type: 'text', content: 'a-live' }] as AparteSegment[];
            // status:'streaming' → not settled → the renderer keeps its live
            // incremental path → the patch must NOT carry isStreaming:false.
            populateBubbleFromMessage(bubble, makeMsg({ segments: next, status: 'streaming' }));
            expect(bubble.updateSegment).toHaveBeenCalledWith('s1', { content: 'a-live' });
        });

        it('skips updateSegment for segments without a `content` field', () => {
            const existing = [{ id: 's1', type: 'image', url: 'old.png' } as unknown as AparteSegment];
            const bubble = makeBubble(existing);
            const next = [{ id: 's1', type: 'image', url: 'new.png' } as unknown as AparteSegment];
            populateBubbleFromMessage(bubble, makeMsg({ segments: next }));
            // No content field → no per-segment patch (would need full rebuild
            // for non-content updates, which the count-equal branch can't do).
            expect(bubble.updateSegment).not.toHaveBeenCalled();
        });

        it('full rebuild when bubble had no segments and the message provides some', () => {
            const bubble = makeBubble([]);
            const next = [{ id: 's1', type: 'text', content: 'first' }] as AparteSegment[];
            populateBubbleFromMessage(bubble, makeMsg({ segments: next }));
            expect(bubble.setSegments).toHaveBeenCalledWith(next);
        });
    });

    describe('attachments', () => {
        it('pushes attachments when present', () => {
            const bubble = makeBubble();
            const attachments = [{ id: 'a1', name: 'file.pdf', type: 'application/pdf', url: '#' }];
            populateBubbleFromMessage(bubble, makeMsg({ attachments }));
            expect(bubble.setAttachments).toHaveBeenCalledWith(attachments);
        });

        it('skips setAttachments when array is empty', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ attachments: [] }));
            expect(bubble.setAttachments).not.toHaveBeenCalled();
        });

        it('skips setAttachments when undefined', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ attachments: undefined }));
            expect(bubble.setAttachments).not.toHaveBeenCalled();
        });
    });

    describe('sibling-picker', () => {
        it('pushes setSiblings when count > 1', () => {
            const bubble = makeBubble();
            const sib: AparteSiblingInfo = { id: 'm1', count: 3, index: 1 };
            populateBubbleFromMessage(bubble, makeMsg(), sib);
            expect(bubble.setSiblings).toHaveBeenCalledWith(3, 1);
        });

        it('skips setSiblings when count <= 1 (bubble hides picker on its own)', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg(), { id: 'm1', count: 1, index: 0 });
            expect(bubble.setSiblings).not.toHaveBeenCalled();
        });

        it('skips setSiblings when no siblingInfo passed at all', () => {
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg());
            expect(bubble.setSiblings).not.toHaveBeenCalled();
        });
    });

    describe('idempotence', () => {
        it('calling twice with same data is a no-op for setSegments after first call (count-equal path)', () => {
            const segs = [{ id: 's1', type: 'text', content: 'x' }] as AparteSegment[];
            const bubble = makeBubble();
            populateBubbleFromMessage(bubble, makeMsg({ segments: segs })); // first → setSegments
            populateBubbleFromMessage(bubble, makeMsg({ segments: segs })); // second → updateSegment
            expect(bubble.setSegments).toHaveBeenCalledTimes(1);
            expect(bubble.updateSegment).toHaveBeenCalledWith('s1', { content: 'x', isStreaming: false });
        });
    });

    describe('graceful degradation', () => {
        it('does not throw when bubble lacks all optional methods', () => {
            const bubble: SyncableBubble = {};
            expect(() =>
                populateBubbleFromMessage(bubble, makeMsg({
                    content: 'c',
                    attachments: [{ id: 'a1', name: 'f', type: 't', url: '#' }],
                }), { id: 'm1', count: 2, index: 0 }),
            ).not.toThrow();
        });
    });
});
