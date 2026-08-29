/**
 * The text side: the index parser, the page splitter and the ranking — on a fixture
 * shaped exactly like what starlight-llms-txt writes, so no network.
 */
import { describe, it, expect } from 'vitest';
import { parseIndex, splitPages, searchPages, queryTerms, DocsSource } from '../index.js';

const INDEX = `# aparté

> A library.

Some details.

## Documentation Sets

- [Abridged documentation](https://apartejs.dev/llms-small.txt): a compact version
- [Complete documentation](https://apartejs.dev/llms-full.txt): the full documentation
- [Tools, approval and asking the user](https://apartejs.dev/_llms-txt/tools.txt): Registering tools, approval, elicitation.
- [Theming and the UI kit](https://apartejs.dev/_llms-txt/theming.txt): CSS variables and the kit of classes.

## Optional

- [npm](https://www.npmjs.com/package/@aparte/core): packages
`;

const TOOLS_SET = `<SYSTEM>Tools, approval and asking the user: Registering tools, approval, elicitation.</SYSTEM>

# Asking the user a typed question

> Pause a run and ask the user for typed input, or for a decision (an approval).

Sometimes a tool cannot finish without something only the user knows. requestUserInput is a plain function.

# Tool calls with human approval — human-in-the-loop UI

> Register a tool the model can call and gate it behind an approve/reject step.

Mark the tool with needsApproval: true. The loop pauses in awaiting-approval until the user decides.

# ask_user tool

> The ready-made ask_user tool; systemPrompt false sends no system message.

createAskUserTool({ systemPrompt: false }) registers the tool with no system message at all.
`;

describe('parseIndex', () => {
    it('reads every set of the "Documentation Sets" list, and nothing else', () => {
        const sets = parseIndex(INDEX);
        expect(sets.map((s) => s.label)).toEqual([
            'Abridged documentation', 'Complete documentation',
            'Tools, approval and asking the user', 'Theming and the UI kit',
        ]);
        expect(sets[2]).toEqual({
            label: 'Tools, approval and asking the user',
            url: 'https://apartejs.dev/_llms-txt/tools.txt',
            description: 'Registering tools, approval, elicitation.',
        });
    });
});

describe('splitPages', () => {
    it('drops the <SYSTEM> preamble and splits on "# Title", reading the "> description" under it', () => {
        const pages = splitPages(TOOLS_SET);
        expect(pages.map((p) => p.title)).toEqual([
            'Asking the user a typed question',
            'Tool calls with human approval — human-in-the-loop UI',
            'ask_user tool',
        ]);
        expect(pages[1]!.description).toBe('Register a tool the model can call and gate it behind an approve/reject step.');
        expect(pages[1]!.body).toContain('needsApproval: true');
        expect(pages[0]!.body).not.toContain('<SYSTEM>');
    });
});

describe('searchPages', () => {
    const pages = splitPages(TOOLS_SET);

    it('ranks the page whose title and description carry the words first', () => {
        const hits = searchPages(pages, 'approval', 'tools');
        expect(hits[0]!.title).toBe('Tool calls with human approval — human-in-the-loop UI');
        expect(hits[0]!.set).toBe('tools');
        expect(hits[0]!.snippet).toContain('needsApproval');
    });

    it('finds an option by its name, the way a model asks', () => {
        const hits = searchPages(pages, 'systemPrompt false');
        expect(hits[0]!.title).toBe('ask_user tool');
    });

    it('drops pages that match no term, and returns nothing for an empty query', () => {
        expect(searchPages(pages, 'zebra')).toEqual([]);
        expect(searchPages(pages, '   ')).toEqual([]);
    });

    it('ignores the words a question is made of, and matches a stem', () => {
        // "a" once matched every page; "approve" has to find "approval".
        const hits = searchPages(pages, 'how do I approve a tool call');
        expect(queryTerms('how do I approve a tool call')).toEqual(['appro', 'tool', 'call']);
        // The approval page wins on title + description + body; "ask_user tool" still
        // matches "tool" (it is one) and lands lower — a hit, not the answer.
        expect(hits[0]!.title).toBe('Tool calls with human approval — human-in-the-loop UI');
        const askUser = hits.find((h) => h.title === 'ask_user tool');
        expect(askUser && askUser.score < hits[0]!.score).toBe(true);
    });
});

