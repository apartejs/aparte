#!/usr/bin/env node
/**
 * The event map has to agree with the events.
 *
 * `types/event-map.ts` is what makes `element.addEventListener('aparte-x', e =>
 * e.detail)` typed. Its own docstring promises a consumer never writes
 * `(e as CustomEvent).detail` — and an exhaustive sweep found the promise broken in
 * both directions at once:
 *
 *   • **17 entries where there should have been 37.** Fourteen of the twenty missing
 *     had no declared detail type at all; six had a PUBLIC one and still forced a
 *     cast at every listener, because the map — not the dispatch site — is what
 *     types `addEventListener`. `guides/troubleshooting.md` printed that cast in a
 *     ```ts block.
 *   • **Seven contracts for events that do not exist.** `aparte-artifact-open` sat
 *     in the map with a detail type whose JSDoc asserted it is "dispatched by the
 *     artifact pill when a user clicks it"; the name appeared three times in the
 *     whole repo, all three its own declaration. Six more types documented events
 *     that were never dispatched or listened for anywhere.
 *
 * Both are mechanical, so both are checked here rather than left to the next audit:
 *
 *   1. An event dispatched WITH A DETAIL must have a map entry. A consumer can read
 *      `e.detail`, so something has to type it.
 *   2. A map entry must correspond to an event the repo actually uses. A documented
 *      contract for a phantom is worse than no documentation.
 *
 * Events dispatched with no detail at all stay out of the map on purpose — an entry
 * would type `e.detail` as `null` and gain nothing — so they are listed as exempt
 * rather than silently ignored.
 *
 * A SEEN floor pins the counts: zero violations and a collapsed count is the
 * signature of a broken matcher, which is how two other guards in this repo were
 * found to be decorative.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAP_FILE = 'packages/core/src/types/event-map.ts';
const PKG_ROOTS = ['packages'];
/**
 * Guards against a matcher that stops matching. Measured at 44; raise it when the
 * surface grows, never lower it silently.
 */
// 45 → 39 when the artifact left core (D7): `aparte-artifact-start/-delta/-ready/
// -redownload` and `aparte-file-gen-ready/-error` went with it, so the floor moves
// down by exactly those six — a measured count, not a loosened one.
// 39 → 42 when the conversation row grew its menu: `aparte-rename-conversation`,
// `aparte-pin-conversation`, `aparte-unpin-conversation`. 42 → 43 with
// `aparte-link-click` (issue #38). 43 → 44 with `aparte-scroll-rail-jump`, 45 with
// `aparte-sidebar-toggle`. 45 → 44 when compaction became a plugin (0.16.0): `aparte-reset`
// lost its one dispatch site in core — the client's fallback broadcast in `compact()` —
// and is now listened for only, so this scan no longer sees it. The event is not gone
// (the viewport still honours it); the evidence this guard counts is a dispatch.
// 44 → 45 with 'aparte-split-resize'.
const SEEN_FLOOR = 45;

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === '.svelte-kit') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (/\.(ts|tsx|svelte|vue)$/.test(p) && !/\.(test|spec)\./.test(p) && !p.includes('__tests__')) yield p;
    }
}

const files = PKG_ROOTS.flatMap((r) => [...walk(r)]).map((p) => p.split('\\').join('/'));

// ── What the map declares ───────────────────────────────────────────────────
const mapSrc = readFileSync(MAP_FILE, 'utf8');
const mapped = new Set([...mapSrc.matchAll(/^\s*'(aparte-[a-z0-9-]+)':\s*CustomEvent</gm)].map((m) => m[1]));
if (mapped.size === 0) {
    console.error(`[event-map] FAIL: parsed zero entries out of ${MAP_FILE} — the format this guard reads has changed.`);
    process.exit(1);
}

/**
 * Walk `new CustomEvent…(` / `dispatchLifecycleEvent(` to its matching paren so a
 * nested object or template literal cannot end the match early, and report whether
 * the call carries a detail. A regex cannot do this: several dispatch sites nest
 * three levels of braces inside `detail:`.
 */
