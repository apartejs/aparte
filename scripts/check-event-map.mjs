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
 *   3. An event core dispatches on an ELEMENT must be in `APARTE_DEFAULT_UI_EVENTS`.
 *      That list is what `<AparteUi>` listens for in all four wrappers when the
 *      consumer passes none, so a name missing from it is an event a wrapper consumer
 *      cannot hear — and its docblock has now claimed completeness twice while being
 *      wrong: 7 of 25 the first time, 25 of 35 the second. `window`-dispatched events
 *      are excluded, because an element listener genuinely cannot receive them.
 *   4. An event dispatched inside an element's own source must be in that element's
 *      CEM `events[]`. The manifest is what ships to a consumer's editor and what the
 *      docs generator renders, so an `@fires` nobody wrote is an event absent from the
 *      element's page: `<aparte-context>`'s `aparte-compact` was dispatched, typed,
 *      documented in prose — and in no manifest. Block comments are stripped before the
 *      scan so an `@example` fence cannot count as a dispatch.
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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
        // WHERE it goes, for assertion 3. `window.dispatchEvent(new CustomEvent(…))` is a
        // page-wide broadcast no element listener can hear; everything else — `this`, a
        // resolved child, the lifecycle helper (whose two callers hand it the host
        // element) — bubbles past an `<AparteUi>` wrapper node.
        const before = text.slice(Math.max(0, m.index - 160), m.index);
        const onWindow = !viaHelper && /window\s*\.dispatchEvent\s*\(\s*$/.test(before);
        // `detail:` AND `detail` as ES object shorthand. Matching only the colon
        // exempted the TEN most important events in the library — every dispatch
        // that builds its detail as a local first, which is the idiomatic way to
        // write one. Deleting a real map entry then made the event MIGRATE into the
        // guard's own "correctly unmapped" line, so the count stayed plausible.
        const hasDetail = viaHelper || /\bdetail\s*[:,}]/.test(body);
        out.push({ name: name[1], hasDetail, onWindow });
    }
    return out;
}

/** name → { withDetail, bare, files } */
const dispatched = new Map();
/** Every `aparte-*` literal seen outside the types layer — evidence an event is real. */
const referenced = new Set();

