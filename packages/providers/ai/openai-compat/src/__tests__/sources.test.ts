/**
 * The sources a reply cites, from the two shapes a compat endpoint sends them in.
 *
 *  - OpenAI / OpenRouter: `url_citation` annotations with the offsets of the passage they
 *    support, on `delta.annotations` (a late chunk, after the text) or `message.annotations`.
 *  - Perplexity: `citations` / `search_results` at the root of a chunk, no offsets, and
 *    `[1]`, `[2]` written into the text.
 *
 * Both end in ONE `sources` event just before `done`, whose offsets are into the text the
 * call streamed. The fixtures are written the way those endpoints stream, one JSON object
 * per `data:` line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AparteDirectTransport } from '@aparte/core';
import type { AparteStreamEvent } from '@aparte/core';
import { createOpenAICompatProvider, parseOpenAICompatStream, presets } from '../index';

function sse(...lines: string[]): ReadableStream<Uint8Array> {
    const text = lines.map(l => `data: ${l}\n`).join('');
    return new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (; ;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

type SourcesEvent = Extract<AparteStreamEvent, { type: 'sources' }>;
const sourcesOf = (events: AparteStreamEvent[]): SourcesEvent[] => events.filter((e): e is SourcesEvent => e.type === 'sources');

const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ choices: [{ delta, ...extra }] });

const A = 'The sky is blue because air scatters short wavelengths.';
const B = ' Sunsets are red for the opposite reason.';

const citation = (start: number, end: number, url: string, title: string, content?: string) => ({
    type: 'url_citation',
    url_citation: { start_index: start, end_index: end, url, title, ...(content ? { content } : {}) },
});

describe('OpenRouter / OpenAI url_citation annotations', () => {
    it('streams the text, then one sources event, then done — offsets as the wire gave them', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ role: 'assistant', content: A }),
            chunk({ content: B }),
            // The annotations arrive in a late chunk, after the text.
            chunk({ annotations: [
                citation(0, A.length, 'https://en.wikipedia.org/wiki/Rayleigh_scattering', 'Rayleigh scattering', 'Scattering of light by small particles.'),
                citation(A.length, A.length + B.length, 'https://www.nasa.gov/sunsets', 'Why sunsets are red'),
            ] }),
            chunk({}, { finish_reason: 'stop' }),
            JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 30, total_tokens: 42 } }),
            '[DONE]',
        )));

        expect(events.map(e => e.type)).toEqual(['text', 'text', 'sources', 'done']);
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [
                { id: 's1', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', title: 'Rayleigh scattering', snippet: 'Scattering of light by small particles.' },
                { id: 's2', url: 'https://www.nasa.gov/sunsets', title: 'Why sunsets are red' },
            ],
            citations: [
                { start: 0, end: A.length, sources: ['s1'] },
                { start: A.length, end: A.length + B.length, sources: ['s2'] },
            ],
        });
        // The usage that follows the finish chunk still lands on the `done`.
        expect(events.at(-1)).toEqual({ type: 'done', usage: expect.objectContaining({ inputTokens: 12, outputTokens: 30 }), finishReason: 'stop' });
    });

    it('reads message.annotations, the non-streamed shape some servers stream', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            JSON.stringify({ choices: [{ message: { annotations: [citation(4, 12, 'https://www.britannica.com/sky', 'Sky')] }, finish_reason: 'stop' }] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [{ id: 's1', url: 'https://www.britannica.com/sky', title: 'Sky' }],
            citations: [{ start: 4, end: 12, sources: ['s1'] }],
        });
    });

    it('de-duplicates by URL: one page cited for two passages is one source', async () => {
        const url = 'https://en.wikipedia.org/wiki/Sky';
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A + B }),
            chunk({ annotations: [citation(0, 10, url, 'Sky'), citation(A.length, A.length + 10, url, 'Sky', 'A later mention carries a snippet.')] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            // The second mention filled what the first lacked.
            sources: [{ id: 's1', url, title: 'Sky', snippet: 'A later mention carries a snippet.' }],
            citations: [
                { start: 0, end: 10, sources: ['s1'] },
                { start: A.length, end: A.length + 10, sources: ['s1'] },
            ],
        });
    });

    it('two sources on one passage are one citation with two ids', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [citation(0, 20, 'https://a.example/1', 'One'), citation(0, 20, 'https://b.example/2', 'Two')] }),
            // The same chunk sent again (a server that repeats its annotations) adds nothing.
            chunk({ annotations: [citation(0, 20, 'https://a.example/1', 'One')] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)).toHaveLength(1);
        expect(sourcesOf(events)[0]?.citations).toEqual([{ start: 0, end: 20, sources: ['s1', 's2'] }]);
    });

    it('brings an offset past the text back into it, and keeps a passage whose offsets are unusable as a bare source', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: 'Short.' }),
            chunk({ annotations: [
                citation(-5, 999, 'https://a.example/1', 'Clamped'),
                { type: 'url_citation', url_citation: { url: 'https://b.example/2', title: 'No offsets' } },
                // An empty passage (start at the end) cites a point, not a range.
                citation(6, 6, 'https://c.example/3', 'A point'),
            ] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [
                { id: 's1', url: 'https://a.example/1', title: 'Clamped' },
                { id: 's2', url: 'https://b.example/2', title: 'No offsets' },
                { id: 's3', url: 'https://c.example/3', title: 'A point' },
            ],
            citations: [
                { start: 0, end: 6, sources: ['s1'] },
                { end: 6, sources: ['s3'] },
            ],
        });
    });

    it('passes a javascript: URL through as data: refusing it is the renderer\'s job', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [citation(0, 5, 'javascript:alert(1)', 'Click me')] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]?.sources).toEqual([{ id: 's1', url: 'javascript:alert(1)', title: 'Click me' }]);
        expect(events.at(-1)?.type).toBe('done');
    });

    it('a title without a URL is still a source; an entry with neither is skipped', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [
                { type: 'url_citation', url_citation: { start_index: 0, end_index: 3, title: 'A printed book' } },
                { type: 'url_citation', url_citation: { start_index: 0, end_index: 3, url: '', title: null } },
            ] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [{ id: 's1', title: 'A printed book' }],
            citations: [{ start: 0, end: 3, sources: ['s1'] }],
        });
    });

    it('ignores annotations that are not url citations, and a non-array', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [{ type: 'file_citation', file_citation: { file_id: 'f1' } }, null, 'nope'] }),
            chunk({ annotations: 'not-a-list' }),
            '[DONE]',
        )));
        expect(events).toEqual([{ type: 'text', delta: A }, { type: 'done', usage: undefined }]);
    });

    it('emits the sources before done when the socket closes without [DONE]', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [citation(0, 3, 'https://a.example/1', 'One')] }),
        )));
        expect(events.map(e => e.type)).toEqual(['text', 'sources', 'done']);
    });

    it('a tool call turn still flushes its calls before the sources and the done', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'lookup', arguments: '{}' } }] }),
            chunk({ annotations: [citation(0, 3, 'https://a.example/1', 'One')] }),
            chunk({}, { finish_reason: 'tool_calls' }),
            '[DONE]',
        )));
        expect(events.map(e => e.type)).toEqual(['text', 'tool_use', 'sources', 'done']);
    });
});

describe('Perplexity: a list of sources at the root and [n] markers in the text', () => {
    const results = [
        { title: 'Rayleigh scattering', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', snippet: 'Scattering by particles smaller than the wavelength.', date: '2025-01-02' },
        { title: 'Why is the sky blue?', url: 'https://www.nasa.gov/sky' },
    ];

    it('turns each [n] into a marker citation at its offset, whatever the chunk boundaries', async () => {
        const text = 'The sky is blue[1] and sunsets are red[2][1].';
        const events = await collect(parseOpenAICompatStream(sse(
            // The marker `[1]` is split across two chunks: the text is read as a whole.
            chunk({ content: 'The sky is blue[' }),
            JSON.stringify({ citations: results.map(r => r.url), choices: [{ delta: { content: '1] and sunsets are red[2][1].' } }] }),
            JSON.stringify({ citations: results.map(r => r.url), search_results: results, choices: [{ delta: {}, finish_reason: 'stop' }] }),
            '[DONE]',
        )));

        expect(events.map(e => e.type)).toEqual(['text', 'text', 'sources', 'done']);
        const m1 = text.indexOf('[1]');
        const m2 = text.indexOf('[2]');
        const m1again = text.lastIndexOf('[1]');
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [
                { id: 's1', url: results[0]?.url, title: 'Rayleigh scattering', snippet: 'Scattering by particles smaller than the wavelength.' },
                { id: 's2', url: results[1]?.url, title: 'Why is the sky blue?' },
            ],
            citations: [
                { start: m1, end: m1 + 3, sources: ['s1'], marker: true },
                { start: m2, end: m2 + 3, sources: ['s2'], marker: true },
                { start: m1again, end: m1again + 3, sources: ['s1'], marker: true },
            ],
        });
    });

    it('falls back to the bare URLs when there are no search_results', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ citations: ['https://a.example/1', 'https://b.example/2'], choices: [{ delta: { content: 'Yes[2].' } }] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [{ id: 's1', url: 'https://a.example/1' }, { id: 's2', url: 'https://b.example/2' }],
            citations: [{ start: 3, end: 6, sources: ['s2'], marker: true }],
        });
    });

    it('the last chunk that carries the list wins, and a usage-only chunk may carry it', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ citations: ['https://a.example/1'], choices: [{ delta: { content: 'One[1] two[2].' } }] }),
            JSON.stringify({ citations: ['https://a.example/1', 'https://b.example/2'], choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
            '[DONE]',
        )));
        const [event] = sourcesOf(events);
        expect(event?.sources.map(s => s.url)).toEqual(['https://a.example/1', 'https://b.example/2']);
        expect(event?.citations?.map(c => c.sources)).toEqual([['s1'], ['s2']]);
    });

    it('leaves a marker alone when it names no source, and `[0]` or a long number is not one', async () => {
        const text = 'a[0] b[2] c[1234] d[1].';
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ citations: ['https://a.example/1'], choices: [{ delta: { content: text } }] }),
            '[DONE]',
        )));
        const at = text.indexOf('[1]');
        expect(sourcesOf(events)[0]?.citations).toEqual([{ start: at, end: at + 3, sources: ['s1'], marker: true }]);
    });

    it('lists the sources without citations when the text carries no marker', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ search_results: results, choices: [{ delta: { content: 'No markers here.' } }] }),
            '[DONE]',
        )));
        const [event] = sourcesOf(events);
        expect(event?.sources).toHaveLength(2);
        expect(event).not.toHaveProperty('citations');
    });

    it('an entry of the list with no URL and no title keeps the numbering and cites nothing', async () => {
        const text = 'a[1] b[2] c[3].';
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ search_results: [{}, { title: 'Second', url: 'https://b.example/2' }, null], choices: [{ delta: { content: text } }] }),
            '[DONE]',
        )));
        const at = text.indexOf('[2]');
        expect(sourcesOf(events)[0]).toEqual({
            type: 'sources',
            sources: [{ id: 's1', url: 'https://b.example/2', title: 'Second' }],
            citations: [{ start: at, end: at + 3, sources: ['s1'], marker: true }],
        });
    });

    it('a javascript: URL in the list is data too', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ citations: ['javascript:alert(1)'], choices: [{ delta: { content: 'x[1]' } }] }),
            '[DONE]',
        )));
        expect(sourcesOf(events)[0]?.sources).toEqual([{ id: 's1', url: 'javascript:alert(1)' }]);
    });

    it('merges a list and annotations on one URL into one source', async () => {
        const url = 'https://a.example/1';
        const events = await collect(parseOpenAICompatStream(sse(
            JSON.stringify({ citations: [url], choices: [{ delta: { content: 'One[1].' } }] }),
            chunk({ annotations: [citation(0, 3, url, 'One')] }),
            '[DONE]',
        )));
        const [event] = sourcesOf(events);
        expect(event?.sources).toEqual([{ id: 's1', url, title: 'One' }]);
        expect(event?.citations).toEqual([
            { start: 0, end: 3, sources: ['s1'] },
            { start: 3, end: 6, sources: ['s1'], marker: true },
        ]);
    });
});

describe('no sources', () => {
    it('a reply with no annotations and no list is the stream it always was', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: 'Hello' }),
            chunk({ content: ' there [1]' }),
            chunk({}, { finish_reason: 'stop' }),
            '[DONE]',
        )));
        expect(events).toEqual([
            { type: 'text', delta: 'Hello' },
            { type: 'text', delta: ' there [1]' },
            { type: 'done', usage: undefined, finishReason: 'stop' },
        ]);
    });

    it('an error ends the stream with no sources and no done', async () => {
        const events = await collect(parseOpenAICompatStream(sse(
            chunk({ content: A }),
            chunk({ annotations: [citation(0, 3, 'https://a.example/1', 'One')] }),
            JSON.stringify({ error: { message: 'boom' } }),
        )));
        expect(events.map(e => e.type)).toEqual(['text', 'error']);
    });
});

describe('the Perplexity preset', () => {
    beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
    afterEach(() => { vi.unstubAllGlobals(); });

    const provider = createOpenAICompatProvider(presets.PERPLEXITY);

    it('is a cloud preset that needs a key, with its models declared (there is no /models to ask)', () => {
        const meta = provider.getMetadata();
        expect(meta.id).toBe('perplexity');
        expect(meta.helpUrl).toContain('perplexity.ai');
        expect(meta.isLocal).toBeUndefined();
        expect(meta.configSchema?.fields.find(f => f.id === 'apiKey')?.required).toBe(true);
        expect(provider.getModels().map(m => m.id)).toContain('sonar');
        expect(provider.defaultEndpoint).toBe('https://api.perplexity.ai');
        expect(provider.buildRequest({ modelId: 'sonar', messages: [{ role: 'user', content: 'Hi' }] }).path).toBe('/chat/completions');
    });

    it('streams a reply through the transport and ends it with its sources', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(sse(
            JSON.stringify({ choices: [{ delta: { content: 'Blue[1].' } }] }),
            JSON.stringify({ citations: ['https://www.nasa.gov/sky'], choices: [{ delta: {}, finish_reason: 'stop' }] }),
            '[DONE]',
        )));
        const stream = await new AparteDirectTransport({ byok: true }).chat(
            provider,
            { modelId: 'sonar', messages: [{ role: 'user', content: 'Why is the sky blue?' }] },
            { apiKey: 'pplx-test' },
            { providerId: 'perplexity' },
        );
        const events = await collect(stream as ReadableStream<AparteStreamEvent>);
        expect(events.map(e => e.type)).toEqual(['text', 'sources', 'done']);
        expect(sourcesOf(events)[0]?.citations).toEqual([{ start: 4, end: 7, sources: ['s1'], marker: true }]);
    });

    it('reads what a non-streamed answer cites, beside its text', () => {
        const json = { choices: [{ message: { content: 'Hi there', annotations: [citation(0, 2, 'https://a.example/1', 'One')] } }] };
        expect(provider.parseText!(json)).toBe('Hi there');
        expect(provider.parseSources!(json)).toEqual({
            sources: [{ id: 's1', url: 'https://a.example/1', title: 'One' }],
            citations: [{ start: 0, end: 2, sources: ['s1'] }],
        });
        expect(provider.parseSources!({ choices: [{ message: { content: 'Hi' } }] })).toBeUndefined();
    });

    it('takes no marker in code for a citation', async () => {
        const text = 'Use `arr[1]` here[1].';
        const stream = parseOpenAICompatStream(sse(chunk({ content: text }), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], citations: ['https://a.example/1'] }), '[DONE]'));
        const events = await collect(stream);
        expect(sourcesOf(events)[0]?.citations).toEqual([{ start: text.lastIndexOf('[1]'), end: text.lastIndexOf('[1]') + 3, sources: ['s1'], marker: true }]);
    });

    it('serves the models it declares, asking no GET /models', async () => {
        const models = await provider.fetchModels!('key');
        expect(models.map(m => m.id)).toContain('sonar');
        expect(fetch).not.toHaveBeenCalled();
    });
});