function dispatchesIn(text) {
    const out = [];
    const CALL = /(?:new CustomEvent(?:<[^>(]*>)?|dispatchLifecycleEvent|_dispatchLifecycleEvent)\s*\(/g;
    for (const m of text.matchAll(CALL)) {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < text.length && depth > 0; i++) {
            const c = text[i];
            if (c === '(') depth++;
            else if (c === ')') depth--;
        }
        const body = text.slice(m.index + m[0].length, i - 1);
        const name = /['"](aparte-[a-z0-9-]+)['"]/.exec(body);
        if (!name) continue;
        // The lifecycle helper always stamps `targetId`, so it always has a detail.
        const viaHelper = m[0].includes('dispatchLifecycleEvent');
        // `detail:` AND `detail` as ES object shorthand. Matching only the colon
        // exempted the TEN most important events in the library — every dispatch
        // that builds its detail as a local first, which is the idiomatic way to
        // write one. Deleting a real map entry then made the event MIGRATE into the
        // guard's own "correctly unmapped" line, so the count stayed plausible.
        const hasDetail = viaHelper || /\bdetail\s*[:,}]/.test(body);
        out.push({ name: name[1], hasDetail });
    }
    return out;
}

/** name → { withDetail, bare, files } */
const dispatched = new Map();
/** Every `aparte-*` literal seen outside the types layer — evidence an event is real. */
const referenced = new Set();

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const isTypeLayer = file.includes('/src/types/');
    for (const { name, hasDetail } of dispatchesIn(text)) {
        if (!dispatched.has(name)) dispatched.set(name, { withDetail: false, bare: false, files: new Set() });
        const e = dispatched.get(name);
        if (hasDetail) e.withDetail = true; else e.bare = true;
        e.files.add(file);
    }
    if (!isTypeLayer) {
        for (const m of text.matchAll(/['"`](aparte-[a-z0-9-]+)['"`]/g)) referenced.add(m[1]);
        // `@fires {CustomEvent<X>} aparte-y` — a component declaring its own contract.
        for (const m of text.matchAll(/@fires\s+\{[^}]*\}\s+(aparte-[a-z0-9-]+)/g)) referenced.add(m[1]);
    }
}

const problems = [];
const exemptNoDetail = [];

// 1. Dispatched with a detail → must be mapped.
for (const [name, info] of [...dispatched].sort()) {
    if (info.withDetail && !mapped.has(name)) {
        problems.push(
            `"${name}" is dispatched with a \`detail\` and has no map entry, so every listener\n`
            + `      must cast. Dispatched from: ${[...info.files].sort().join(', ')}`,
        );
    }
    if (!info.withDetail && info.bare && !mapped.has(name)) exemptNoDetail.push(name);
}

// 2. Mapped → the event must exist somewhere outside the types layer.
for (const name of [...mapped].sort()) {
    if (!referenced.has(name) && !dispatched.has(name)) {
        problems.push(
            `"${name}" has a map entry and appears NOWHERE outside the type layer — no\n`
            + `      dispatch, no listener, no @fires. A documented contract for an event that\n`
            + `      does not exist is worse than no documentation. Delete the entry, or point\n`
            + `      its detail type at the event that really carries that shape.`,
        );
    }
}

const seen = new Set([...dispatched.keys(), ...mapped]).size;
if (seen < SEEN_FLOOR) {
    problems.push(
        `only ${seen} event names seen, floor is ${SEEN_FLOOR}. Zero violations on a collapsed\n`
        + `      count is what a broken matcher looks like, not a clean repo.`,
    );
}

if (problems.length) {
    console.error(`\n[event-map] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(`Edit ${MAP_FILE}. An event with a detail belongs in the map; one without does not.\n`);
    process.exit(1);
}

console.log(
    `[event-map] OK: ${mapped.size} mapped events, ${seen} seen; `
    + `${exemptNoDetail.length} dispatched with no detail and correctly unmapped `
    + `(${exemptNoDetail.sort().join(', ')}).`,
);
