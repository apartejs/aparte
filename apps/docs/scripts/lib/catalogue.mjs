/**
 * The component catalogue, read from its pages.
 *
 * A catalogue page is `src/content/docs/components/<slug>.mdx`, written by hand, and its own
 * frontmatter says what it is:
 *
 *   catalog:
 *     group: chat            # chat | layout | kit
 *     order: 3               # position inside the group
 *     claims:                # what the page documents, so nothing is documented twice or never
 *       elements: [aparte-composer, aparte-composer-input, …]
 *       segments: [thinking]
 *       classes: [button]    # kit family ids (one per stylesheet)
 *       plugin: '@aparte/plugin-model-selector'
 *     demos: [composer-minimal, composer-attachments]
 *
 * Everything that needs the catalogue's shape OUTSIDE Astro reads it here, from the files: the
 * Components sidebar in astro.config.mjs, the component count stamped into the READMEs and
 * llms.txt, and the check that every element, segment and kit family has a page. One source,
 * and it is the pages — the same rule the generators follow for what they generate.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));

/** Where the hand-written catalogue pages live (flat files; the group folders are generated). */
export const COMPONENTS_DIR = resolve(here, '../../src/content/docs/components');

/** The three groups, in reading order: the chat first, the generic kit last. */
export const GROUPS = [
    { id: 'chat', label: 'Chat' },
    { id: 'layout', label: 'Layout' },
    { id: 'kit', label: 'Kit' },
];

const GROUP_IDS = new Set(GROUPS.map((g) => g.id));

function frontmatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    return match ? (parse(match[1]) ?? {}) : {};
}

function list(value) {
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Every catalogue page, sorted by group then order.
 * A page in the folder with no `catalog` block is not part of the catalogue (the overview).
 */
export function readCatalogue(dir = COMPONENTS_DIR) {
    if (!existsSync(dir)) return [];
    const entries = [];
    for (const file of readdirSync(dir, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith('.mdx') || file.name === 'index.mdx') continue;
        const path = join(dir, file.name);
        const data = frontmatter(readFileSync(path, 'utf8'));
        if (!data.catalog) continue;
        const { group, order, claims = {}, demos } = data.catalog;
        if (!GROUP_IDS.has(group)) {
            throw new Error(`${file.name}: catalog.group must be one of ${[...GROUP_IDS].join(', ')}, got ${JSON.stringify(group)}`);
        }
        entries.push({
            slug: file.name.replace(/\.mdx$/, ''),
            path,
            title: String(data.title ?? ''),
            label: String(data.sidebar?.label ?? data.title ?? ''),
            description: String(data.description ?? ''),
            group,
            order: Number.isFinite(order) ? order : 999,
            claims: {
                elements: list(claims.elements),
                segments: list(claims.segments),
                classes: list(claims.classes),
                plugin: claims.plugin ? String(claims.plugin) : null,
            },
            demos: list(demos),
        });
    }
    const rank = (g) => GROUPS.findIndex((x) => x.id === g);
    return entries.sort((a, b) => rank(a.group) - rank(b.group) || a.order - b.order || a.slug.localeCompare(b.slug));
}

/** How many components, in all and per group — the number the site and the READMEs print. */
export function countCatalogue(entries = readCatalogue()) {
    const byGroup = Object.fromEntries(GROUPS.map((g) => [g.id, 0]));
    for (const e of entries) byGroup[e.group] += 1;
    return { total: entries.length, ...byGroup };
}

/** The Components sidebar, as Starlight's config wants it: one group per catalogue group. */
export function catalogueSidebar(entries = readCatalogue()) {
    return GROUPS.map((g) => ({
        label: g.label,
        items: entries
            .filter((e) => e.group === g.id)
            .map((e) => ({ label: e.label, link: `/components/${e.slug}/` })),
    })).filter((g) => g.items.length > 0);
}
