/**
 * Every CDN URL in the docs pins the version core ships.
 *
 * The getting-started page teaches the rule that matters on jsDelivr: pin the SAME exact
 * version on every URL, because a provider's bundle imports core at the exact version the
 * CDN resolved for it and a different string is a second copy of core. A page that pins a
 * version by hand goes stale on the next `pnpm version-packages` — silently, teaching the
 * trap it warns about. The landing already reads the version at build time so its chip
 * cannot go stale; this makes the docs' URLs answer to the same number.
 *
 * Floor: at least one URL, so a page rewritten without the CDN section fails loudly
 * rather than passing on an empty corpus (count, don't trust).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const version = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const ROOT = 'apps/docs/src/content/docs';
const files = [];
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.mdx?$/.test(name)) files.push(p);
    }
};
walk(ROOT);

const URL = /cdn\.jsdelivr\.net\/npm\/@aparte\/[a-z-]+@([^/\s"'`]+)/g;
const hits = [];
for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(URL)) hits.push({ file, pinned: m[1] });
}

const wrong = hits.filter((h) => h.pinned !== version);
if (hits.length === 0) {
    console.error(`[cdn-version] no CDN URL found under ${ROOT} — the getting-started page used to carry four. A corpus that shrinks to zero is the failure this guard exists for.`);
    process.exit(1);
}
if (wrong.length) {
    console.error(`[cdn-version] ${wrong.length} CDN URL(s) pin a version other than core's ${version}:`);
    for (const w of wrong) console.error(`  ${w.file}: @${w.pinned}`);
    console.error('  Every @aparte/* URL on a page must pin the same exact version, and that version is the one core ships — update them together.');
    process.exit(1);
}
console.log(`[cdn-version] OK: ${hits.length} CDN URL(s) pin @${version}, the version core ships.`);
