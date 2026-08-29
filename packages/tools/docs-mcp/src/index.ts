/**
 * @aparte/docs-mcp — the aparté documentation as an MCP server.
 *
 * Why it exists: two consumers' coding assistants could not FIND things the docs
 * already had — the approval elicitation (one rebuilt a modal it already had), the
 * UI kit of classes, `systemPrompt: false`. A model that reads a site cold misses;
 * a model that can ask finds. This server gives it four questions to ask.
 *
 * Where the text comes from: the site itself. `apartejs.dev/llms.txt` is an index the
 * docs build writes (starlight-llms-txt), listing one file per topic — tools & approval,
 * bring your own loop, theming & the UI kit, providers, reference — and a full dump.
 * The server fetches those on demand and caches them for the process. No snapshot is
 * bundled: `main` is what npm serves, so "the docs online" are the docs of the version
 * you installed, and the package stays a few kilobytes. It needs the network; point
 * `baseUrl` at a local `astro build` output served on localhost to work offline.
 *
 * `baseUrl` is the only origin this server ever talks to. An index is remote text, and
 * the URLs it lists are taken for their PATH alone — a set entry naming another host
 * would otherwise have made the machine running the agent fetch it (a metadata service,
 * an intranet address), and `APARTE_DOCS_URL=http://localhost:4321` would have gone on
 * reading production, since a production index lists production URLs.
 *
 * Every page in those files starts with `# Title` then `> description` (the plugin's
 * format), which is what the page splitter relies on.
 *
 * @packageDocumentation
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createRequire } from 'node:module';

// The version the MCP handshake reports is the PUBLISHED one: changesets bumps
// package.json and nothing else, so a literal here went stale at every release.
// `../package.json` resolves to this package's manifest from dist/index.js, from
// src/index.ts under the workspace source condition, and under vitest alike.
const pkgVersion = (() => {
    try {
        return (createRequire(import.meta.url)('../package.json') as { version?: string }).version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
})();

/** Where the docs live. Override for a local build (`http://localhost:4321`). */
export const DEFAULT_BASE_URL = 'https://apartejs.dev';

/** One entry of `llms.txt`'s "Documentation Sets" list. */
export interface DocsSet {
    /** The set's label as printed in the index, e.g. "Tools, approval and asking the user". */
    label: string;
    /**
     * The URL the index printed, as printed — usually absolute and on the production
     * site. It is NOT what gets fetched: only its path is, under the configured
     * `baseUrl`. See {@link DocsSource.pagesOf}.
     */
    url: string;
    /** The one-sentence description the index gives it. */
    description: string;
}

/** One page inside a set file: the `# Title` / `> description` / body triplet. */
export interface DocsPage {
    title: string;
    description: string;
    /** The page's markdown, description line excluded. */
    body: string;
}

/** A search hit: the page, its score, and a window of text around the first match. */
export interface DocsHit {
    title: string;
    description: string;
    score: number;
    snippet: string;
    /** The set the page was found in. */
    set: string;
}

/** `fetch`-shaped, so a test (or an offline host) can hand in its own. */
export type TextFetcher = (url: string) => Promise<string>;

export interface DocsMcpOptions {
    /**
     * Defaults to {@link DEFAULT_BASE_URL} when unset, empty or blank. A trailing slash
     * is tolerated. This is the only origin the server fetches from: a set the index
     * lists contributes its path, never its host.
     */
    baseUrl?: string;
    /** Defaults to global `fetch` + `response.text()`; a non-2xx status throws. */
    fetchText?: TextFetcher;
}

const defaultFetchText: TextFetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
};

/**
 * Parse the "Documentation Sets" list of an `llms.txt`: `- [label](url): description`.
 * The two entries the plugin always writes (abridged / complete) are kept — a caller
 * may want the full dump — and everything else in the file is ignored.
 */
export function parseIndex(text: string): DocsSet[] {
    const sets: DocsSet[] = [];
    let inSets = false;
    for (const line of text.split('\n')) {
        if (/^## /.test(line)) { inSets = /^## Documentation Sets/.test(line); continue; }
        if (!inSets) continue;
        const m = /^- \[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/.exec(line.trim());
        if (m) sets.push({ label: m[1]!, url: m[2]!, description: (m[3] ?? '').trim() });
    }
    return sets;
}

/**
 * Split a set file into pages. A page starts with a line `# Title`; the plugin writes
 * the page's description as a `> …` quote right under it. The `<SYSTEM>…</SYSTEM>`
 * preamble of a custom set is dropped.
 */
export function splitPages(text: string): DocsPage[] {
    const pages: DocsPage[] = [];
    let current: DocsPage | null = null;
    for (const raw of text.replace(/^<SYSTEM>[\s\S]*?<\/SYSTEM>\s*/u, '').split('\n')) {
        const title = /^# (.+)$/.exec(raw);
        if (title) {
            if (current) pages.push(current);
            current = { title: title[1]!.trim(), description: '', body: '' };
            continue;
        }
        if (!current) continue;
        if (!current.description && !current.body.trim() && /^> /.test(raw)) {
            current.description = raw.slice(2).trim();
            continue;
        }
        current.body += raw + '\n';
    }
    if (current) pages.push(current);
    return pages.map((p) => ({ ...p, body: p.body.trim() }));
}

/** Words a model puts in a question and no page is about. */
const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'in', 'on', 'of', 'and', 'or', 'is', 'it', 'my', 'your', 'how', 'do', 'i', 'with', 'for', 'from', 'be', 'can']);

