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
});
