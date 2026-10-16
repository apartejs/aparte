/**
 * The groups of the Docs sidebar, read from the guides' own frontmatter.
 *
 * Every page in `src/content/docs/guides/` names its group, and takes its place in it from
 * Starlight's own `sidebar.order`:
 *
 *   guide:
 *     group: agents        # one of GUIDE_GROUPS
 *
 * A folder of guides (`guides/customization/`) is one entry with pages under it: its
 * `index.mdx` names the group and the place, and the other pages of the folder sort among
 * themselves by their own order.
 *
 * One folder, several groups: Starlight's directory listing makes one group of a folder, and a
 * list written by hand misses the page added after it. So a guide with no group, or a group this
 * file does not know, stops the build.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));

export const GUIDES_DIR = resolve(here, '../../src/content/docs/guides');

/** The groups a guide can name, in the order the sidebar shows them. */
export const GUIDE_GROUPS = ['start', 'look', 'conversations', 'agents', 'models', 'help'];

function frontmatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    return match ? (parse(match[1]) ?? {}) : {};
}

const order = (data) => (Number.isFinite(data.sidebar?.order) ? data.sidebar.order : 999);
const label = (data, slug) => String(data.sidebar?.label ?? data.title ?? slug);
const bySlotThenName = (a, b) => a.order - b.order || a.slug.localeCompare(b.slug);

/** The pages of a folder, its index first as the overview. */
function folderItems(dir, folder) {
    const pages = [];
    for (const file of readdirSync(join(dir, folder))) {
        if (!/\.mdx?$/.test(file) || /^index\.mdx?$/.test(file)) continue;
        const data = frontmatter(readFileSync(join(dir, folder, file), 'utf8'));
        const slug = file.replace(/\.mdx?$/, '');
        pages.push({ slug, order: order(data), label: label(data, slug) });
    }
    pages.sort(bySlotThenName);
    return [
        { label: 'Overview', link: `/guides/${folder}/` },
        ...pages.map((p) => ({ label: p.label, link: `/guides/${folder}/${p.slug}/` })),
    ];
}

/**
 * Each group's sidebar entries, in order: `{ start: [{ label, link } | { label, items }, …], … }`.
 * @returns {Record<string, ({ label: string, link: string } | { label: string, items: { label: string, link: string }[] })[]>}
 */
export function guideGroups(dir = GUIDES_DIR) {
    const pages = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        let file;
        let slug;
        if (entry.isDirectory()) {
            file = ['index.mdx', 'index.md'].map((name) => join(dir, entry.name, name)).find((path) => existsSync(path));
            if (!file) throw new Error(`guides/${entry.name}/: a folder of guides needs an index.mdx naming its group`);
            slug = entry.name;
        } else if (/\.mdx?$/.test(entry.name)) {
            file = join(dir, entry.name);
            slug = entry.name.replace(/\.mdx?$/, '');
        } else continue;
        const data = frontmatter(readFileSync(file, 'utf8'));
        const group = data.guide?.group;
        if (!GUIDE_GROUPS.includes(group)) {
            throw new Error(`guides/${entry.isDirectory() ? `${entry.name}/index.mdx` : entry.name}: guide.group must be one of ${GUIDE_GROUPS.join(', ')}, got ${JSON.stringify(group)}`);
        }
        pages.push({
            group,
            slug,
            order: order(data),
            label: label(data, slug),
            items: entry.isDirectory() ? folderItems(dir, entry.name) : null,
        });
    }
    pages.sort(bySlotThenName);
    return Object.fromEntries(
        GUIDE_GROUPS.map((g) => [
            g,
            pages
                .filter((p) => p.group === g)
                .map((p) => (p.items ? { label: p.label, items: p.items } : { label: p.label, link: `/guides/${p.slug}/` })),
        ]),
    );
}