describe('DocsSource', () => {
    const fetched: string[] = [];
    const fetchText = async (url: string) => {
        fetched.push(url);
        if (url.endsWith('/llms.txt')) return INDEX;
        if (url.endsWith('/tools.txt')) return TOOLS_SET;
        throw new Error(`unexpected ${url}`);
    };

    it('fetches the index once and a set once, finds a set by a part of its label, and scopes to topic sets', async () => {
        const source = new DocsSource({ baseUrl: 'https://example.test/', fetchText });
        await source.sets();
        await source.sets();
        const set = await source.findSet('approval');
        expect(set?.url).toBe('https://apartejs.dev/_llms-txt/tools.txt');
        await source.pagesOf(set!);
        await source.pagesOf(set!);
        // The set's own host is NOT what gets fetched: only its path, under `baseUrl`.
        expect(fetched).toEqual(['https://example.test/llms.txt', 'https://example.test/_llms-txt/tools.txt']);
        // The two dumps are not searched by default: a topic set is.
        expect((await source.scope()).map((s) => s.label)).toEqual(['Tools, approval and asking the user', 'Theming and the UI kit']);
        expect(await source.scope('nothing like this')).toEqual([]);
    });

    it('never fetches a host the index names — an entry pointing at the metadata service is re-based', async () => {
        // An index is remote text. Fetched verbatim it made the agent's own machine
        // issue the request: link-local metadata, an intranet host, a localhost port.
        const evil = `## Documentation Sets

- [Cloud](http://127.0.0.1:9/latest/meta-data/): nope
`;
        const seen: string[] = [];
        const source = new DocsSource({
            baseUrl: 'https://apartejs.dev',
            fetchText: async (url) => { seen.push(url); return url.endsWith('/llms.txt') ? evil : ''; },
        });
        await source.pagesOf((await source.sets())[0]!);
        expect(seen).toEqual(['https://apartejs.dev/llms.txt', 'https://apartejs.dev/latest/meta-data/']);
        expect(seen.join(' ')).not.toContain('127.0.0.1');
    });

    it('a local build really is read locally: the production index re-bases onto baseUrl', async () => {
        const seen: string[] = [];
        const source = new DocsSource({
            baseUrl: 'http://localhost:4321',
            fetchText: async (url) => { seen.push(url); return url.endsWith('/llms.txt') ? INDEX : TOOLS_SET; },
        });
        const set = await source.findSet('approval');
        expect(set!.url, 'the set keeps the URL the index printed').toBe('https://apartejs.dev/_llms-txt/tools.txt');
        await source.pagesOf(set!);
        expect(seen).toEqual(['http://localhost:4321/llms.txt', 'http://localhost:4321/_llms-txt/tools.txt']);
    });

    it('a baseUrl with a path prefix carries it once, for an absolute entry and a relative one', async () => {
        const rel = `## Documentation Sets

- [Tools](_llms-txt/tools.txt): relative
- [Theming](https://apartejs.dev/_llms-txt/theming.txt): absolute
`;
        const seen: string[] = [];
        const source = new DocsSource({
            baseUrl: 'https://example.test/docs/',
            fetchText: async (url) => { seen.push(url); return url.endsWith('/llms.txt') ? rel : TOOLS_SET; },
        });
        const sets = await source.sets();
        await source.pagesOf(sets[0]!);
        await source.pagesOf(sets[1]!);
        expect(seen).toEqual([
            'https://example.test/docs/llms.txt',
            'https://example.test/docs/_llms-txt/tools.txt',
            'https://example.test/docs/_llms-txt/theming.txt',
        ]);
    });

    it('refuses a set URL that is not http(s)', async () => {
        const bad = `## Documentation Sets

- [Local](file:///etc/passwd): nope
`;
        const source = new DocsSource({ baseUrl: 'https://apartejs.dev', fetchText: async () => bad });
        const set = (await source.sets())[0]!;
        await expect(source.pagesOf(set)).rejects.toThrow(/file:/);
    });

    it('falls back to the complete dump alone when the index lists no topic set', async () => {
        const bare = '## Documentation Sets\n\n- [Abridged documentation](https://d/llms-small.txt): small\n- [Complete documentation](https://d/llms-full.txt): full\n';
        const source = new DocsSource({ baseUrl: 'https://d', fetchText: async () => bare });
        expect((await source.scope()).map((s) => s.label)).toEqual(['Complete documentation']);
    });
});
