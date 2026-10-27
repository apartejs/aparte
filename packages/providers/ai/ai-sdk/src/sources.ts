/**
 * sources.ts — the sources a reply cites, read off the AI SDK's `fullStream`.
 *
 * Two things come out of the SDK. A `source` part is something the model drew on — a web
 * page, a document — with no place in the text. From ai 7.0.138 a `text-end` part may also
 * carry `citations`: each one names a source and, when the vendor says so, the passage it
 * supports, with offsets relative to THAT text part. aparté's offsets are into all the text
 * the call streamed, so a part's citations are rebased on where the part began.
 *
 * Both end in one `sources` event, emitted by the bridge just before `done`. The
 * `citations` field is read without being typed: the installed SDK may predate it, and a
 * field that is not there is the same as an empty list.
 */

import type { AparteSource, AparteCitation, AparteStreamEvent, AparteChatResponse } from '@aparte/core';

/** The event {@link createSourceCollector} builds: what `AparteStreamEventMap['sources']` carries. */
export type SourcesEvent = Extract<AparteStreamEvent, { type: 'sources' }>;

/** A non-empty string, or nothing. */
const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined);

/** Collects sources and citations as parts stream by. One collector per call. */
export function createSourceCollector() {
    const sources: AparteSource[] = [];
    const citations: AparteCitation[] = [];
    /** De-duplicated by URL: a page the SDK reports twice is one source. */
    const byUrl = new Map<string, AparteSource>();
    const ids = new Set<string>();
    /** Where each text part began in the call's text, and how much of it has streamed. */
    const parts = new Map<string, { start: number; length: number }>();
    let total = 0;

    /**
     * A `source` part (or the `source` of a citation) as an aparté source: `url` carries its
     * URL and title, `document` its title (the filename when it has no other). The id of the
     * SDK is kept unless another source took it. Returns the id, `undefined` for a part that
     * says nothing about where the answer came from.
     */
    const addSource = (part: unknown, snippet?: string): string | undefined => {
        const p = part as Record<string, unknown> | null | undefined;
        if (!p || typeof p !== 'object') return undefined;
        const url = p['sourceType'] === 'url' ? str(p['url']) : undefined;
        const title = p['sourceType'] === 'url' || p['sourceType'] === 'document'
            ? str(p['title']) ?? str(p['filename'])
            : undefined;
        if (url === undefined && title === undefined) return undefined;

        const known = url !== undefined ? byUrl.get(url) : sources.find(s => s.id === p['id'] && s.url === undefined);
        if (known) {
            // A later mention can carry what the first one lacked.
            known.title ??= title;
            known.snippet ??= snippet;
            return known.id;
        }
        let id = str(p['id']) ?? `s${sources.length + 1}`;
        for (let n = 2; ids.has(id); n++) id = `${str(p['id']) ?? 's'}-${n}`;
        ids.add(id);
        const source: AparteSource = {
            id,
            ...(url !== undefined ? { url } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(snippet !== undefined ? { snippet } : {}),
        };
        sources.push(source);
        if (url !== undefined) byUrl.set(url, source);
        return id;
    };

    return {
        addSource,

        /** A `text-start`: the part begins where the text so far ends. */
        textStart(id: string): void {
            parts.set(id, { start: total, length: 0 });
        },

        /** A `text-delta`. A part whose `text-start` was not seen begins at its first delta. */
        textDelta(id: string, delta: string): void {
            let part = parts.get(id);
            if (!part) { part = { start: total, length: 0 }; parts.set(id, part); }
            part.length += delta.length;
            total += delta.length;
        },

        /**
         * A `text-end`, and the `citations` it carries (ai 7.0.138+). Offsets are relative to
         * the part: they are rebased onto the call's text, and kept inside the part they
         * belong to. A citation with no offsets supports the part as a whole, so its chip goes
         * at the part's end. Two sources on one passage are one citation.
         */
        textEnd(id: string, list: unknown): void {
            if (!Array.isArray(list)) return;
            const part = parts.get(id) ?? { start: total, length: 0 };
            const within = (value: number): number => part.start + Math.min(Math.max(value, 0), part.length);
            for (const c of list) {
                const sourceId = addSource(c?.source, str(c?.citedText));
                if (sourceId === undefined) continue;
                const from = num(c.startIndex);
                const to = num(c.endIndex);
                const end = within(to ?? part.length);
                const start = from !== undefined && within(from) < end ? within(from) : undefined;
                const same = citations.find(x => x.start === start && x.end === end);
                if (same) {
                    if (!same.sources.includes(sourceId)) same.sources.push(sourceId);
                } else {
                    citations.push({ ...(start !== undefined ? { start } : {}), end, sources: [sourceId] });
                }
            }
        },

        /** The `sources` event, or `undefined` when the call cited nothing: the stream is then untouched. */
        finish(): SourcesEvent | undefined {
            if (!sources.length) return undefined;
            return { type: 'sources', sources, ...(citations.length ? { citations } : {}) };
        },
    };
}

/**
 * A non-streamed answer: its text, as a string. A bare string cannot carry sources, so an
 * answer that cites some is returned as the stream it would have been — `[text, sources,
 * done]`, which `AparteChatResponse` allows. `sources` is the SDK's `result.sources`;
 * `content` its `result.content`, whose text parts carry the `citations` (ai 7.0.138+).
 */
export function nonStreamedAnswer(
    text: string,
    sources: ReadonlyArray<unknown>,
    content: ReadonlyArray<unknown>,
): AparteChatResponse {
    const cited = createSourceCollector();
    for (const source of sources) cited.addSource(source);
    // A text part's citations are read as the stream would read them, one id per part.
    content.forEach((entry, i) => {
        const part = entry as Record<string, unknown>;
        if (part['type'] !== 'text') return;
        cited.textStart(String(i));
        cited.textDelta(String(i), part['text'] as string);
        cited.textEnd(String(i), part['citations']);
    });
    const event = cited.finish();
    if (!event) return text;
    return new ReadableStream<AparteStreamEvent>({
        start(controller) {
            controller.enqueue({ type: 'text', delta: text });
            controller.enqueue(event);
            controller.enqueue({ type: 'done' });
            controller.close();
        },
    });
}
