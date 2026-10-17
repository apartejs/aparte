#!/usr/bin/env node
/**
 * Point every internal link at a page's current address.
 *
 * When the catalogue claims a component, its old page becomes a redirect (src/data/redirects.mjs).
 * The outside world keeps working through the redirect; the site's own links should not lean on
 * it — a link with an anchor into a redirect page cannot resolve. This rewrites, in the site's
 * sources, every old address the redirect table knows to its new one, keeping the anchor.
 *
 * Run it after a catalogue page lands: `node apps/docs/scripts/rewrite-moved-links.mjs`. It
 * prints what it changed; an anchor that does not exist on the new page is check-doc-links'
 * to catch, since only the built page knows its headings.
 *
 * Generated pages are not touched: their generator is the source, and it is rewritten too.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REDIRECTS } from './lib/redirects.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(here, '..');
const ROOTS = ['src/content/docs', 'src/data', 'src/components', 'src/pages', 'src/layouts', 'scripts'].map((d) => join(DOCS, d));
const EXT = /\.(mdx?|ts|astro|mjs)$/;
const GENERATED = /Generated (from|by) [^\n]*apps\/docs\/scripts\//;

function* files(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) yield* files(path);
        else if (EXT.test(name)) yield path;
    }
}

const moves = Object.entries(REDIRECTS).sort(([a], [b]) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let changed = 0;
for (const root of ROOTS) {
    for (const file of files(root)) {
        if (file === fileURLToPath(import.meta.url) || /redirects\.mjs$|legacy-urls/.test(file)) continue;
        const before = readFileSync(file, 'utf8');
        if (GENERATED.test(before) && file.includes(join('src', 'content'))) continue;
        let after = before;
        for (const [from, to] of moves) {
            // A link target: after ( " ' ` or whitespace, before an anchor, a closing mark or a space.
            after = after.replace(new RegExp(`(?<=[("'\`\\s])${escape(from)}(?=[#)"'\`\\s])`, 'g'), to);
        }
        if (after !== before) {
            writeFileSync(file, after);
            changed++;
            console.log(`[rewrite-moved-links] ${relative(DOCS, file)}`);
        }
    }
}
console.log(`[rewrite-moved-links] ${changed} file(s) rewritten, ${moves.length} known move(s).`);
