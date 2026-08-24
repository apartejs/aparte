/*
 * Generates /llms.txt and /llms-full.txt from the docs themselves.
 *
 * The audience is not hypothetical: this library is consumed through coding agents, and
 * the 0.7.0 release exists because an agent could not find a capability that was there and
 * wrote a workaround instead. `llms.txt` (llmstxt.org) is the index that stops that: one
 * file, the whole map, in the order a reader should take it.
 *
 * Written here rather than with `starlight-llms-txt`, which is the obvious choice and was
 * tried first: version 0.11 depends on `@astrojs/mdx@7`, which imports a symbol our Astro
 * 5.18 no longer exports, so the build died. Rather than move Astro for a text file, this
 * follows the four generators already in this folder — no dependency, and nothing to break
 * on the next Astro bump.
 *
 * Runs before `astro dev` / `astro build` (see package.json).
 *
 * Output (git-ignored, always regenerated):
 *   public/llms.txt       — the map: every page, one line each
 *   public/llms-full.txt  — every page's full markdown, concatenated
 */
import { readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { writeIfChanged } from './write-if-changed.mjs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(here, '../src/content/docs');
const OUT_DIR = resolve(here, '../public');
const SITE = 'https://apartejs.dev';

/** Sidebar order, so the map reads in the order a human is offered the pages. */
const SECTIONS = [
    { dir: '', label: 'Start here' },
    { dir: 'guides', label: 'Guides' },
    { dir: 'frameworks', label: 'Framework wrappers' },
    { dir: 'providers', label: 'Providers (LLM adapters)' },
    { dir: 'plugins', label: 'Plugins' },
    { dir: 'reference', label: 'Reference' },
];

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : path.endsWith('.md') ? [path] : [];
    });
}

/** Split a page into its frontmatter fields and its body. */
function parse(path) {
    const raw = readFileSync(path, 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const front = match ? match[1] : '';
    const body = match ? match[2] : raw;
    const field = (name) => {
        const m = front.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const rel = relative(DOCS, path).split(sep).join('/').replace(/\.md$/, '');
    const slug = rel.replace(/(^|\/)index$/, '');
    const order = Number(front.match(/^\s*order:\s*(\d+)\s*$/m)?.[1] ?? 999);
    return {
        url: `${SITE}/${slug}${slug ? '/' : ''}`,
        title: field('title'),
        description: field('description'),
        section: rel.includes('/') ? rel.split('/')[0] : '',
        order,
        body: body.trim(),
    };
}

const pages = walk(DOCS).map(parse);
const missing = pages.filter((p) => !p.title);
if (missing.length) throw new Error(`page(s) with no frontmatter title: ${missing.length}`);

const SUMMARY =
    'aparté is a framework-agnostic AI-chat library: vanilla web components with zero '
    + 'runtime dependencies (@aparte/core), plus thin React, Vue, Svelte and Angular '
    + 'wrappers. It is backend-agnostic — a transport sends requests either browser-direct '
    + '(bring your own key, or a local model) or to your own endpoint, where the key stays '
    + 'server-side. Providers and plugins are opt-in packages.';

// ── llms.txt: the map ────────────────────────────────────────────────────────
let map = `# aparté\n\n> ${SUMMARY}\n`;
for (const { dir, label } of SECTIONS) {
    const inSection = pages
        .filter((p) => p.section === dir)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    if (!inSection.length) continue;
    map += `\n## ${label}\n\n`;
    for (const p of inSection) {
        map += `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ''}\n`;
    }
}
// Anything in a directory the list above does not name, rather than dropping it silently.
const named = new Set(SECTIONS.map((s) => s.dir));
const orphans = pages.filter((p) => !named.has(p.section));
if (orphans.length) {
    map += `\n## Other\n\n`;
    for (const p of orphans) map += `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ''}\n`;
}

// ── llms-full.txt: everything, in the same order ─────────────────────────────
const ordered = SECTIONS.flatMap(({ dir }) =>
    pages.filter((p) => p.section === dir).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
).concat(orphans);

let full = `# aparté — full documentation\n\n> ${SUMMARY}\n\n`
    + `Generated from the documentation source. Canonical HTML: ${SITE}\n`;
for (const p of ordered) {
    full += `\n\n---\n\n# ${p.title}\n\nSource: ${p.url}\n\n${p.body}\n`;
}

mkdirSync(OUT_DIR, { recursive: true });
const changed = [writeIfChanged(join(OUT_DIR, 'llms.txt'), map),
                writeIfChanged(join(OUT_DIR, 'llms-full.txt'), full)].filter(Boolean).length;
console.log(
    `[gen-llms-txt] ${changed} of 2 rewritten, ${pages.length} pages → llms.txt (${(map.length / 1024).toFixed(1)} kB), `
    + `llms-full.txt (${(full.length / 1024).toFixed(0)} kB)`,
);
