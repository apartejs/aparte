/**
 * Every internal link and anchor on the BUILT docs site resolves.
 *
 * Built HTML, not markdown source, and that is the point: four of the site's
 * reference pages are GENERATED and git-ignored, so a checker reading the sources
 * cannot see them — it would either skip the generated pages or report every link
 * into them as broken. The build is also where a rename actually lands.
 *
 * Run after `pnpm --filter @aparte-workspace/docs build` (CI does exactly that).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'apps/docs/dist';

if (!existsSync(DIST)) {
    console.error(`\n[doc-links] ${DIST} not found — build the docs first:\n  pnpm --filter @aparte-workspace/docs build\n`);
    process.exit(1);
}

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (path.endsWith('.html')) yield path;
    }
}

const pages = [...walk(DIST)];
/** url path (with trailing slash) -> the set of ids on that page */
const idsByRoute = new Map();

const routeOf = (file) => {
    const rel = relative(DIST, file).split(sep).join('/');
    if (rel === 'index.html') return '/';
    if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}/`;
    return `/${rel.replace(/\.html$/, '')}`;
};

for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
    for (const m of html.matchAll(/\sname="([^"]+)"/g)) ids.add(m[1]);
    idsByRoute.set(routeOf(file), ids);
}

const broken = [];
let checked = 0;

for (const file of pages) {
    const from = routeOf(file);
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
        const href = m[1];
        // External, in-page-only, and non-navigational hrefs are out of scope.
        if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
        if (href.startsWith('#')) {
            checked++;
            if (!idsByRoute.get(from)?.has(decodeURIComponent(href.slice(1)))) {
                broken.push(`${from} → ${href} (no such anchor on this page)`);
            }
            continue;
        }
        if (!href.startsWith('/')) continue; // relative asset links: not routes
        checked++;
        const [rawPath, hash] = href.split('#');
        const path = rawPath.endsWith('/') || /\.[a-z0-9]+$/i.test(rawPath) ? rawPath : `${rawPath}/`;
        if (!idsByRoute.has(path)) {
            // Could be a static asset (og image, txt, xml) rather than a page.
            if (existsSync(join(DIST, path.replace(/^\//, '')))) continue;
            broken.push(`${from} → ${href} (no such page)`);
            continue;
        }
        if (hash && !idsByRoute.get(path).has(decodeURIComponent(hash))) {
            broken.push(`${from} → ${href} (page exists, anchor does not)`);
        }
    }
}

if (broken.length) {
    console.error(`\n[doc-links] ${broken.length} broken internal link(s) of ${checked} checked:\n`);
    for (const b of [...new Set(broken)].sort()) console.error(`  ${b}`);
    console.error('');
    process.exit(1);
}

console.log(`[doc-links] OK: ${checked} internal links and anchors across ${pages.length} built pages all resolve.`);
