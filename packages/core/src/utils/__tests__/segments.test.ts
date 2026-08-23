import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    stampSegmentOnInsert,
    stampSegmentOnUpdate,
    isSegmentSettled,
    isTerminalStatus,
    renumberSegments,
    openSegmentIds,
    stampSegmentActivity,
    segmentDuration,
} from '../segments.js';
import type { AparteSegment, AparteToolCallSegment } from '../../types/index.js';

const seg = (extra: Partial<AparteSegment> = {}): AparteSegment =>
    ({ id: 's1', type: 'text', content: '', ...extra }) as AparteSegment;

const toolSeg = (extra: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment =>
    ({
        id: 't1',
        type: 'tool_call',
        toolCall: { id: 'c1', name: 'search', input: {} },
        status: 'pending',
        ...extra,
    }) as AparteToolCallSegment;

afterEach(() => {
    vi.useRealTimers();
});

describe('stampSegmentOnInsert', () => {
    it('stamps the message, the position and the start', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);

        const stamped = stampSegmentOnInsert([], seg(), 'm-42');

        expect(stamped.messageId).toBe('m-42');
        expect(stamped.index).toBe(0);
        expect(stamped.startedAt).toBe(1_000);
        expect(stamped.endedAt).toBeUndefined();
    });

    it('numbers from the length of the array it joins', () => {
        const existing = [seg({ id: 'a' }), seg({ id: 'b' })];
        expect(stampSegmentOnInsert(existing, seg({ id: 'c' }), 'm-1').index).toBe(2);
    });

    it('never overwrites values a rehydrated segment already carries', () => {
        vi.useFakeTimers();
        vi.setSystemTime(9_999);

        const stored = seg({ messageId: 'm-old', index: 7, startedAt: 123, endedAt: 456 });
        const stamped = stampSegmentOnInsert([seg({ id: 'a' })], stored, 'm-new');

        expect(stamped.messageId).toBe('m-old');
        expect(stamped.index).toBe(7);
        expect(stamped.startedAt).toBe(123);
        expect(stamped.endedAt).toBe(456);
    });

    it('mutates nothing the caller handed it', () => {
        const original = seg();
        stampSegmentOnInsert([], original, 'm-1');
        expect(original.messageId).toBeUndefined();
        expect(original.index).toBeUndefined();
    });
});

describe('isSegmentSettled', () => {
    it('is true when streaming has explicitly stopped', () => {
        expect(isSegmentSettled(seg({ isStreaming: false }))).toBe(true);
    });

    it('is false while streaming', () => {
        expect(isSegmentSettled(seg({ isStreaming: true }))).toBe(false);
    });

    it('is false when nothing says either way', () => {
        // A plain segment with no streaming flag is not a completion signal:
        // `endedAt` must come from an explicit settle, never from a default.
        expect(isSegmentSettled(seg())).toBe(false);
    });

    it('reads a tool call by its status, not by isStreaming', () => {
        expect(isSegmentSettled(toolSeg({ status: 'pending' }))).toBe(false);
        expect(isSegmentSettled(toolSeg({ status: 'awaiting-approval' }))).toBe(false);
        expect(isSegmentSettled(toolSeg({ status: 'resolved' }))).toBe(true);
        expect(isSegmentSettled(toolSeg({ status: 'aborted' }))).toBe(true);
        expect(isSegmentSettled(toolSeg({ status: 'rejected' }))).toBe(true);
    });
});

describe('stampSegmentOnUpdate', () => {
    it('adds endedAt when an update settles the segment', () => {
        vi.useFakeTimers();
        vi.setSystemTime(5_000);

        const out = stampSegmentOnUpdate(seg({ isStreaming: true }), { isStreaming: false });
        expect(out.endedAt).toBe(5_000);
        expect(out.isStreaming).toBe(false);
    });

    it('is the one writer of an activity stamp, and it is empty once settled', () => {
        vi.useFakeTimers();
        vi.setSystemTime(4_000);
        expect(stampSegmentActivity(seg({ isStreaming: true }))).toEqual({ endedAt: 4_000 });
        expect(stampSegmentActivity(seg({ isStreaming: false }))).toEqual({});
    });

    it('adds endedAt when a tool call resolves', () => {
        vi.useFakeTimers();
        vi.setSystemTime(7_000);

        const out = stampSegmentOnUpdate(toolSeg(), { status: 'resolved' } as Partial<AparteSegment>);
        expect(out.endedAt).toBe(7_000);
    });

    it('moves the end forward while content is still arriving', () => {
        // `endedAt` is "when content last arrived", so an ordinary delta advances it.
        vi.useFakeTimers();
        vi.setSystemTime(3_000);
        const out = stampSegmentOnUpdate(
            seg({ isStreaming: true, endedAt: 1_000 }),
            { content: 'more' } as Partial<AparteSegment>,
        );
        expect(out.endedAt).toBe(3_000);
    });

    it('keeps the last delta time when the settling update arrives later', () => {
        // THE case that matters: reasoning stops at t=2s, the answer streams until
        // t=20s, and only then does the turn report itself finished. The block took
        // two seconds, not twenty.
        vi.useFakeTimers();
        vi.setSystemTime(20_000);
        const out = stampSegmentOnUpdate(
            seg({ isStreaming: true, startedAt: 0, endedAt: 2_000 }),
            { isStreaming: false },
        );
        expect(out.endedAt).toBe(2_000);
    });

    it('stamps an end for a segment that settles having never updated', () => {
        vi.useFakeTimers();
        vi.setSystemTime(6_000);
        const out = stampSegmentOnUpdate(seg({ isStreaming: true }), { isStreaming: false });
        expect(out.endedAt).toBe(6_000);
    });

    it('does not move an end that is already final', () => {
        // Otherwise a later edit — a re-render, a `meta` write, a collapse — would
        // inflate a duration that is settled.
        vi.useFakeTimers();
        vi.setSystemTime(99_000);
        const out = stampSegmentOnUpdate(
            seg({ isStreaming: false, endedAt: 42 }),
            { content: 'late' } as Partial<AparteSegment>,
        );
        expect(out.endedAt).toBeUndefined();
    });

    it('returns the updates it was given, untouched otherwise', () => {
        const updates = { content: 'x', isStreaming: false } as Partial<AparteSegment>;
        const out = stampSegmentOnUpdate(seg({ isStreaming: true }), updates);
        // `Partial<AparteSegment>` distributes over the union, so `content` is not
        // on every member — the cast is about reading the field, not about shape.
        expect((out as { content?: string }).content).toBe('x');
        expect(updates.endedAt).toBeUndefined(); // the caller's object is not mutated
    });
});

