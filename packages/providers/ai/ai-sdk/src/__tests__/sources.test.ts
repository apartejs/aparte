/**
 * The sources a reply cites, off the AI SDK's `fullStream`.
 *
 * A `source` part is a page or a document the model drew on; from ai 7.0.138 a `text-end`
 * part may also carry `citations`, each naming a source and (when the vendor says so) the
 * passage it supports, with offsets relative to THAT text part. The installed SDK predates
 * the field, so those parts are written here by hand, the way the newer SDK emits them; the
 * `source` parts also go through the real SDK with a mock model.
 *
 * Either ends in ONE `sources` event just before `done`, with offsets into all the text the
 * call streamed.
 */
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { AparteStreamEvent } from '@aparte/core';
import { createAiSdkProvider, fullStreamToAparteEvents } from '../index';
import { nonStreamedAnswer } from '../sources';

type Part = { type: string } & Record<string, unknown>;

async function* parts(...list: Part[]): AsyncGenerator<Part> { for (const p of list) yield p; }

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (; ;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

const run = (...list: Part[]) => collect(fullStreamToAparteEvents(parts(...list)));

type SourcesEvent = Extract<AparteStreamEvent, { type: 'sources' }>;
const sourcesOf = (events: AparteStreamEvent[]): SourcesEvent[] => events.filter((e): e is SourcesEvent => e.type === 'sources');

const finish: Part = { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 1 } };
const text = (id: string, ...deltas: string[]): Part[] => [
    { type: 'text-start', id },
    ...deltas.map(d => ({ type: 'text-delta', id, text: d })),
];
const urlSource = (id: string, url: string, title?: string): Part => ({ type: 'source', sourceType: 'url', id, url, ...(title ? { title } : {}) });

describe('source parts', () => {
    it('ends the turn with one sources event before done: url sources, document sources', async () => {
        const events = await run(
            ...text('t1', 'The sky is blue.'),
            { type: 'text-end', id: 't1' },
            urlSource('a', 'https://en.wikipedia.org/wiki/Rayleigh_scattering', 'Rayleigh scattering'),
            { type: 'source', sourceType: 'document', id: 'b', mediaType: 'application/pdf', title: 'Atmospheric optics', filename: 'optics.pdf' },
            { type: 'source', sourceType: 'document', id: 'c', mediaType: 'application/pdf', title: '', filename: 'notes.pdf' },
            finish,
        );
        expect(events.map(e => e.type)).toEqual(['text', 'sources', 'done']);
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [
                { id: 'a', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', title: 'Rayleigh scattering' },
                { id: 'b', title: 'Atmospheric optics' },
                // No title: the filename stands in for it. A document has no URL.
                { id: 'c', title: 'notes.pdf' },
            ],
        });
    });

    it('de-duplicates by URL and keeps ids unique', async () => {
        const events = await run(
            urlSource('a', 'https://a.example/1'),
            urlSource('a2', 'https://a.example/1', 'Late title'),
            // The same id for a different page: it is not the same source, and gets its own id.
            urlSource('a', 'https://b.example/2', 'Other'),
            finish,
        );
        expect(sourcesOf(events)[0]?.sources).toEqual([
            { id: 'a', url: 'https://a.example/1', title: 'Late title' },
            { id: 'a-2', url: 'https://b.example/2', title: 'Other' },
        ]);
    });

    it('passes a javascript: URL through as data and skips a part that says nothing', async () => {
        const events = await run(
            urlSource('a', 'javascript:alert(1)', 'Click me'),
            { type: 'source', sourceType: 'url', id: 'empty' },
            { type: 'source', sourceType: 'something-newer', id: 'n', url: 'https://n.example' },
            { type: 'source', sourceType: 'url', url: 'https://noid.example' },
            finish,
        );
        expect(sourcesOf(events)[0]?.sources).toEqual([
            { id: 'a', url: 'javascript:alert(1)', title: 'Click me' },
            { id: 's2', url: 'https://noid.example' },
        ]);
    });

    it('a stream with no source is the stream it always was', async () => {
        const events = await run(...text('t1', 'Hello'), { type: 'text-end', id: 't1', citations: [] }, finish);
        expect(events.map(e => e.type)).toEqual(['text', 'done']);
    });

    it('an error ends the turn with no sources', async () => {
        const events = await run(urlSource('a', 'https://a.example/1'), { type: 'error', error: new Error('boom') });
        expect(events).toEqual([{ type: 'error', message: 'boom' }]);
    });
});

