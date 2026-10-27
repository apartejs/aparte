/**
 * sources.ts — the sources a reply cites, read off the two shapes a compat endpoint sends.
 *
 * OpenAI and OpenRouter attach `url_citation` annotations to the message, with the
 * offsets of the passage they support. Perplexity attaches no offsets: it sends the list
 * of sources at the root of the chunk and writes `[1]`, `[2]` into the text itself.
 * Both end in the same `sources` event, emitted once before `done`, because the offsets
 * are into the text the whole call streamed and only mean something once it is complete.
 *
 * What is read here is passed through as data. A `javascript:` URL in an annotation
 * leaves as it arrived: refusing it is the renderer's job (the sanitizer's URL policy),
 * and a provider that filtered would be a second, silent policy.
 */

import type { AparteSource, AparteCitation } from '@aparte/core';

/** The event {@link createSourceCollector} builds: what `AparteStreamEventMap['sources']` carries. */
export interface SourcesEvent {
    type: 'sources';
    sources: AparteSource[];
    citations?: AparteCitation[];
}

/** A non-empty string, or nothing: the wire sends `null` and `''` for what it does not have. */
const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** `[n]` as Perplexity writes it in the text: 1-based into its list of sources. */
const MARKER = /\[(\d{1,3})\]/g;

/** Where `text` holds code: fenced blocks, and backquote spans of any length. */
function codeRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    for (const m of text.matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*$|(?![\s\S]))/gm)) {
        ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
    for (const m of text.matchAll(/(`+)[^`][\s\S]*?\1/g)) {
        const at = m.index ?? 0;
        if (!ranges.some(([a, b]) => at >= a && at < b)) ranges.push([at, at + m[0].length]);
    }
    return ranges;
}

/**
 * Collects annotations and Perplexity's root fields as chunks arrive and builds the
 * `sources` event once the text is complete. One collector per stream, i.e. per call.
 */
export function createSourceCollector() {
    const sources: AparteSource[] = [];
    /** De-duplicated by URL: the same page cited for two passages is one source. */
    const byUrl = new Map<string, AparteSource>();
    /** Annotated passages as the wire gave them, clamped when the text length is known. */
    const annotated: Array<{ start: unknown; end: unknown; id: string }> = [];
    /** Perplexity's fields: the LAST chunk that carries one wins, whatever came before. */
    let urlList: unknown;
    let searchResults: unknown;

    /** The id of the source for this URL/title, minting one the first time. `undefined` when there is nothing to show. */
    const register = (url: string | undefined, title: string | undefined, snippet: string | undefined): string | undefined => {
        if (url === undefined && title === undefined) return undefined;
        const known = url !== undefined ? byUrl.get(url) : undefined;
        if (known) {
            // A later mention can carry what the first one lacked.
            known.title ??= title;
            known.snippet ??= snippet;
            return known.id;
        }
        const source: AparteSource = {
            id: `s${sources.length + 1}`,
            ...(url !== undefined ? { url } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(snippet !== undefined ? { snippet } : {}),
        };
        sources.push(source);
        if (url !== undefined) byUrl.set(url, source);
        return source.id;
    };

    return {
        /**
         * `delta.annotations` / `message.annotations`: `{ type: 'url_citation', url_citation:
         * { start_index, end_index, url, title, content? } }`. An entry of another kind
         * (`file_citation`, …) carries no `url_citation` and is skipped.
         */
        addAnnotations(list: unknown): void {
            if (!Array.isArray(list)) return;
            for (const entry of list) {
                const cited = (entry as { url_citation?: unknown } | null)?.url_citation;
                if (!cited || typeof cited !== 'object') continue;
                const c = cited as Record<string, unknown>;
                const id = register(str(c['url']), str(c['title']), str(c['content']));
                if (id !== undefined) annotated.push({ start: c['start_index'], end: c['end_index'], id });
            }
        },

        /** The root-level `citations: string[]` and `search_results: [{ title, url, snippet? }]`. */
        addListed(citations: unknown, results: unknown): void {
            if (Array.isArray(citations)) urlList = citations;
            if (Array.isArray(results)) searchResults = results;
        },

        /**
         * The `sources` event for a call whose text is `text`, or `undefined` when nothing
         * was cited — a reply with no annotations and no list leaves the stream untouched.
         */
        finish(text: string): SourcesEvent | undefined {
            const citations: AparteCitation[] = [];

            // An offset the wire got wrong (past the end, negative, not a number) is
            // brought back into the text, or the passage is dropped: it is still a source.
            const within = (value: unknown): number | undefined => (
                typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), text.length) : undefined
            );
            for (const { start: from, end: to, id } of annotated) {
                const end = within(to);
                if (end === undefined) continue;
                const s = within(from);
                const start = s !== undefined && s < end ? s : undefined;
                // Two annotations on one passage are one citation with two sources ("+1").
                const same = citations.find(c => c.start === start && c.end === end);
                if (same) {
                    if (!same.sources.includes(id)) same.sources.push(id);
                } else {
                    citations.push({ ...(start !== undefined ? { start } : {}), end, sources: [id] });
                }
            }

            // Perplexity: the richer `search_results` when it sent them, else the bare URLs.
            const results = Array.isArray(searchResults) ? searchResults : [];
            const listed: Array<string | undefined> = results.length
                ? results.map(r => register(
                    str((r as { url?: unknown } | null)?.url),
                    str((r as { title?: unknown } | null)?.title),
                    str((r as { snippet?: unknown } | null)?.snippet),
                ))
                : (Array.isArray(urlList) ? urlList : []).map(u => register(str(u), undefined, undefined));
            if (listed.length) {
                // Code is not prose: an `arr[1]` in a code span or a fence is no marker.
                const code = codeRanges(text);
                for (const m of text.matchAll(MARKER)) {
                    const id = listed[Number(m[1]) - 1];
                    if (id === undefined) continue;
                    const start = m.index ?? 0;
                    if (code.some(([a, b]) => start >= a && start < b)) continue;
                    citations.push({ start, end: start + m[0].length, sources: [id], marker: true });
                }
            }

            if (!sources.length) return undefined;
            return { type: 'sources', sources, ...(citations.length ? { citations } : {}) };
        },
    };
}
