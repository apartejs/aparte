// @vitest-environment jsdom
/**
 * Sources reach the text segments they belong to. A provider counts offsets in the text
 * its model call streamed; the parser cut that text at fences and blocks, so each
 * citation is rebased onto the segment its end falls in.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment, AparteTextSegment } from '../../types/index.js';

afterEach(() => aparteGlobalConfig.reset());

/** Run `events` through the adapter; the text segments as the target last saw them. */
function streamed(events: Parameters<ReturnType<typeof createStreamAdapter>>[0][]): AparteTextSegment[] {
    const segments = new Map<string, AparteSegment>();
    const emit = createStreamAdapter({
        target: {
            addSegment: (s) => { segments.set(s.id, { ...s }); },
            updateSegment: (id, u) => { segments.set(id, { ...segments.get(id)!, ...u } as AparteSegment); },
            updateMessage: () => {},
            dispatchEvent: () => true,
        },
        config: aparteGlobalConfig,
        messageId: 'm1',
    });
    for (const e of events) emit(e);
    return [...segments.values()].filter((s): s is AparteTextSegment => s.type === 'text');
}

const SKY = { id: 's1', url: 'https://en.wikipedia.org/wiki/Sky', title: 'Sky' };
const SEA = { id: 's2', url: 'https://www.noaa.gov/sea', title: 'Sea' };

describe('a reply that cites its sources', () => {
    it('gives each text segment the citations that fall in it, rebased onto its content', () => {
        const text = 'The sky is blue.\n\n```js\nx\n```\n\nThe sea is too.';
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: text },
            { type: 'sources', sources: [SKY, SEA], citations: [
                { end: text.indexOf('blue.') + 5, sources: ['s1'] },
                { end: text.length, sources: ['s2', 's1'] },
            ] },
            { type: 'text-flush' },
        ]);
        expect(texts).toHaveLength(2);
        const [first, second] = texts as [AparteTextSegment, AparteTextSegment];
        expect(first.content.slice(0, first.citations![0]!.end)).toMatch(/blue\.$/);
        expect(first.sources).toEqual([SKY]);
        expect(second.content.slice(0, second.citations![0]!.end)).toMatch(/too\.$/);
        expect(second.citations![0]!.sources).toEqual(['s2', 's1']);
        expect(second.sources!.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    });

    it('lists a source no citation places under the last text segment, without a chip', () => {
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'One.\n\n```js\nx\n```\n\nTwo.' },
            { type: 'sources', sources: [SKY] },
            { type: 'text-flush' },
        ]);
        expect(texts[0]!.sources).toBeUndefined();
        expect(texts[1]!.sources).toEqual([SKY]);
        expect(texts[1]!.citations).toEqual([]);
    });

    it('places sources that arrive before the text has been flushed, and again once it has', () => {
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'The sky is blue.' },
            { type: 'sources', sources: [SKY], citations: [{ end: 16, sources: ['s1'] }] },
            { type: 'text-flush' },
        ]);
        expect(texts[0]!.citations).toEqual([{ end: 16, sources: ['s1'] }]);
    });

    it('counts from the model call: a second call starts its offsets again', () => {
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Let me look.' },
            { type: 'text-flush' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Found: blue.' },
            { type: 'sources', sources: [SKY], citations: [{ start: 7, end: 12, sources: ['s1'] }] },
            { type: 'text-flush' },
        ]);
        expect(texts[0]!.sources).toBeUndefined();
        expect(texts[1]!.citations).toEqual([{ start: 7, end: 12, sources: ['s1'] }]);
    });

    it('finds the text past a reasoning block or a code block that repeats it', () => {
        const think = '<think>Draft: Paris is the capital of France. Check.</think>Paris is the capital of France.';
        const [answer] = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: think },
            { type: 'sources', sources: [SKY], citations: [{ end: think.length, sources: ['s1'] }] },
            { type: 'text-flush' },
        ]);
        expect(answer!.citations).toEqual([{ end: 31, sources: ['s1'] }]);

        const code = 'Run:\n```sh\nnpm test\n```\nnpm test';
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: code },
            { type: 'sources', sources: [SKY, SEA], citations: [
                { end: code.length, sources: ['s1'] },
                // Ends inside the code body: no chip on the prose that repeats it.
                { end: code.indexOf('test') + 4, sources: ['s2'] },
                // Ends exactly where the code block starts: closes nothing in what follows.
                { end: code.indexOf('```'), sources: ['s2'] },
            ] },
            { type: 'text-flush' },
        ]);
        const last = texts[texts.length - 1]!;
        expect(last.content).toBe('npm test');
        expect(last.citations).toEqual([{ end: 8, sources: ['s1'] }]);
        expect(texts.flatMap((t) => t.citations ?? []).some((c) => c.sources.includes('s2') && c.end === 0)).toBe(false);
    });

    it('takes a list back from a segment a later placement moves it off, and counts a repeated event once', () => {
        // A list-only source goes to the last text segment: "Intro." while it is, "Outro." once it comes.
        const moved = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Intro.' },
            { type: 'sources', sources: [SKY] },
            { type: 'text-delta', delta: '\n\n```js\nx\n```\n\nOutro.' },
            { type: 'text-flush' },
        ]);
        expect(moved.map((t) => t.sources?.map((s) => s.id) ?? null)).toEqual([null, ['s1']]);

        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Intro.' },
            { type: 'sources', sources: [SKY], citations: [{ end: 6, sources: ['s1'] }] },
            { type: 'sources', sources: [{ id: 's1', url: SKY.url, title: 'Sky', snippet: 'Rayleigh.' }], citations: [{ end: 6, sources: ['s1'] }] },
            { type: 'text-flush' },
        ]);
        expect(texts[0]!.citations).toEqual([{ end: 6, sources: ['s1'] }]);
        expect(texts[0]!.sources![0]!.snippet).toBe('Rayleigh.');
    });

    it('keeps the sources of a call that wrote no text for the reply\'s next text', () => {
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: '```sh\nnpm test\n```' },
            { type: 'sources', sources: [SKY], citations: [{ end: 10, sources: ['s1'] }] },
            { type: 'text-flush' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Done.' },
            { type: 'sources', sources: [{ ...SEA, id: 's1' }] },
            { type: 'text-flush' },
        ]);
        expect(texts.at(-1)!.sources!.map((s) => s.url).sort()).toEqual([SKY.url, SEA.url].sort());
    });

    it('reads a malformed event as no sources, and the run goes on', () => {
        const texts = streamed([
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Blue.' },
            { type: 'sources', citations: [{ end: 5, sources: ['s1'] }] } as never,
            { type: 'text-flush' },
        ]);
        expect(texts[0]!.content).toBe('Blue.');
        expect(texts[0]!.sources).toBeUndefined();
    });
});
