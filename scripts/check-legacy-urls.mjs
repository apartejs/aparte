/**
 * Every URL the site ever published still leads somewhere, anchors included.
 *
 * The site is being reorganised, and pages move. Outside links cannot be edited: 22 npm
 * `homepage` fields, README links and JSDoc shipped inside published `.d.ts` files point at
 * the old addresses, some with an `#anchor`. `apps/docs/src/data/legacy-urls.json` records
 * every URL the site published (its sitemap before the move) and the anchors those artifacts
 * use; this check reads the BUILT site and fails when one of them leads nowhere:
 *
 *   - a legacy URL is either still a page, or a moved page whose destination is a page
 *     (no chains: a redirect to a redirect is a bug, not a route);
 *   - a published anchor exists on the page its URL finally lands on.
 *
 * Run after `pnpm --filter @aparte-workspace/docs build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REDIRECTS } from '../apps/docs/scripts/lib/redirects.mjs';

const DIST = 'apps/docs/dist';
const LEGACY = 'apps/docs/src/data/legacy-urls.json';

if (!existsSync(DIST)) {
    console.error(`\n[legacy-urls] ${DIST} not found — build the docs first:\n  pnpm --filter @aparte-workspace/docs build\n`);
    process.exit(1);
}

const { urls, anchors } = JSON.parse(readFileSync(LEGACY, 'utf8'));

// A corpus that silently shrinks is the failure worth catching.
const FLOOR = 150;
if (urls.length < FLOOR) {
    console.error(`[legacy-urls] only ${urls.length} legacy URLs recorded (floor ${FLOOR}) — the list was truncated.`);
    process.exit(1);
}

const fileOf = (route) => join(DIST, route.replace(/^\//, ''), 'index.html');
const html = (route) => (existsSync(fileOf(route)) ? readFileSync(fileOf(route), 'utf8') : null);
const isRedirectPage = (text) => /<meta\s+http-equiv="refresh"/i.test(text);

/** The page a legacy route finally shows, or a reason it shows none. */
function land(route) {
    const text = html(route);
    if (text && !isRedirectPage(text)) return { route };
    const to = REDIRECTS[route];
    if (!to) return { error: text ? 'a redirect page with no entry in redirects.mjs' : 'no page and no redirect' };
    const target = html(to);
    if (!target) return { error: `redirects to ${to}, which is not built` };
    if (isRedirectPage(target)) return { error: `redirects to ${to}, which is itself a redirect` };
    return { route: to };
}

const problems = [];
for (const url of urls) {
    const result = land(url);
    if (result.error) problems.push(`${url} — ${result.error}`);
}
for (const anchor of anchors) {
    const [route, id] = anchor.split('#');
    const result = land(route);
    if (result.error) {
        problems.push(`${anchor} — ${result.error}`);
        continue;
    }
    const ids = new Set([...html(result.route).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    if (!ids.has(id)) problems.push(`${anchor} — lands on ${result.route}, which has no #${id}`);
}
for (const from of Object.keys(REDIRECTS)) {
    const text = html(from);
    if (text && !isRedirectPage(text)) problems.push(`${from} is both a page and a redirect source`);
}

if (problems.length) {
    console.error(`\n[legacy-urls] ${problems.length} published address(es) lead nowhere:\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(
        '\nAn old URL is out in the world (npm, READMEs, shipped JSDoc, search results) and cannot be\n'
        + 'edited there. Add its new address to apps/docs/src/data/redirects.mjs, or keep the anchor\n'
        + 'on the page it lands on.\n',
    );
    process.exit(1);
}

const moved = urls.filter((u) => REDIRECTS[u]).length;
console.log(
    `[legacy-urls] OK: ${urls.length} published URLs all lead to a page (${moved} through a redirect), `
        + `and ${anchors.length} published anchors resolve.`,
);