/**
 * The searchable terms of a query: lower-cased words, stopwords and one-letter words
 * dropped (`"approve a tool call"` once matched every page on its "a"), and long words
 * shortened to a stem so "approve" finds "approval" and "streaming" finds "stream":
 * six letters or more lose their last two.
 */
export function queryTerms(query: string): string[] {
    const words = query.toLowerCase().match(/[a-z0-9_@./-]+/g) ?? [];
    const terms = words
        .filter((w) => w.length > 1 && !STOPWORDS.has(w))
        .map((w) => (w.length >= 6 ? w.slice(0, -2) : w));
    return [...new Set(terms)];
}

/**
 * Rank pages for a query: every query term counted in the body, weighted ×5 in the
 * title and ×3 in the description; a page missing every term scores 0 and is dropped.
 * Plain term frequency is enough for ~60 pages — a model refines with `get_page`.
 */
export function searchPages(pages: DocsPage[], query: string, set = ''): DocsHit[] {
    const terms = queryTerms(query);
    if (!terms.length) return [];
    const hits: DocsHit[] = [];
    for (const page of pages) {
        const title = page.title.toLowerCase();
        const desc = page.description.toLowerCase();
        const body = page.body.toLowerCase();
        let score = 0;
        let first = -1;
        for (const term of terms) {
            if (title.includes(term)) score += 5;
            if (desc.includes(term)) score += 3;
            let at = body.indexOf(term);
            while (at !== -1) {
                score += 1;
                if (first === -1 || at < first) first = at;
                at = body.indexOf(term, at + term.length);
            }
        }
        if (!score) continue;
        const start = Math.max(0, first === -1 ? 0 : first - 160);
        const snippet = page.body.slice(start, start + 400).replace(/\s+/g, ' ').trim();
        hits.push({ title: page.title, description: page.description, score, snippet, set });
    }
    return hits.sort((a, b) => b.score - a.score);
}

/** The loaded-and-cached view of the site: the index, and each set's pages on demand. */
export class DocsSource {
    private readonly base: string;
    private readonly fetchText: TextFetcher;
    private index: Promise<DocsSet[]> | null = null;
    private readonly pages = new Map<string, Promise<DocsPage[]>>();

    constructor(options: DocsMcpOptions = {}) {
        // `||`, not `??`: an env var exported but empty (`APARTE_DOCS_URL=""`) is
        // "unset", and a pasted value with a stray newline fails the same way.
        this.base = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.fetchText = options.fetchText ?? defaultFetchText;
    }

    /** The sets listed by `llms.txt`, fetched once. */
    sets(): Promise<DocsSet[]> {
        this.index ??= this.fetchText(`${this.base}/llms.txt`).then(parseIndex);
        return this.index;
    }

    /** A set by label (case-insensitive, substring tolerated), or undefined. */
    async findSet(label: string): Promise<DocsSet | undefined> {
        const wanted = label.trim().toLowerCase();
        const sets = await this.sets();
        return sets.find((s) => s.label.toLowerCase() === wanted)
            ?? sets.find((s) => s.label.toLowerCase().includes(wanted));
    }

