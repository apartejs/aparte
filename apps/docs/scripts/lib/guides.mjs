/**
 * The groups of the Docs sidebar, read from the guides' own frontmatter.
 *
 * Every page in `src/content/docs/guides/` names its group, and takes its place in it from
 * Starlight's own `sidebar.order`:
 *
 *   guide:
 *     group: agents        # one of GUIDE_GROUPS
 *
 * One folder, several groups: Starlight's directory listing makes one group of a folder, and a
 * list written by hand misses the page added after it. So a guide with no group, or a group this
 * file does not know, stops the build.
 */
import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * Each group's sidebar links, in order: `{ start: [{ label, link }, …], … }`.
 * @returns {Record<string, { label: string, link: string }[]>}
 */
export function guideGroups(dir = GUIDES_DIR) {
    const pages = [];
    for (const file of readdirSync(dir)) {
        if (!/\.mdx?$/.test(file)) continue;
        const data = frontmatter(readFileSync(join(dir, file), 'utf8'));
        const group = data.guide?.group;
        if (!GUIDE_GROUPS.includes(group)) {
            throw new Error(`guides/${file}: guide.group must be one of ${GUIDE_GROUPS.join(', ')}, got ${JSON.stringify(group)}`);
        }
        const slug = file.replace(/\.mdx?$/, '');
        pages.push({
            group,
            slug,
            order: Number.isFinite(data.sidebar?.order) ? data.sidebar.order : 999,
            label: String(data.sidebar?.label ?? data.title ?? slug),
        });
    }
    pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    return Object.fromEntries(
        GUIDE_GROUPS.map((g) => [g, pages.filter((p) => p.group === g).map((p) => ({ label: p.label, link: `/guides/${p.slug}/` }))]),
    );
}
