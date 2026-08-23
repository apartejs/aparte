// @vitest-environment jsdom
/**
 * The stamp, proven on the real streaming path — including the trap.
 *
 * The cross-owner suite calls `addSegment` directly. This one drives the actual
 * `createStreamAdapter` into an actual `<aparte-chat-viewport>` across a TOOL
 * ROUND-TRIP, which is the case that made the parser the wrong place to stamp:
 *
 *   - a tool round-trip is TWO turns that append to ONE message, and the adapter
 *     rebuilds its parser on every `turn-start`. Anything that sourced `index`
 *     from the parser's own `segmentCounter` would restart at 0 mid-message and
 *     produce two segments at index 0 — silently, since nothing renders an index.
 *   - a `tool_call` segment never goes through the parser at all, so a parser-side
 *     stamp would leave the most useful duration in a transcript unmeasured.
 *
 * So: indices stay continuous across the turn boundary, and the tool call gets a
 * real duration.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import { isSegmentSettled } from '../../utils/segments.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    getMessages(): AparteMessage[];
};

function makeViewport(): Viewport {
    const vp = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(vp);
    return vp;
}

/** The adapter's event union is engine-side; the shapes used here are its own. */
const emitAll = (emit: (e: never) => void, events: unknown[]): void => {
    for (const e of events) emit(e as never);
};

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('segment stamping on the real stream path', () => {
    it('keeps indices continuous across a tool round-trip, and measures the tool call', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);

        const vp = makeViewport();
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1 });

        const emit = createStreamAdapter({
            target: vp as never,
            config: aparteGlobalConfig,
            messageId: 'm1',
        });

        // ── Turn 1: some prose, then a tool call ─────────────────────────────
        emitAll(emit, [
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Let me look that up.\n\n' },
            { type: 'text-flush' },
            { type: 'tool-start', toolCallId: 'c1', name: 'search', input: { q: 'x' } },
        ]);

        // The tool takes three and a half seconds of wall clock.
        vi.setSystemTime(4_500);
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'found' } as never);

        // ── Turn 2: the model answers, on the SAME message ───────────────────
        // This is where a parser-sourced index would restart at 0: the adapter
        // builds a fresh parser here.
        emitAll(emit, [
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'It is 42.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ]);

        const segments: AparteSegment[] = vp.getMessages().find((m) => m.id === 'm1')?.segments ?? [];

        // Named exactly, not counted loosely: prose, the tool, then prose from the
        // SECOND turn. A weaker assertion here would pass on a run that produced no
        // second turn at all, which is the half that matters.
        expect(segments.map((s) => s.type)).toEqual(['text', 'tool_call', 'text']);
        // Every one of them knows its message…
        expect(segments.every((s) => s.messageId === 'm1')).toBe(true);
        // …and the numbering is continuous, not restarted.
        expect(segments.map((s) => s.index)).toEqual(segments.map((_, i) => i));

        const toolSeg = segments.find((s) => s.type === 'tool_call');
        expect(toolSeg, 'the round-trip must leave a tool_call segment').toBeDefined();
        expect(toolSeg!.startedAt).toBe(1_000);
        // The duration the parser could never have measured: this segment never
        // passed through it.
        expect(toolSeg!.endedAt! - toolSeg!.startedAt!).toBe(3_500);
    });

    it('does not call a waiting tool call finished, whatever its last activity says', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);

        const vp = makeViewport();
        vp.appendMessage({ id: 'm2', role: 'assistant', content: '', timestamp: 1 });
        const emit = createStreamAdapter({
            target: vp as never,
            config: aparteGlobalConfig,
            messageId: 'm2',
        });

        emitAll(emit, [
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'c9', name: 'search', input: {} },
            { type: 'tool-awaiting-approval', toolCallId: 'c9', name: 'search', input: {} },
        ]);

        const toolSeg = vp.getMessages().find((m) => m.id === 'm2')?.segments?.[0];
        expect(toolSeg?.type).toBe('tool_call');
        expect(toolSeg?.startedAt).toBe(1_000);
        // Nothing has happened to this call yet: `awaiting-approval` is a status
        // change, not payload, so it does not advance an end — and it does not
        // settle the segment either. Waiting on a human is not a measurement of the
        // tool.
        expect(toolSeg?.endedAt).toBeUndefined();
        expect(isSegmentSettled(toolSeg!)).toBe(false);
    });

    it('a reasoning block measures the reasoning, not the answer that follows it', () => {
        // The case a human spotted by asking why the duration only appeared at the
        // end of the message. Reasoning stops at t=2s; the answer then streams for
        // another eighteen seconds. Two rules were tried and both reported 20s:
        // closing at the end of the turn, and closing when the next segment opens.
        // `endedAt` is the last delta, so this reads 2s.
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const vp = makeViewport();
        vp.appendMessage({ id: 'm3', role: 'assistant', content: '', timestamp: 1 });
        const emit = createStreamAdapter({
            target: vp as never,
            config: aparteGlobalConfig,
            messageId: 'm3',
        });

        emitAll(emit, [{ type: 'run-start' }, { type: 'turn-start' }]);
        emit({ type: 'thinking-delta', delta: 'let me think' } as never);
        vi.setSystemTime(2_000);
        emit({ type: 'thinking-delta', delta: ' a bit more' } as never);

        // …and now the answer, at length.
        vi.setSystemTime(5_000);
        emit({ type: 'text-delta', delta: 'The answer is' } as never);
        vi.setSystemTime(20_000);
        emitAll(emit, [{ type: 'text-delta', delta: ' 42.' }, { type: 'text-flush' }, { type: 'run-done' }]);

        const segments = vp.getMessages().find((m) => m.id === 'm3')?.segments ?? [];
        const thinking = segments.find((s) => s.type === 'thinking')!;

        expect(thinking.endedAt! - thinking.startedAt!).toBe(2_000);
        // And the reply, which really did run to the end of the turn, says so.
        const answer = segments.find((s) => s.type === 'text')!;
        expect(answer.endedAt).toBe(20_000);
    });

    it('a reasoning block is finished BEFORE the turn is, so its duration is readable while the answer streams', () => {
        // The point of the whole feature, and the part that was missing: the number
        // being right is useless if it only becomes readable twenty seconds later.
        // Reasoning on its own channel has no closing delimiter, so its end in band
        // is the first answer token — the provider stopped sending reasoning.
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const vp = makeViewport();
        vp.appendMessage({ id: 'm4', role: 'assistant', content: '', timestamp: 1 });
        const emit = createStreamAdapter({
            target: vp as never,
            config: aparteGlobalConfig,
            messageId: 'm4',
        });

        emitAll(emit, [{ type: 'run-start' }, { type: 'turn-start' }]);
        emit({ type: 'thinking-delta', delta: 'thinking' } as never);
        vi.setSystemTime(2_000);
        emit({ type: 'thinking-delta', delta: ' harder' } as never);

        const thinkingOf = (): AparteSegment =>
            (vp.getMessages().find((m) => m.id === 'm4')?.segments ?? [])
                .find((seg) => seg.type === 'thinking')!;

        // Mid-reasoning: not finished, and no UI should claim a duration yet.
        expect(isSegmentSettled(thinkingOf())).toBe(false);

        // The answer starts — and the block is finished from this instant, with the
        // turn still running.
        vi.setSystemTime(5_000);
        emit({ type: 'text-delta', delta: 'The answer' } as never);

        expect(isSegmentSettled(thinkingOf())).toBe(true);
        expect(thinkingOf().endedAt! - thinkingOf().startedAt!).toBe(2_000);

        // …and eighteen seconds of answer later, nothing about it has moved.
        vi.setSystemTime(23_000);
        emitAll(emit, [{ type: 'text-delta', delta: ' is 42.' }, { type: 'text-flush' }, { type: 'run-done' }]);
        expect(thinkingOf().endedAt! - thinkingOf().startedAt!).toBe(2_000);
    });

    it('a tool call appearing an hour later does not add an hour to the segment before it', () => {
        // Asked in review, and worth a test rather than an assurance: a tool pill
        // can show up long after the text that preceded it. `endedAt` moves only on
        // PAYLOAD (`content` / `output` / `result`), so the gap cannot be charged to
        // the text run — and the same rule protects a thinking block.
        vi.useFakeTimers();
        vi.setSystemTime(0);

        const vp = makeViewport();
        vp.appendMessage({ id: 'm5', role: 'assistant', content: '', timestamp: 1 });
        const emit = createStreamAdapter({
            target: vp as never,
            config: aparteGlobalConfig,
            messageId: 'm5',
        });

        emitAll(emit, [{ type: 'run-start' }, { type: 'turn-start' }]);
        emit({ type: 'thinking-delta', delta: 'brief thought' } as never);
        vi.setSystemTime(1_000);
        emit({ type: 'text-delta', delta: 'Let me check that.' } as never);
        vi.setSystemTime(3_000);
        emit({ type: 'text-flush' } as never);

        // An hour passes — a slow tool, a human staring at an approval prompt, a
        // stalled provider. Whatever it is, it is not the text or the reasoning.
        vi.setSystemTime(3_603_000);
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'search', input: {} } as never);

        const segments = vp.getMessages().find((m) => m.id === 'm5')?.segments ?? [];
        const thinking = segments.find((seg) => seg.type === 'thinking')!;
        const answer = segments.find((seg) => seg.type === 'text')!;

        expect(thinking.endedAt! - thinking.startedAt!).toBe(1_000);
        expect(answer.endedAt! - answer.startedAt!).toBeLessThanOrEqual(3_000);
        // Both are finished before the tool pill ever appears, so a UI can show
        // their durations without waiting on it.
        expect(isSegmentSettled(thinking)).toBe(true);
        expect(isSegmentSettled(answer)).toBe(true);
    });
});
