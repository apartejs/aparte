/**
 * The research assistant's two tools, web_search and read_page, answered from the fictional
 * web in sources.ts. A real app would call a search API and a page fetcher here; nothing else
 * on the page would change.
 *
 * web_search returns its results twice: as prose for the model, and as `structuredContent`
 * for the source cards that renderers.ts draws in the transcript.
 */
import type { AparteTool, AparteToolHandler } from '@aparte/core';
import { reducedMotion } from '../runtime';
import { search, sourceAt, type Source } from './sources';

/** What web_search hands the source cards. */
export interface SearchResult {
    query: string;
    results: Pick<Source, 'title' | 'url' | 'snippet'>[];
}

export const webSearchTool: AparteTool = {
    name: 'web_search',
    description: 'Search the web. Returns up to three results, each with a title, a URL and a snippet.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
};

export const readPageTool: AparteTool = {
    name: 'read_page',
    description: 'Read the main text of a web page.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
};

/** The result web_search gives for a query: the cards' data. */
export function searchResult(query: string): SearchResult {
    return { query, results: search(query).map(({ title, url, snippet }) => ({ title, url, snippet })) };
}

/** The same results as prose, which is what the model reads. */
export function searchContent(result: SearchResult): string {
    return result.results.map((r, i) => `${i + 1}. ${r.title} (${r.url}): ${r.snippet}`).join('\n') || 'No results.';
}

/** What read_page returns for a URL. */
export function pageContent(url: string): string {
    const source = sourceAt(url);
    return source ? `${source.title}\n\n${source.text}` : 'The page could not be read.';
}

/** A network takes a moment; under reduced motion the result lands at once. */
const latency = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));

export const webSearch: AparteToolHandler = async (call) => {
    await latency(900);
    const result = searchResult(String(call.input['query'] ?? ''));
    return { toolCallId: call.id, content: searchContent(result), structuredContent: result };
};

export const readPage: AparteToolHandler = async (call) => {
    await latency(600);
    return { toolCallId: call.id, content: pageContent(String(call.input['url'] ?? '')) };
};
