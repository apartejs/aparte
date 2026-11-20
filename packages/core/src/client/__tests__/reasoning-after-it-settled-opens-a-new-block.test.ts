// @vitest-environment jsdom
/**
 * Reasoning that comes after its block was settled opens a new block; a settled block never
 * changes again.
 *
 * The adapter settles a reasoning block when the answer starts or a tool is called, and only
 * `turn-start` let the next reasoning open a block of its own. So reasoning that came later in
 * the same turn was appended to the settled block, which kept its "Thought for 3s" while it
 * grew, folded, above the calls made since: a server loop that sent one `turn-start` per run
 * instead of one per model call (apartejs/aparte#272), and as well a model that reasons again
 * after it starts answering, within one call (the engine sends one `turn-start` per call;
 * `ai-sdk` passes `reasoning-delta` through; an AG-UI step can reason, answer, reason).
 *
 * Every test of the adapter sent a sequence its producers send. The property below sends what
 * they do not: hundreds of sequences from a seed, `turn-start` or not, reasoning before, after
 * and between text and calls, and holds what a reader relies on whatever arrives.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';
import type { StreamRunEvent } from '@aparte/engine';

interface Seen {
    type: string;
    content: string;
    /** `false` once the adapter said it is done arriving. */
    streaming: boolean | undefined;
    /** Its content when it was settled; a later change breaks the first invariant. */
    settledAs?: string;
}

/** A target that keeps each segment as the adapter leaves it, and every rule it breaks. */
function target() {
    const seen = new Map<string, Seen>();
    const order: string[] = [];
    const broken: string[] = [];
    const contentOf = (s: Partial<AparteSegment>): string | undefined =>
        typeof (s as { content?: unknown }).content === 'string' ? (s as { content: string }).content : undefined;
    return {
        seen, order, broken,
        addSegment: (s: AparteSegment) => {
            if (seen.has(s.id)) broken.push(`id ${s.id} added twice`);
            seen.set(s.id, { type: s.type, content: contentOf(s) ?? '', streaming: (s as { isStreaming?: boolean }).isStreaming });
            order.push(s.id);
        },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const was = seen.get(id);
            if (!was) return;
            const content = contentOf(u);
            if (content !== undefined && was.settledAs !== undefined && content !== was.settledAs) {
                broken.push(`${was.type} ${id} changed after it was settled`);
            }
            if (content !== undefined) was.content = content;
            const streaming = (u as { isStreaming?: boolean }).isStreaming;
            if (streaming !== undefined) was.streaming = streaming;
            if (streaming === false) was.settledAs = was.content;
        },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
}

function run(events: StreamRunEvent[]) {
    const t = target();
    const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
    for (const e of events) emit(e);
    const thinking = t.order.map((id) => t.seen.get(id)!).filter((s) => s.type === 'thinking');
    return { t, thinking };
}

describe('reasoning after its block was settled', () => {
    it('after the answer started, in the same turn: a block of its own', () => {
        const { thinking } = run([
            { type: 'run-start' }, { type: 'turn-start' },
            { type: 'thinking-delta', delta: 'First, the plan.' },
            { type: 'text-delta', delta: 'Here is a start.' },
            { type: 'thinking-delta', delta: 'Then a second thought.' },
        ]);
        expect(thinking.map((s) => s.content)).toEqual(['First, the plan.', 'Then a second thought.']);
        expect(thinking[0]!.streaming).toBe(false);
        expect(thinking[1]!.streaming).toBe(true);
    });

    it('after a tool call, with no turn-start between (a server loop that sent one per run)', () => {
        const { thinking } = run([
            { type: 'run-start' }, { type: 'turn-start' },
            { type: 'thinking-delta', delta: 'Search first.' },
            { type: 'tool-start', toolCallId: 'c1', name: 'search', input: {} },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'found' },
            { type: 'thinking-delta', delta: 'Now read it.' },
        ]);
        expect(thinking.map((s) => s.content)).toEqual(['Search first.', 'Now read it.']);
    });

    it('continues the open block, as before, while nothing settled it', () => {
        const { thinking } = run([
            { type: 'run-start' }, { type: 'turn-start' },
            { type: 'thinking-delta', delta: 'One ' },
            { type: 'thinking-delta', delta: 'thought.' },
        ]);
        expect(thinking.map((s) => s.content)).toEqual(['One thought.']);
    });
});

/** A small deterministic generator, so a failure names the sequence that made it. */
function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function sequence(next: () => number): StreamRunEvent[] {
    const events: StreamRunEvent[] = [{ type: 'run-start' }, { type: 'turn-start' }];
    const open: string[] = [];
    let calls = 0;
    const length = 4 + Math.floor(next() * 30);
    for (let i = 0; i < length; i++) {
        const roll = next();
        if (roll < 0.3) events.push({ type: 'thinking-delta', delta: `t${i} ` });
        else if (roll < 0.55) events.push({ type: 'text-delta', delta: `w${i} ` });
        else if (roll < 0.7) {
            const id = `c${++calls}`;
            open.push(id);
            events.push({ type: 'tool-start', toolCallId: id, name: 'search', input: {} });
        } else if (roll < 0.8 && open.length > 0) {
            events.push({ type: 'tool-resolved', toolCallId: open.shift()!, result: 'ok' });
        } else if (roll < 0.9) events.push({ type: 'turn-start' });
        else events.push({ type: 'text-flush' } as StreamRunEvent);
    }
    if (next() < 0.5) events.push({ type: 'run-done' } as StreamRunEvent);
    return events;
}

describe('whatever arrives, in whatever order', () => {
    it('a settled block never changes, one reasoning block streams at a time, nothing reasoned is lost', () => {
        const next = random(272);
        const failures: string[] = [];
        for (let n = 0; n < 400; n++) {
            const events = sequence(next);
            let result: ReturnType<typeof run>;
            try {
                result = run(events);
            } catch (error) {
                failures.push(`threw ${String(error)} on ${JSON.stringify(events)}`);
                continue;
            }
            const { t, thinking } = result;
            const problems = [...t.broken];
            const streamingNow = thinking.filter((s) => s.streaming === true).length;
            if (streamingNow > 1) problems.push(`${streamingNow} reasoning blocks streaming at once`);
            const reasoned = events.filter((e) => e.type === 'thinking-delta').map((e) => (e as { delta: string }).delta).join('');
            if (thinking.map((s) => s.content).join('') !== reasoned) problems.push('reasoning lost or doubled');
            if (problems.length > 0) failures.push(`${problems.join('; ')} on ${JSON.stringify(events.map((e) => e.type === 'thinking-delta' || e.type === 'text-delta' ? `${e.type}:${(e as { delta: string }).delta.trim()}` : e.type))}`);
        }
        expect(failures.slice(0, 5), `${failures.length} of 400 sequences`).toEqual([]);
    });
});