describe('renumberSegments', () => {
    it('closes the gap a removal left', () => {
        const segments = [
            seg({ id: 'a', index: 0 }),
            seg({ id: 'c', index: 2 }),
            seg({ id: 'd', index: 3 }),
        ];
        renumberSegments(segments);
        expect(segments.map((s) => s.index)).toEqual([0, 1, 2]);
    });

    it('replaces the objects rather than mutating them in place', () => {
        // The repo learned this the hard way: the viewport and the bubble are
        // handed the SAME segment object, so mutating one is a spooky action at a
        // distance. Renumbering hands back fresh objects.
        const original = seg({ id: 'a', index: 5 });
        const segments = [original];
        renumberSegments(segments);
        expect(segments[0]!.index).toBe(0);
        expect(original.index).toBe(5);
    });

    it('is a no-op on an empty array', () => {
        const segments: AparteSegment[] = [];
        expect(() => renumberSegments(segments)).not.toThrow();
        expect(segments).toEqual([]);
    });
});

describe('isTerminalStatus', () => {
    it('treats every finished outcome as terminal, not just success', () => {
        // A stopped or failed turn still produced what it produced; refusing to
        // close its segments would leave them measuring forever.
        expect(isTerminalStatus('completed')).toBe(true);
        expect(isTerminalStatus('error')).toBe(true);
        expect(isTerminalStatus('aborted')).toBe(true);
    });

    it('is false while the turn is live, and false when nothing is known', () => {
        expect(isTerminalStatus('streaming')).toBe(false);
        expect(isTerminalStatus('pending')).toBe(false);
        // "unknown" is not "done": treating it as terminal would end a segment on
        // its first render.
        expect(isTerminalStatus(undefined)).toBe(false);
        expect(isTerminalStatus(null)).toBe(false);
    });
});

describe('openSegmentIds', () => {
    it('names every segment a finished turn still has to close', () => {
        const ids = openSegmentIds([
            seg({ id: 'a', isStreaming: true }),
            seg({ id: 'b' }),
        ]);
        expect(ids).toEqual(['a', 'b']);
    });

    it('skips one that already ended, so a second completion moves nothing', () => {
        const ids = openSegmentIds([
            seg({ id: 'a', isStreaming: false, endedAt: 500 }),
            seg({ id: 'b', isStreaming: true }),
        ]);
        expect(ids).toEqual(['b']);
    });

    it('skips a tool call that settled by status', () => {
        const ids = openSegmentIds([toolSeg({ id: 't1', status: 'resolved' })]);
        expect(ids).toEqual([]);
    });

    it('still names a tool call left pending', () => {
        // The message may finish while a call is open (an aborted turn). It gets the
        // close like anything else; whether that yields an `endedAt` is
        // `isSegmentSettled`'s call, on its status.
        expect(openSegmentIds([toolSeg({ id: 't2', status: 'pending' })])).toEqual(['t2']);
    });
});

describe('segmentDuration', () => {
    it('is the span between the two bounds', () => {
        expect(segmentDuration(seg({ startedAt: 1_000, endedAt: 3_500 }))).toBe(2_500);
    });

    it('is undefined when either bound is missing, not 0 and not NaN', () => {
        expect(segmentDuration(seg({ startedAt: 1_000 }))).toBeUndefined();
        expect(segmentDuration(seg({ endedAt: 3_000 }))).toBeUndefined();
        expect(segmentDuration(seg())).toBeUndefined();
    });

    it('survives epoch 0, where a valid timestamp is falsy', () => {
        // The trap in the guard this replaces: `!segment.startedAt` is TRUE at 0, so
        // the caller bailed out on a perfectly measurable segment. Nobody streams in
        // 1970 — but `vi.setSystemTime(0)` is routine, so the bug was already sitting
        // in the repo's own test setup.
        expect(segmentDuration(seg({ startedAt: 0, endedAt: 0 }))).toBe(0);
        expect(segmentDuration(seg({ startedAt: 0, endedAt: 2_000 }))).toBe(2_000);
    });

    it('answers for an OPEN segment too — a live duration is a real question', () => {
        const open = seg({ isStreaming: true, startedAt: 1_000, endedAt: 2_000 });
        expect(isSegmentSettled(open)).toBe(false);
        expect(segmentDuration(open)).toBe(1_000);
    });
});