describe('citations on a text-end part (ai 7.0.138+)', () => {
    const doc = (id: string, url: string, title?: string) => ({ type: 'source', sourceType: 'url', id, url, ...(title ? { title } : {}) });

    it('rebases a part\'s offsets onto the text of the whole call', async () => {
        const first = 'Rayleigh scattering makes the sky blue. ';
        const second = 'Sunsets are red.';
        const events = await run(
            ...text('t1', first),
            { type: 'text-end', id: 't1', citations: [
                { source: doc('a', 'https://en.wikipedia.org/wiki/Rayleigh_scattering', 'Rayleigh scattering'), startIndex: 0, endIndex: 39, citedText: 'Short wavelengths scatter more.' },
            ] },
            ...text('t2', second),
            { type: 'text-end', id: 't2', citations: [
                { source: doc('b', 'https://www.nasa.gov/sunsets', 'Sunsets'), startIndex: 0, endIndex: 16 },
            ] },
            finish,
        );
        expect(events.map(e => e.type)).toEqual(['text', 'text', 'sources', 'done']);
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [
                { id: 'a', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', title: 'Rayleigh scattering', snippet: 'Short wavelengths scatter more.' },
                { id: 'b', url: 'https://www.nasa.gov/sunsets', title: 'Sunsets' },
            ],
            citations: [
                { start: 0, end: 39, sources: ['a'] },
                // The second part began where the first ended.
                { start: first.length, end: first.length + 16, sources: ['b'] },
            ],
        });
    });

    it('a part that opens without a text-start begins at its first delta', async () => {
        const events = await run(
            { type: 'text-delta', id: 'x', text: 'abcde' },
            { type: 'text-delta', id: 'y', text: 'fghij' },
            { type: 'text-end', id: 'y', citations: [{ source: doc('a', 'https://a.example/1'), startIndex: 1, endIndex: 3 }] },
            finish,
        );
        expect(sourcesOf(events)[0]?.citations).toEqual([{ start: 6, end: 8, sources: ['a'] }]);
    });

    it('two sources on one passage are one citation; a source already listed is not listed twice', async () => {
        const events = await run(
            ...text('t1', 'One passage cited twice.'),
            urlSource('a', 'https://a.example/1', 'One'),
            { type: 'text-end', id: 't1', citations: [
                { source: doc('a-again', 'https://a.example/1'), startIndex: 0, endIndex: 7 },
                { source: doc('b', 'https://b.example/2', 'Two'), startIndex: 0, endIndex: 7 },
                { source: doc('b', 'https://b.example/2', 'Two'), startIndex: 0, endIndex: 7 },
            ] },
            finish,
        );
        const [event] = sourcesOf(events);
        expect(event?.sources.map(s => s.id)).toEqual(['a', 'b']);
        expect(event?.citations).toEqual([{ start: 0, end: 7, sources: ['a', 'b'] }]);
    });

    it('a citation without offsets supports the whole part, and offsets stay inside it', async () => {
        const events = await run(
            ...text('t1', 'Twelve chars'),
            { type: 'text-end', id: 't1', citations: [
                { source: doc('a', 'https://a.example/1') },
                { source: doc('b', 'https://b.example/2'), startIndex: -4, endIndex: 999 },
                { source: doc('c', 'https://c.example/3'), startIndex: 5 },
                { source: doc('d', 'https://d.example/4'), endIndex: 5 },
                { source: doc('e', 'https://e.example/5'), startIndex: 9, endIndex: 9 },
            ] },
            finish,
        );
        expect(sourcesOf(events)[0]?.citations).toEqual([
            // No offsets, and the one that spans the part: the same range, so one citation.
            { end: 12, sources: ['a'] },
            { start: 0, end: 12, sources: ['b'] },
            { start: 5, end: 12, sources: ['c'] },
            { end: 5, sources: ['d'] },
            { end: 9, sources: ['e'] },
        ]);
    });

    it('keeps a source whose citation cannot be placed, and ignores one naming no source', async () => {
        const events = await run(
            ...text('t1', 'Text'),
            { type: 'text-end', id: 't1', citations: [{ source: doc('a', 'https://a.example/1'), startIndex: 'x', endIndex: Number.NaN }, { startIndex: 0 }, null] },
            { type: 'text-end', id: 't9', citations: 'not-a-list' },
            finish,
        );
        const [event] = sourcesOf(events);
        expect(event?.sources).toEqual([{ id: 'a', url: 'https://a.example/1' }]);
        // Neither offset was a number: the whole part, as for a citation with none.
        expect(event?.citations).toEqual([{ end: 4, sources: ['a'] }]);
    });

    it('an older SDK (no citations on text-end) still lists its source parts', async () => {
        const events = await run(...text('t1', 'Hi'), { type: 'text-end', id: 't1' }, urlSource('a', 'https://a.example/1'), finish);
        const [event] = sourcesOf(events);
        expect(event?.sources).toHaveLength(1);
        expect(event).not.toHaveProperty('citations');
    });

    it('a text-end for a part never seen cites at the end of the text so far', async () => {
        const events = await run(
            ...text('t1', 'Hello'),
            { type: 'text-end', id: 'ghost', citations: [{ source: doc('a', 'https://a.example/1'), startIndex: 0, endIndex: 3 }] },
            finish,
        );
        expect(sourcesOf(events)[0]?.citations).toEqual([{ end: 5, sources: ['a'] }]);
    });
});