    /**
     * The URL to actually fetch for something the index named: its path (and query),
     * under `baseUrl`. The host the index printed is discarded — an index is text from
     * the network, and following it verbatim is a request made from the machine running
     * the agent. It is also what made `APARTE_DOCS_URL` a half-measure: a local build
     * serves the production index, whose entries are absolute production URLs, so
     * pointing the server at localhost still read the live site.
     *
     * Anything that does not resolve to http(s) — `file:`, `data:`, a bare scheme — is
     * refused rather than quietly re-based, because it is not a docs URL at all.
     */
    private resolve(url: string): string {
        // Against the ORIGIN, not against `base`: a path the index gives is a path from
        // the docs root, so a `baseUrl` that carries a prefix (`https://host/docs`) must
        // prepend it once, not resolve under it and then prepend it again.
        const parsed = new URL(url, `${new URL(this.base).origin}/`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`Refusing to fetch "${url}": ${parsed.protocol} is not a documentation URL`);
        }
        return `${this.base}${parsed.pathname}${parsed.search}`;
    }

    /** The pages of one set, fetched once per set — from `baseUrl`, whatever host the index named. */
    pagesOf(set: DocsSet): Promise<DocsPage[]> {
        let url: string;
        try { url = this.resolve(set.url); } catch (error) { return Promise.reject(error as Error); }
        let p = this.pages.get(url);
        if (!p) { p = this.fetchText(url).then(splitPages); this.pages.set(url, p); }
        return p;
    }

    /** The sets to search: the one named, or every topic set (not the two dumps). */
    async scope(setLabel?: string): Promise<DocsSet[]> {
        if (setLabel) {
            const one = await this.findSet(setLabel);
            return one ? [one] : [];
        }
        const sets = await this.sets();
        const topics = sets.filter((s) => !/^(Abridged|Complete) documentation$/.test(s.label));
        if (topics.length) return topics;
        // An index with no topic sets (an older site, a bare starlight-llms-txt): search
        // the complete dump alone — both dumps hold the same pages, twice the fetch and
        // every hit doubled.
        const full = sets.find((s) => /^Complete documentation$/.test(s.label));
        return full ? [full] : sets.slice(0, 1);
    }
}

/**
 * Build the MCP server. Four tools, in the order a model uses them:
 * `list_sets` → `search_docs` → `get_page`, and `get_set` for a whole topic at once.
 */
export function createDocsMcpServer(options: DocsMcpOptions = {}): McpServer {
    const source = new DocsSource(options);
    const server = new McpServer({ name: 'aparte-docs', version: pkgVersion });
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

    server.registerTool('list_sets', {
        title: 'List the documentation sets',
        description: 'The topics the aparté docs are split into (tools & approval, bring your own loop, theming & the UI kit, providers, reference…), each with a one-sentence description. Start here.',
        inputSchema: {},
    }, async () => {
        const sets = await source.sets();
        return text(sets.map((s) => `- ${s.label}: ${s.description}`).join('\n'));
    });

    server.registerTool('get_set', {
        title: 'Read a whole set',
        description: 'The full text of one documentation set (every page of that topic, markdown). Use when one topic is all you need; a set is 25–250 KB.',
        inputSchema: { set: z.string().describe('A set label from list_sets, or a distinctive part of it, e.g. "approval" or "theming".') },
    }, async ({ set }) => {
        const found = await source.findSet(set);
        if (!found) return text(`No set matches "${set}". Sets: ${(await source.sets()).map((s) => s.label).join(' · ')}`);
        const pages = await source.pagesOf(found);
        return text(pages.map((p) => `# ${p.title}\n\n> ${p.description}\n\n${p.body}`).join('\n\n'));
    });

    server.registerTool('search_docs', {
        title: 'Search the docs',
        description: 'Rank the documentation pages for a query (plain words: "approve a tool call", "systemPrompt false", "finish a turn in display-only"). Returns titles, descriptions and a snippet; read a hit with get_page.',
        inputSchema: {
            query: z.string().describe('What you are looking for, in plain words.'),
            set: z.string().optional().describe('Restrict to one set (label or part of it). Default: every topic set.'),
            limit: z.number().int().min(1).max(20).optional().describe('How many hits. Default 8.'),
        },
    }, async ({ query, set, limit }) => {
        const scope = await source.scope(set);
        if (!scope.length) return text(`No set matches "${set}".`);
        const hits: DocsHit[] = [];
        for (const s of scope) hits.push(...searchPages(await source.pagesOf(s), query, s.label));
        const seen = new Set<string>();
        const top = hits.sort((a, b) => b.score - a.score).filter((h) => !seen.has(h.title) && seen.add(h.title)).slice(0, limit ?? 8);
        if (!top.length) return text(`Nothing matches "${query}". Try other words, or list_sets to see the topics.`);
        return text(top.map((h) => `## ${h.title} (score ${h.score}, set: ${h.set})\n${h.description}\n…${h.snippet}…`).join('\n\n'));
    });

    server.registerTool('get_page', {
        title: 'Read a page',
        description: 'The full markdown of one documentation page, by its title (as returned by search_docs; a distinctive part of the title is enough).',
        inputSchema: {
            title: z.string().describe('The page title, or a distinctive part of it.'),
            set: z.string().optional().describe('The set to look in, if known — faster.'),
        },
    }, async ({ title, set }) => {
        const wanted = title.trim().toLowerCase();
        for (const s of await source.scope(set)) {
            const pages = await source.pagesOf(s);
            const page = pages.find((p) => p.title.toLowerCase() === wanted) ?? pages.find((p) => p.title.toLowerCase().includes(wanted));
            if (page) return text(`# ${page.title}\n\n> ${page.description}\n\n${page.body}`);
        }
        return text(`No page titled "${title}". search_docs finds titles.`);
    });

    return server;
}