/** Core's own element dispatches — the corpus of assertion 3. name -> the files. */
const coreOnElement = new Map();

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const isTypeLayer = file.includes('/src/types/');
    const isCore = file.startsWith('packages/core/src/');
    for (const { name, hasDetail, onWindow } of dispatchesIn(text)) {
        if (!dispatched.has(name)) dispatched.set(name, { withDetail: false, bare: false, files: new Set() });
        const e = dispatched.get(name);
        if (hasDetail) e.withDetail = true; else e.bare = true;
        e.files.add(file);
        if (isCore && !onWindow) {
            if (!coreOnElement.has(name)) coreOnElement.set(name, new Set());
            coreOnElement.get(name).add(file);
        }
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

// ── 3. Dispatched by core on an element → must be in APARTE_DEFAULT_UI_EVENTS ──
//
// The list is read from SOURCE rather than from the built barrel: the mistake it
// guards against is made in the source, and a guard that needs a build to notice a
// one-line omission is a guard a contributor never runs.
const UI_EVENTS_FILE = 'packages/core/src/interop/element-props.ts';
const uiEventsSrc = readFileSync(UI_EVENTS_FILE, 'utf8');
const uiEventsBody = uiEventsSrc.split('APARTE_DEFAULT_UI_EVENTS = [')[1]?.split('];')[0] ?? '';
const uiEvents = new Set([...uiEventsBody.matchAll(/'(aparte-[a-z0-9-]+)'/g)].map((m) => m[1]));

/**
 * Element-dispatched events deliberately absent from the proxy list.
 *
 * Empty today, and that is the honest state: every one of core's 37 element dispatches
 * is forwarded. It exists so that leaving one out is a DECISION with a reason beside it
 * rather than an omission — the failure mode this whole guard was written for.
 */
const UI_EVENTS_EXEMPT = new Map([]);

if (uiEvents.size === 0) {
    problems.push(
        `parsed zero names out of ${UI_EVENTS_FILE} — the shape this guard reads has changed,\n`
        + '      and assertion 3 is now vacuous.',
    );
}

const UI_EVENTS_FLOOR = 30;
if (coreOnElement.size < UI_EVENTS_FLOOR) {
    problems.push(
        `only ${coreOnElement.size} element dispatch(es) found in core, floor is ${UI_EVENTS_FLOOR}.\n`
        + '      A collapsed corpus is what a broken matcher looks like.',
    );
}

for (const [name, where] of [...coreOnElement].sort()) {
    if (uiEvents.has(name) || UI_EVENTS_EXEMPT.has(name)) continue;
    problems.push(
        `"${name}" is dispatched by core on an ELEMENT and is not in APARTE_DEFAULT_UI_EVENTS,\n`
        + `      so no <AparteUi> forwards it and a wrapper consumer cannot hear it at all.\n`
        + `      Dispatched from: ${[...where].sort().join(', ')}\n`
        + `      Add it to ${UI_EVENTS_FILE}, or add it to UI_EVENTS_EXEMPT there with a reason.`,
    );
}

// ── 4. Dispatched in an element's source → must be in that element's CEM events[] ──
//
// The manifest is what `package.json`'s `customElements` field points at: a consumer's
// editor reads it, and `apps/docs` generates every element page from it. So an event
// with no `@fires` is an event that exists, is typed, may even be described in prose —
// and appears on no page and in no autocomplete.
const CEM_FILE = 'packages/core/dist/custom-elements.json';
const DECLARATION_FLOOR = 22;
let cemDeclarations = 0;
// Counted apart from the declarations on purpose. A declaration is read out of the JSON;
// a SOURCE is a file this rule actually opened. If `mod.path`'s shape ever changes — an
// absolute path, a `dist/`-relative one, a leading `./` — every `existsSync` below misses,
// every declaration is skipped in silence, and a floor on `cemDeclarations` alone still
// passes over zero files read. That is the shape of a guard that has gone vacuous.
let cemSourcesRead = 0;
if (!existsSync(CEM_FILE)) {
    problems.push(
        `${CEM_FILE} is missing, so assertion 4 could not run. Build the packages first\n`
        + '      (`pnpm build`): the manifest is generated by `cem analyze` at build time.',
    );
} else {
    const cem = JSON.parse(readFileSync(CEM_FILE, 'utf8'));
    for (const mod of cem.modules ?? []) {
        for (const decl of mod.declarations ?? []) {
            if (!decl.customElement || !decl.tagName) continue;
            cemDeclarations++;
            const src = join('packages/core', mod.path);
            if (!existsSync(src)) continue;
            cemSourcesRead++;
            // Block comments stripped FIRST: an `@example` fence in a docblock is full of
            // dispatch-shaped code, and counting it would make the guard demand an
            // `@fires` for an event the element never sends.
            const text = readFileSync(src, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
            const declared = new Set((decl.events ?? []).map((e) => e.name));
            for (const { name } of dispatchesIn(text)) {
                if (declared.has(name)) continue;
                problems.push(
                    `<${decl.tagName}> dispatches "${name}" and does not declare it: no\n`
                    + `      \`@fires {CustomEvent<…>} ${name}\` in ${src}, so the event is absent from the\n`
                    + '      shipped manifest, and from the generated docs page for that element.',
                );
            }
        }
    }
    if (cemDeclarations < DECLARATION_FLOOR || cemSourcesRead < DECLARATION_FLOOR) {
        const shortfall = cemDeclarations < DECLARATION_FLOOR
            ? `only ${cemDeclarations} custom-element declaration(s) read out of ${CEM_FILE}`
            : `${cemDeclarations} declaration(s) read out of ${CEM_FILE}, but only ${cemSourcesRead} of`
                + ' their sources opened';
        problems.push(
            `${shortfall}, floor is ${DECLARATION_FLOOR}. Either the manifest is stale\n`
            + '      (`pnpm build`) or its shape changed — a `path` this rule cannot resolve skips\n'
            + '      every declaration and leaves the assertion checking nothing.',
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
    console.error(
        `Four rules, four places. A detail-carrying dispatch belongs in ${MAP_FILE}\n`
        + `(one without a detail does not); an element dispatch belongs in ${UI_EVENTS_FILE};\n`
        + 'an element\'s own dispatch needs an @fires on the element itself, which is what puts\n'
        + `it in ${CEM_FILE}.\n`,
    );
    process.exit(1);
}

console.log(
    `[event-map] OK: ${mapped.size} mapped events, ${seen} seen; `
    + `${exemptNoDetail.length} dispatched with no detail and correctly unmapped `
    + `(${exemptNoDetail.sort().join(', ')}); `
    + `${coreOnElement.size} element dispatches in core, all forwarded by <AparteUi>; `
    + `${cemSourcesRead} element declarations read from source, each declaring every event it sends.`,
);
