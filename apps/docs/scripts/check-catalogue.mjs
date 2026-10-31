/**
 * Every element, segment type and kit family has exactly one page in the catalogue.
 *
 * The generators used to guarantee it by construction: they wrote one page per element from
 * hand-kept maps (`GROUP`, `PARTS`), one per segment, one per kit family. The catalogue is now
 * written by hand and grouped by what a person sees, so a page CLAIMS what it documents in its
 * frontmatter (see lib/catalogue.mjs) and this check holds the two invariants the maps held:
 *
 *   - nothing is documented twice (a claim appears on one page only);
 *   - nothing is undocumented (every element, segment and family is claimed).
 *
 * The universe comes from the generators' API data (src/generated/api/*.json), which is read
 * from the manifests and the stylesheets — so a new element shows up here the day it ships.
 *
 * During the move, a thing still documented by its old generated page (components/<group>/,
 * segments/, kit/) counts as covered; once those pages are gone, only claims do.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENTS_DIR, countCatalogue, readCatalogue } from './lib/catalogue.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const API = resolve(here, '../src/generated/api');
const CONTENT = resolve(here, '../src/content/docs');

function load(name) {
    const file = join(API, name);
    if (!existsSync(file)) {
        console.error(`[check-catalogue] ${file} is missing — run the generators first (pnpm -C apps/docs gen).`);
        process.exit(1);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
}

const elements = load('elements.json').map((e) => e.tag);
const segments = load('segments.json').map((s) => s.kind);
const families = load('kit.json').map((k) => k.id);

// Floors: a universe that shrank this far is a generator that stopped reading its source.
const FLOORS = { elements: 20, segments: 5, families: 20 };
for (const [what, floor] of Object.entries(FLOORS)) {
    const n = { elements, segments, families }[what].length;
    if (n < floor) {
        console.error(`[check-catalogue] only ${n} ${what} in the API data (floor ${floor}).`);
        process.exit(1);
    }
}

const entries = readCatalogue();
const problems = [];

// 1. Claims name things that exist, and each thing is claimed once.
const owner = new Map();
const kinds = [
    ['elements', new Set(elements), (c) => c.elements],
    ['segments', new Set(segments), (c) => c.segments],
    ['classes', new Set(families), (c) => c.classes],
];
for (const e of entries) {
    for (const [kind, universe, pick] of kinds) {
        for (const id of pick(e.claims)) {
            if (!universe.has(id)) problems.push(`${e.slug}.mdx claims ${kind} "${id}", which does not exist.`);
            const key = `${kind}:${id}`;
            if (owner.has(key)) problems.push(`${kind} "${id}" is claimed by both ${owner.get(key)}.mdx and ${e.slug}.mdx.`);
            else owner.set(key, e.slug);
        }
    }
}

// 2. Everything is documented — by a claim, or (during the move) by its old generated page.
const legacyText = [];
const collect = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) collect(path);
        else if (entry.name.endsWith('.mdx')) legacyText.push(readFileSync(path, 'utf8'));
    }
};
for (const entry of existsSync(COMPONENTS_DIR) ? readdirSync(COMPONENTS_DIR, { withFileTypes: true }) : []) {
    if (entry.isDirectory()) collect(join(COMPONENTS_DIR, entry.name));
}
// A plugin's element is documented by the partial its plugin page imports.
const PARTIALS = resolve(here, '../src/generated/element-api');
const legacyElement = (tag) =>
    existsSync(join(PARTIALS, `${tag}.mdx`)) || legacyText.some((t) => t.includes(`\`<${tag}>\``));
const legacySegment = (kind) => existsSync(join(CONTENT, 'segments', `${kind.replace(/_/g, '-')}.mdx`));
const legacyFamily = (id) => existsSync(join(CONTENT, 'kit', `${id}.mdx`));

let legacy = 0;
for (const [kind, ids, isLegacy] of [
    ['elements', elements, legacyElement],
    ['segments', segments, legacySegment],
    ['classes', families, legacyFamily],
]) {
    for (const id of ids) {
        if (owner.has(`${kind}:${id}`)) continue;
        if (isLegacy(id)) {
            legacy++;
            continue;
        }
        problems.push(`${kind} "${id}" has no page: claim it in a catalogue page's frontmatter (catalog.claims.${kind}).`);
    }
}

if (problems.length) {
    console.error(`[check-catalogue] ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
}

const n = countCatalogue(entries);
console.log(
    `[check-catalogue] OK: ${n.total} catalogue page(s) (chat ${n.chat}, cards ${n.cards}, layout ${n.layout}, kit ${n.kit}); ` +
        `${elements.length} elements, ${segments.length} segment types, ${families.length} kit families all documented` +
        (legacy ? ` (${legacy} still by their old generated page)` : '') +
        '.',
);