describe('through the SDK', () => {
    const V3_USAGE = {
        inputTokens: { total: 5, noCache: 5, cacheRead: 3, cacheWrite: undefined },
        outputTokens: { total: 2, text: 2, reasoning: undefined },
    } as const;
    type V3Chunk = MockLanguageModelV3['doStream'] extends
        (...args: never[]) => PromiseLike<{ stream: ReadableStream<infer C> }> ? C : never;

    const cited = (chunks: unknown[], over: Record<string, unknown> = {}) => createAiSdkProvider({
        id: 'mockvendor',
        languageModel: () => new MockLanguageModelV3({
            doStream: { stream: simulateReadableStream<V3Chunk>({ chunks: chunks as V3Chunk[], chunkDelayInMs: 0 }) },
        }),
        ...over,
    });

    const REQ = { modelId: 'm-1', messages: [{ role: 'user' as const, content: 'hi' }], stream: true };
    const TURN = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Hello' },
        { type: 'text-end', id: 't1' },
        { type: 'source', sourceType: 'url', id: 'src1', url: 'https://www.nasa.gov/sky', title: 'The sky' },
        { type: 'finish', usage: V3_USAGE, finishReason: 'stop' },
    ];

    it('a source part from a real streamText call reaches the stream, before done', async () => {
        const events = await collect(await cited(TURN).chat!(REQ) as ReadableStream<AparteStreamEvent>);
        expect(events.map(e => e.type)).toEqual(['text', 'sources', 'done']);
        expect(sourcesOf(events)[0]?.sources).toEqual([{ id: 'src1', url: 'https://www.nasa.gov/sky', title: 'The sky' }]);
    });

    it('a non-streamed answer that cites sources comes back as the stream it would have been', async () => {
        const out = await cited(TURN).chat!({ ...REQ, stream: false });
        expect(out).toBeInstanceOf(ReadableStream);
        const events = await collect(out as ReadableStream<AparteStreamEvent>);
        expect(events).toEqual([
            { type: 'text', delta: 'Hello' },
            { type: 'sources', sources: [{ id: 'src1', url: 'https://www.nasa.gov/sky', title: 'The sky' }] },
            { type: 'done' },
        ]);
    });

    it('a non-streamed answer that cites nothing is still a string', async () => {
        const out = await cited(TURN.filter(p => p.type !== 'source')).chat!({ ...REQ, stream: false });
        expect(out).toBe('Hello');
    });

});

describe('a non-streamed answer', () => {
    it('reads the sources of the result and the citations of its text parts, rebased on the whole text', async () => {
        const out = nonStreamedAnswer(
            'First part. Second part.',
            [{ type: 'source', sourceType: 'url', id: 'a', url: 'https://a.example/1', title: 'One' }],
            [
                { type: 'text', text: 'First part. ' },
                { type: 'reasoning', text: 'not text' },
                { type: 'text', text: 'Second part.', citations: [{ source: { type: 'source', sourceType: 'url', id: 'b', url: 'https://b.example/2' }, startIndex: 0, endIndex: 6 }] },
            ],
        );
        expect(out).toBeInstanceOf(ReadableStream);
        expect(await collect(out as ReadableStream<AparteStreamEvent>)).toEqual([
            { type: 'text', delta: 'First part. Second part.' },
            {
                type: 'sources',
                sources: [{ id: 'a', url: 'https://a.example/1', title: 'One' }, { id: 'b', url: 'https://b.example/2' }],
                citations: [{ start: 12, end: 18, sources: ['b'] }],
            },
            { type: 'done' },
        ]);
    });

    it('is the plain string when nothing is cited', () => {
        expect(nonStreamedAnswer('Hello', [], [{ type: 'text', text: 'Hello' }])).toBe('Hello');
    });
});
