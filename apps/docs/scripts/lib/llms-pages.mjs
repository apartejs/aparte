/**
 * The page list of `/llms.txt`: every docs page, one line each, linking to its markdown twin.
 *
 * The llms.txt proposal (v2, https://llmstxt.org/) expects an agent to read `/llms.txt`, then
 * follow the links it needs, so the links must lead to LLM-friendly content that fits in a
 * context. Ours used to lead only to the bundles (`llms-small.txt`, `llms-full.txt` and the
 * topic sets, 23 KB to 3.4 MB each), which a web fetch cuts after its first part. Each docs
 * page now has a markdown twin at `<page>/index.md` (src/pages/[...slug]/index.md.ts), and
 * this is the list of them, in the sidebar's order.
 *
 * Read from the files at config time, as the sidebar is (`guides.mjs`, `catalogue.mjs`): the
 * plugin builds `/llms.txt` from a string it is given, not from the collection. A page the
 * sections below do not place still gets a line, under "More pages", so a new folder cannot
 * drop out of the list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { guideGroups } from './guides.mjs';
import { GROUPS, readCatalogue } from './catalogue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(here, '../../src/content/docs');

function frontmatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    return match ? (parse(match[1]) ?? {}) : {};
}

/** Every docs page on disk: `'/guides/tools/' → { title, description, order }`, drafts left out. */
function readPages(dir = DOCS_DIR) {
    const pages = new Map();
    const walk = (folder) => {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
            const path = join(folder, entry.name);
            if (entry.isDirectory()) { walk(path); continue; }
            if (!/\.mdx?$/.test(entry.name)) continue;
            const data = frontmatter(readFileSync(path, 'utf8'));
            if (data.draft) continue;
            const id = relative(dir, path).replace(/\\/g, '/').replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
            pages.set(id ? `/${id}/` : '/', {
                title: String(data.hero?.title ?? data.title ?? id),
                description: String(data.hero?.tagline ?? data.description ?? '').replace(/\s+/g, ' ').trim(),
                order: Number.isFinite(data.sidebar?.order) ? data.sidebar.order : 999,
            });
        }
    };
    walk(dir);
    return pages;
}

/** The links of sidebar items, nested groups flattened. */
const links = (items = []) => items.flatMap((item) => (item.items ? links(item.items) : [item.link]));

/** The pages under a folder, as Starlight's `autogenerate` orders them: `sidebar.order`, then the path. */
const under = (pages, prefix) => [...pages.keys()]
    .filter((route) => route.startsWith(prefix))
    .sort((a, b) => pages.get(a).order - pages.get(b).order || a.localeCompare(b));

/**
 * The page list as markdown: one `## Section` per sidebar group, then `- [Title](url): description`.
 * @param {string} site the site's origin, e.g. `https://apartejs.dev`
 */
export function llmsPageIndex(site, dir = DOCS_DIR) {
    const pages = readPages(dir);
    const guides = guideGroups();
    const catalogue = readCatalogue();
    const sections = [
        ['Start here', links(guides.start)],
        ['Look and content', links(guides.look)],
        ['Frameworks', under(pages, '/frameworks/')],
        ['Conversations', links(guides.conversations)],
        ['Agents and tools', links(guides.agents)],
        ['Models and agents', ['/providers/', ...under(pages, '/providers/ai/'), ...under(pages, '/providers/agent/'), ...links(guides.models)]],
        ['Other plugins', under(pages, '/other-plugins/')],
        ['Help', links(guides.help)],
        ...GROUPS.map((g) => [`Components: ${g.label}`, catalogue.filter((e) => e.group === g.id).map((e) => `/components/${e.slug}/`)]),
        ['Indexes', ['/components/', '/components/elements/', ...under(pages, '/segments/'), ...under(pages, '/kit/')]],
        ['Reference', under(pages, '/reference/')],
        ['Articles', under(pages, '/articles/')],
        ['About aparté', ['/why/', '/compare/']],
    ];
    const listed = new Set();
    const line = (route) => {
        const page = pages.get(route);
        listed.add(route);
        const url = `${site}${route}index.md`;
        return `- [${page.title}](${url})${page.description ? `: ${page.description}` : ''}`;
    };
    const blocks = [];
    for (const [label, routes] of sections) {
        const lines = routes.filter((route) => pages.has(route) && !listed.has(route)).map(line);
        if (lines.length > 0) blocks.push(`## ${label}\n\n${lines.join('\n')}`);
    }
    const rest = [...pages.keys()].filter((route) => !listed.has(route)).sort();
    if (rest.length > 0) blocks.push(`## More pages\n\n${rest.map(line).join('\n')}`);
    return blocks.join('\n\n');
}
