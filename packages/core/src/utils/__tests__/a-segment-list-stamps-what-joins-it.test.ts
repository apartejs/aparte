/**
 * `createSegmentList`: a list that is not a message, stamped like one.
 *
 * A plugin keeps a sub-agent's conversation apart from the reply, on the call that opened
 * it. It must never grow an array or write a timestamp itself (`check:segment-stamp`), so the
 * list does it, through the same helpers the two owners of a message's array use — and a
 * stream adapter writes into it as it writes into a chat.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSegmentList } from '../segment-list.js';
import { segmentTiming } from '../segments.js';
import { createStreamAdapter } from '../../client/stream-adapter.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteSegment, AparteToolCallSegment } from '../../types/index.js';

afterEach(() => {
    vi.useRealTimers();
});

const text = (id: string, content = 'hi', over: Partial<AparteSegment> = {}): AparteSegment =>
    ({ id, type: 'text', content, isStreaming: true, ...over } as AparteSegment);

describe('a segment list stamps what joins it', () => {
    it('numbers each segment by its place in the list and names the message it belongs to', () => {
        const list = createSegmentList({ messageId: 'm1' });
        list.addSegment!(text('a'));
        list.addSegment!(text('b'));
        expect(list.segments.map((s) => [s.id, s.index, s.messageId])).toEqual([['a', 0, 'm1'], ['b', 1, 'm1']]);
    });

    it('starts a segment when it joins, moves its end while content arrives, and freezes it once settled', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const list = createSegmentList({ messageId: 'm1' });
        list.addSegment!(text('a'));
        expect(segmentTiming(list.segments[0]!)?.startedAt).toBe(1_000);

        vi.setSystemTime(3_000);
        list.updateSegment!('a', { content: 'hi there' } as Partial<AparteSegment>);
        expect(segmentTiming(list.segments[0]!)?.endedAt).toBe(3_000);

        vi.setSystemTime(5_000);
        list.updateSegment!('a', { isStreaming: false });
        vi.setSystemTime(9_000);
        list.updateSegment!('a', { collapsed: true } as Partial<AparteSegment>);
        expect(segmentTiming(list.segments[0]!)).toEqual({ startedAt: 1_000, endedAt: 3_000 });
    });

    it('closes a tool call when its status settles', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const list = createSegmentList({ messageId: 'm1' });
        list.addSegment!({ id: 'tool-c1', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'read', input: {} } } as AparteSegment);
        vi.setSystemTime(4_000);
        list.updateSegment!('tool-c1', { status: 'resolved', result: 'ok' } as Partial<AparteSegment>);
        expect(segmentTiming(list.segments[0]!)).toEqual({ startedAt: 1_000, endedAt: 4_000 });
        expect((list.segments[0] as AparteToolCallSegment).result).toBe('ok');
    });

    it("takes the config's segment defaults, and never its stamps", () => {
        const config = new AparteConfig();
        config.setSegmentDefaults('thinking', { collapsed: false, meta: { aparte: { startedAt: 7 } } } as never);
        const list = createSegmentList({ messageId: 'm1', config });
        list.addSegment!({ id: 't', type: 'thinking', content: 'hmm' } as AparteSegment);
        expect((list.segments[0] as { collapsed?: boolean }).collapsed).toBe(false);
        expect(segmentTiming(list.segments[0]!)?.startedAt).not.toBe(7);
    });

    it('keeps the producer\'s own meta when the stamp lands beside it', () => {
        const list = createSegmentList({ messageId: 'm1' });
        list.addSegment!(text('a'));
        list.updateSegment!('a', { meta: { cost: 3 } } as Partial<AparteSegment>);
        expect(list.segments[0]!.meta).toMatchObject({ cost: 3, aparte: { startedAt: expect.any(Number) } });
    });

    it('hands out a new array after every change, and leaves the one it handed out alone', () => {
        const list = createSegmentList({ messageId: 'm1' });
        list.addSegment!(text('a'));
        const before = list.segments;
        list.updateSegment!('a', { content: 'changed' } as Partial<AparteSegment>);
        expect(list.segments).not.toBe(before);
        expect((before[0] as { content: string }).content).toBe('hi');
    });
});

describe('a list saved while it ran comes back settled', () => {
    const saved: AparteSegment[] = [
        { id: 'x', type: 'text', content: 'half a sent', isStreaming: true, index: 9, messageId: 'old' } as AparteSegment,
        { id: 'tool-c1', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'read', input: {} } } as AparteSegment,
        { id: 'tool-c2', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c2', name: 'rm', input: {} } } as AparteSegment,
        { id: 'tool-c3', type: 'tool_call', status: 'resolved', result: 'ok', toolCall: { id: 'c3', name: 'ls', input: {} } } as AparteSegment,
    ];

    it('nothing streams, an open call is stopped, a finished one is kept', () => {
        const list = createSegmentList({ messageId: 'm2', segments: saved });
        expect(list.segments.map((s) => s.isStreaming)).toEqual([false, false, false, false]);
        expect(list.segments.slice(1).map((s) => (s as AparteToolCallSegment).status)).toEqual(['aborted', 'aborted', 'resolved']);
    });

    it('is numbered again for this list and given no time it never measured', () => {
        const list = createSegmentList({ messageId: 'm2', segments: saved });
        expect(list.segments.map((s) => [s.index, s.messageId])).toEqual([[0, 'm2'], [1, 'm2'], [2, 'm2'], [3, 'm2']]);
        expect(list.segments.map((s) => segmentTiming(s))).toEqual([undefined, undefined, undefined, undefined]);
    });

    it('a segment joining after them is numbered after them', () => {
        const list = createSegmentList({ messageId: 'm2', segments: saved });
        list.addSegment!(text('y'));
        expect(list.segments.at(-1)!.index).toBe(4);
    });
});

describe('a segment list says when it changes', () => {
    it('after each segment added or updated, and not for an id it does not hold', () => {
        const list = createSegmentList({ messageId: 'm1' });
        const heard: number[] = [];
        list.onChange(() => heard.push(list.segments.length));
        list.addSegment!(text('a'));
        list.updateSegment!('a', { content: 'b' } as Partial<AparteSegment>);
        list.updateSegment!('nope', { content: 'c' } as Partial<AparteSegment>);
        expect(heard).toEqual([1, 1]);
    });

    it('stops telling a listener that left, and goes on past one that throws', () => {
        const list = createSegmentList({ messageId: 'm1' });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const heard: string[] = [];
        list.onChange(() => { throw new Error('boom'); });
        const stop = list.onChange(() => heard.push('one'));
        list.addSegment!(text('a'));
        stop();
        list.addSegment!(text('b'));
        expect(heard).toEqual(['one']);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('has no message to update, no usage to keep, and dispatches nothing', () => {
        const list = createSegmentList({ messageId: 'm1' });
        const heard = vi.fn();
        list.onChange(heard);
        list.updateMessage!('m1', { status: 'completed' });
        list.setUsage!('m1', { inputTokens: 1, outputTokens: 1 } as never);
        expect(list.dispatchEvent(new Event('aparte-message-done'))).toBe(true);
        expect(heard).not.toHaveBeenCalled();
    });
});

describe('a stream adapter writes into it', () => {
    it('streams text and a tool call into the list as it would into a chat', () => {
        const config = new AparteConfig();
        const list = createSegmentList({ messageId: 'm1', config });
        const emit = createStreamAdapter({ target: list, config, messageId: 'm1' });

        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'Let me ' });
        emit({ type: 'text-delta', delta: 'look.' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'read_file', input: { path: 'a.ts' } });
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'export {}' });
        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'Done.' });
        emit({ type: 'text-flush' });

        const texts = list.segments.filter((s) => s.type === 'text').map((s) => (s as { content: string }).content);
        expect(texts).toEqual(['Let me look.', 'Done.']);
        const call = list.segments.find((s) => s.type === 'tool_call') as AparteToolCallSegment;
        expect(call).toMatchObject({ id: 'tool-c1', status: 'resolved', result: 'export {}', toolCall: { name: 'read_file' } });
        expect(list.segments.map((s) => s.index)).toEqual(list.segments.map((_, i) => i));
        expect(segmentTiming(call)?.endedAt).toEqual(expect.any(Number));
    });
});
