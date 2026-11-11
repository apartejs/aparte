/**
 * When each page's source last changed, for the sitemap's `<lastmod>`: a crawler that reads
 * the sitemap learns which pages to fetch again, instead of guessing from nothing.
 *
 * Why a committed file and not `git log` at build time: the site is built by Coolify from a
 * `--depth=1` clone, so the build sees one commit and every page would get that commit's
 * date, which is worse than no date. So the dates live in `src/data/lastmod.json`, written
 * here from the history and kept current by the pre-commit hook.
 *
 *   node apps/docs/scripts/gen-lastmod.mjs            every page, from `git log`
 *   node apps/docs/scripts/gen-lastmod.mjs --staged   the hook: today for each staged page, then `git add`
 *
 * A page is a tracked `src/content/docs/**.md(x)` or a `src/pages/**.astro` without a
 * `[param]`. A generated page (untracked) has no date: no `<lastmod>` beats a wrong one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(docs, '..', '..');
const out = join(docs, 'src', 'data', 'lastmod.json');
const CONTENT = 'apps/docs/src/content/docs/';
const PAGES = 'apps/docs/src/pages/';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** The URL path a source file is served at, or null when it is not one page. */
function pathOf(file) {
    let rest;
    if (file.startsWith(CONTENT) && /\.mdx?$/.test(file)) rest = file.slice(CONTENT.length).replace(/\.mdx?$/, '');
    else if (file.startsWith(PAGES) && file.endsWith('.astro') && !file.includes('[')) rest = file.slice(PAGES.length).replace(/\.astro$/, '');
    else return null;
    rest = rest.replace(/(^|\/)index$/, '');
    return rest ? `/${rest.toLowerCase()}/` : '/';
}

const today = () => new Date().toISOString().slice(0, 10);
const sorted = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
const write = (map) => writeFileSync(out, `${JSON.stringify(sorted(map), null, 2)}\n`);

if (process.argv.includes('--staged')) {
    const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
    const paths = staged.map(pathOf).filter(Boolean);
    if (paths.length) {
        const map = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
        for (const path of paths) map[path] = today();
        write(map);
        git('add', relative(root, out).replaceAll('\\', '/'));
    }
} else {
    // One pass over the history, newest first: the first date seen for a file is its last change.
    const tracked = new Set(git('ls-files', CONTENT, PAGES).split('\n').filter(Boolean));
    const map = {};
    let date = '';
    for (const line of git('log', '--format=%x00%cs', '--name-only', '--', CONTENT, PAGES).split('\n')) {
        if (line.startsWith('\0')) date = line.slice(1);
        else if (line && tracked.has(line)) {
            const path = pathOf(line);
            if (path && !(path in map)) map[path] = date;
        }
    }
    write(map);
    console.log(`[gen-lastmod] ${Object.keys(map).length} pages dated in ${relative(root, out)}`);
}
