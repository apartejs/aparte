#!/usr/bin/env node
/**
 * The frozen surface: measured on the tree, written down, and held to what was written.
 *
 * The beta is "a dist-tag and a promise" — a declared surface stops changing without a
 * notice release. `reference/stability` used to make that promise in hand-typed words:
 * "Twenty-four" elements, "Forty typed events", "eighty-six today" exports. A page that
 * counts its own subject in prose is wrong the first time the subject moves, and nothing
 * says so. Worse, a promise nothing enforces is a sentence, not a promise: the page could
 * list a name the barrel had already dropped.
 *
 * So the surface is computed here from the tree, written to
 * `apps/docs/src/data/frozen-surface.json` (checked in), rendered by the page from that
 * file, and compared against the tree on every gate run.
 *
 * ## What it reads, and where the guard that already owns each thing reads it
 *
 * A second way to read the same source is a second answer waiting to happen, so each
 * reader below is the one another script already uses, mirrored or imported:
 *
 *   • elements + attributes — the custom-elements manifests, the way `check-event-map`
 *     reads core's for its fourth assertion. Core's, plus the three plugins that ship an
 *     element of their own.
 *   • typed events — the `AparteEventMap` entries, the same regex `check-event-map` uses
 *     on the same file.
 *   • the detail-less names — the exclusion sentence in that file's own docblock, which
 *     is the only place the six are enumerated. `check-event-map` derives its list from a
 *     dispatch scan and finds five: `aparte-reset` is a command an app sends and core only
 *     listens for, so no dispatch site in this repo names it.
 *   • exports — every published package's BUILT JS barrel. TypeScript has erased the types
 *     by then, so what is left is exactly what a consumer can call. The package list is
 *     walked (`publishable`, mirrored from `check-published-readmes`) rather than kept by
 *     hand: a package absent from a hand-kept array is not exempt, it is unmeasured. The
 *     one exclusion is stated on the page itself and repeated at `NOT_FROZEN` below.
 *   • locale keys — `AparteLocale`, parsed the way `check-locale-keys` parses it.
 *   • tokens — the two passes of `apps/docs/scripts/gen-css-vars.mjs`, over the sheets
 *     `core-stylesheets.mjs` derives from core's import order: declared in a `:root` block,
 *     plus read by a component with a built-in fallback. That union is exactly what the
 *     CSS variables reference publishes.
 *
 * ## Two failures, two sentences, because the promise treats them differently
 *
 *   • A name in the snapshot and NOT in the tree is a removal or a rename. It fails —
 *     unless a file under `.changeset/` names that exact name and says "deprecat…": that
 *     is the notice release the promise requires, and the removal may then land.
 *   • A name in the tree and NOT in the snapshot is an addition, which the promise always
 *     allows. It fails too, with a different sentence (`pnpm frozen:update`), because a
 *     snapshot that lags the tree stops describing anything.
 *
 * ## Floors
 *
 * Every reader has one. Without them a missing `dist/` reads as the library deleting its
 * entire surface — a true statement about the wrong thing — and the message a contributor
 * gets would send them hunting for a rename instead of running `pnpm build`.
 *
 * Usage:
 *   node scripts/frozen-surface.mjs            # check — `pnpm check:frozen-surface`, in the gate
 *   node scripts/frozen-surface.mjs --write    # re-take the snapshot — `pnpm frozen:update`
 *
 * `--snapshot <file>` and `--changesets <dir>` move the two INPUTS that are not the tree,
 * so `__tests__/frozen-surface.test.ts` can drive this exact script over a doctored copy
 * instead of re-implementing its matcher. A rule added because a promise was not being
 * kept is a rule nothing keeps either, unless it is exercised.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreStylesheets } from './core-stylesheets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

/** `--flag value`, absent when the flag is not given. */
const flag = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1] ?? null;
};
const SNAPSHOT = resolve(ROOT, flag('--snapshot') ?? 'apps/docs/src/data/frozen-surface.json');
const CHANGESETS = resolve(ROOT, flag('--changesets') ?? '.changeset');

const at = (p) => join(ROOT, p);
const read = (p) => readFileSync(at(p), 'utf8');
const sorted = (set) => [...set].sort();
/** Repo-relative for a message — a fixture path passed by the test stays as it is. */
const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

/** A reader that came back empty or nearly so — the tree did not shrink, the reader broke. */
const broken = [];
/** Something deliberately not measured this run, said out loud rather than skipped in silence. */
const notes = [];

// ── elements ────────────────────────────────────────────────────────────────
//
// Core plus the three plugins that define an element. `@aparte/plugin-artifacts` ships a
// manifest too and declares no custom element (its card is a tool renderer), so it
// contributes nothing and is not listed.
const MANIFESTS = [
    ['@aparte/core', 'packages/core/dist/custom-elements.json'],
    ['@aparte/plugin-approval', 'packages/plugins/approval/dist/custom-elements.json'],
    ['@aparte/plugin-ask-user', 'packages/plugins/ask-user/dist/custom-elements.json'],
    ['@aparte/plugin-model-selector', 'packages/plugins/model-selector/dist/custom-elements.json'],
];
const ELEMENT_FLOOR = 20;

function readElements() {
    /** @type {Record<string, {package: string, attributes: string[]}>} */
    const found = {};
    for (const [pkg, file] of MANIFESTS) {
        if (!existsSync(at(file))) {
            notes.push(`${pkg}: no manifest at ${file}, so its elements are not in this run — \`pnpm build\` generates it.`);
            continue;
        }
        const cem = JSON.parse(read(file));
        for (const mod of cem.modules ?? []) {
            for (const decl of mod.declarations ?? []) {
                if (!decl.customElement || !decl.tagName) continue;
                found[decl.tagName] = {
                    package: pkg,
                    attributes: sorted(new Set((decl.attributes ?? []).map((a) => a.name).filter(Boolean))),
                };
            }
        }
    }
    const tags = Object.keys(found);
    if (tags.length < ELEMENT_FLOOR) {
        broken.push(
            `only ${tags.length} custom element(s) read from ${MANIFESTS.length} manifest(s), floor is ${ELEMENT_FLOOR}. `
            + 'Build the packages (`pnpm build`) — the manifests are generated by `cem analyze`.',
        );
    }
    return Object.fromEntries(tags.sort().map((t) => [t, found[t]]));
}

// ── events ──────────────────────────────────────────────────────────────────
const EVENT_MAP = 'packages/core/src/types/event-map.ts';
const TYPED_EVENT_FLOOR = 30;

function readEvents() {
    const src = read(EVENT_MAP);
    const typed = sorted(new Set([...src.matchAll(/^\s*'(aparte-[a-z0-9-]+)':\s*CustomEvent</gm)].map((m) => m[1])));
    // The six detail-less names are declared in one sentence of this file's docblock, and
    // nowhere else: "…that is the whole exclusion: `a`, `b`, … are all dispatched as a bare
    // new CustomEvent(name)". Their NAMES freeze even though no `detail` types them, which
    // is what matters for `aparte-reset` — an app dispatches it by name.
    const sentence = src.split('the whole exclusion:')[1]?.split('are all dispatched')[0] ?? '';
    const names = sorted(new Set([...sentence.matchAll(/`(aparte-[a-z0-9-]+)`/g)].map((m) => m[1])));

    if (typed.length < TYPED_EVENT_FLOOR) {
        broken.push(
            `only ${typed.length} entries read from AparteEventMap in ${EVENT_MAP}, floor is ${TYPED_EVENT_FLOOR}. `
            + 'The shape this reads has changed.',
        );
    }
    if (!names.length) {
        broken.push(
            `read no detail-less event name out of ${EVENT_MAP}. They are enumerated in one sentence of its `
            + 'docblock ("that is the whole exclusion: …are all dispatched"), and that sentence has moved or been rewritten.',
        );
    }
    return { typed, names };
}

// ── exports ─────────────────────────────────────────────────────────────────
/**
 * Measured at 205 values across 20 barrels (86 of them core's, which is the "eighty-six"
 * the page used to spell out). Well under `check-export-mentions`'s 345, and it should be:
 * that guard reads the `.d.ts`, so it counts every type too. A floor, not a target.
 */
const EXPORT_FLOOR = 190;
const PACKAGE_FLOOR = 18;

/**
 * Published, and deliberately NOT frozen — so the guard must not freeze it either.
 *
 * `reference/stability` names `@aparte/docs-mcp` in the promise paragraph as one of the
 * things that stays free to move ("a tool, not an API"): it is a Node CLI that serves the
 * docs to a coding agent, not part of the browser library, and `check-export-mentions.mjs`
 * carries the same caveat where it lists the barrels. Measuring it here would have made
 * the gate refuse a rename the page had already permitted five lines above the table —
 * the promise and its enforcement disagreeing, which is worse than either alone.
 */
const NOT_FROZEN = new Map([
    ['@aparte/docs-mcp', 'a Node CLI that serves the docs to an agent, not part of the library surface'],
]);

/** Every package npm publishes, minus the ones the page declares unfrozen. Mirrored from `check-published-readmes.mjs`. */
function publishable(dir = at('packages'), depth = 0, out = []) {
    if (depth > 3) return out;
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        const manifest = join(full, 'package.json');
        if (existsSync(manifest)) {
            const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
            if (pkg.name?.startsWith('@aparte/') && !pkg.private && !NOT_FROZEN.has(pkg.name)) out.push({ pkg, dir: full });
        }
        try {
            publishable(full, depth + 1, out);
        } catch {
            /* not a directory */
        }
    }
    return out;
}

/**
 * Every built JS entry the package's `.` export map can resolve to.
 *
 * Read off the map rather than assumed to be `dist/index.js`: `@aparte/angular` ships an
 * Angular package-format `fesm2022/*.mjs`, and core answers the `node` condition with a
 * second barrel — the DOM-free one, which is where the element classes are NOT. Taking
 * every JS leaf is what puts `AparteChat` and `AparteClient` in the same list.
 */
function barrelsOf(dir, pkg) {
    const files = new Set();
    const collect = (node) => {
        if (typeof node === 'string') {
            if (/\.(js|mjs)$/.test(node)) files.add(node);
            return;
        }
        if (node && typeof node === 'object') for (const v of Object.values(node)) collect(v);
    };
    collect(pkg.exports?.['.']);
    if (!files.size) {
        for (const v of [pkg.module, pkg.main]) if (typeof v === 'string' && /\.(js|mjs)$/.test(v)) files.add(v);
    }
    return sorted(files).map((f) => resolve(dir, f)).filter(existsSync);
}

/**
 * The names a built barrel exports — all of them values, since the build erased the types.
 *
 * Covers the two forms a bundler emits: the trailing `export { a, b as c }` block (rollup,
 * and the `export { x } from './y.js'` passthrough `@aparte/svelte` publishes) and a bare
 * `export const|function|class`.
 */
function valueExports(file) {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        }
    }
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
        names.add(m[1]);
    }
    names.delete('default');
    return names;
}

function readExports() {
    /** @type {Record<string, string[]>} */
    const out = {};
    const packages = publishable();
    if (packages.length < PACKAGE_FLOOR) {
        broken.push(`found only ${packages.length} publishable package(s), floor is ${PACKAGE_FLOOR}. The walk is wrong.`);
    }
    for (const { pkg, dir } of packages.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))) {
        const barrels = barrelsOf(dir, pkg);
        if (!barrels.length) {
            notes.push(`${pkg.name}: no built barrel under ${rel(dir)}, so its exports are not in this run — \`pnpm build\` writes it.`);
            continue;
        }
        const names = new Set();
        for (const b of barrels) for (const n of valueExports(b)) names.add(n);
        out[pkg.name] = sorted(names);
    }
    const total = Object.values(out).reduce((s, v) => s + v.length, 0);
    if (total < EXPORT_FLOOR) {
        broken.push(
            `only ${total} value export(s) read across ${Object.keys(out).length} barrel(s), floor is ${EXPORT_FLOOR}. `
            + 'Either the packages are not built (`pnpm build`) or the barrel shape changed.',
        );
    }
    return out;
}

// ── locale keys ─────────────────────────────────────────────────────────────
const LOCALE = 'packages/core/src/config/locale.ts';
const LOCALE_FLOOR = 75;

function readLocaleKeys() {
    const src = read(LOCALE);
    // The same slice `check-locale-keys` takes, and the same one-indent-level key match.
    const block = src.slice(src.indexOf('export type AparteLocale = {'), src.indexOf('export type AparteLocaleExtensions'));
    const keys = sorted(new Set([...block.matchAll(/^ {4}([a-zA-Z]\w*)\??:/gm)].map((m) => m[1])));
    if (keys.length < LOCALE_FLOOR) {
        broken.push(`only ${keys.length} key(s) read from AparteLocale in ${LOCALE}, floor is ${LOCALE_FLOOR}.`);
    }
    return keys;
}

// ── tokens ──────────────────────────────────────────────────────────────────
const TOKEN_FLOOR = 250;
const CORE_SRC = at('packages/core/src');
const TOKEN_LINE = /^\s*(--aparte-[\w-]+)\s*:\s*(.+?);\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/;

/** `var(--x, default)` where the default may itself contain parens and commas. */
function readsIn(text) {
    const out = [];
    for (let i = text.indexOf('var('); i !== -1; i = text.indexOf('var(', i + 1)) {
        let depth = 1;
        let comma = -1;
        let j = i + 4;
        for (; j < text.length && depth > 0; j++) {
            const c = text[j];
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === ',' && depth === 1 && comma === -1) comma = j;
        }
        if (depth !== 0) continue;
        const name = text.slice(i + 4, comma === -1 ? j - 1 : comma).trim();
        if (/^--aparte-[\w-]+$/.test(name)) out.push(name);
    }
    return out;
}

function* walkFiles(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
        if (name.name === 'node_modules' || name.name === 'dist' || name.name === '__tests__') continue;
        const p = join(dir, name.name);
        if (name.isDirectory()) yield* walkFiles(p);
        else if (/\.(css|ts)$/.test(p)) yield p;
    }
}

function readTokens() {
    // Pass 1 — every `:root`-anchored block, at column zero. A nested `:root` (inside
    // `prefers-reduced-motion`) is an override, not a declaration.
    const css = coreStylesheets(true, ROOT).map((p) => readFileSync(p, 'utf8')).join('\n');
    const lines = css.split(/\r?\n/);
    const body = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/^:root\b/.test(lines[i])) continue;
        let j = i;
        while (j < lines.length && !lines[j].includes('{')) j++;
        j++;
        for (; j < lines.length && !/^\}/.test(lines[j]); j++) body.push(lines[j]);
        i = j;
    }
    const declared = new Set();
    for (let i = 0; i < body.length; i++) {
        // Comments walked as a block: two lines inside the anchored block are prose that
        // reads like a declaration, and a per-line match counts both.
        if (/^\s*\/\*/.test(body[i])) {
            let end = i;
            while (end < body.length && !body[end].includes('*/')) end++;
            i = end;
            continue;
        }
        const tok = body[i].match(TOKEN_LINE);
        if (tok) declared.add(tok[1]);
    }

    // Pass 2 — read by a component with a built-in fallback, declared in no `:root`. A
    // token core writes through `setProperty` is an internal channel, not a knob.
    const runtimeManaged = new Set();
    const componentRead = new Set();
    for (const file of walkFiles(CORE_SRC)) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/setProperty\(\s*['"](--aparte-[\w-]+)['"]/g)) runtimeManaged.add(m[1]);
        for (const name of readsIn(text)) componentRead.add(name);
    }

    const tokens = new Set(declared);
    for (const n of componentRead) if (!declared.has(n) && !runtimeManaged.has(n)) tokens.add(n);
    if (tokens.size < TOKEN_FLOOR) {
        broken.push(
            `only ${tokens.size} documented token(s) read from core's stylesheets, floor is ${TOKEN_FLOOR}. `
            + 'The corpus shrank — a sheet moved, or the `:root` block parse broke.',
        );
    }
    return sorted(tokens);
}

// ── the surface, as the tree has it now ─────────────────────────────────────
const version = JSON.parse(read('packages/core/package.json')).version;
const surface = {
    elements: readElements(),
    events: readEvents(),
    exports: readExports(),
    locale: readLocaleKeys(),
    tokens: readTokens(),
};

if (broken.length) {
    console.error('\n[frozen-surface] a reader came back empty, so nothing below would mean anything:\n');
    for (const b of broken) console.error(`  - ${b}`);
    console.error('');
    process.exit(1);
}

const attributeCount = Object.values(surface.elements).reduce((s, e) => s + e.attributes.length, 0);
const exportCount = Object.values(surface.exports).reduce((s, v) => s + v.length, 0);
const eventCount = surface.events.typed.length + surface.events.names.length;
const summary = `${Object.keys(surface.elements).length} elements, ${attributeCount} attributes, `
    + `${eventCount} events, ${exportCount} exports across ${Object.keys(surface.exports).length} packages, `
    + `${surface.locale.length} locale keys, ${surface.tokens.length} tokens`;

// ── --write: re-take the snapshot ───────────────────────────────────────────
if (WRITE) {
    const previous = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;
    // The stamp moves when the VERSION does. Re-dating an unchanged version on every
    // addition would churn the file and lie about when the surface froze; the beta
    // release is what re-stamps it.
    const frozenSince = previous?.frozenSince?.version === version && previous.frozenSince.date
        ? previous.frozenSince
        : { version, date: new Date().toISOString().slice(0, 10) };
    const out = { frozenSince, ...surface };
    writeFileSync(SNAPSHOT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    for (const n of notes) console.log(`[frozen-surface] note: ${n}`);
    console.log(`[frozen-surface] wrote ${rel(SNAPSHOT)}: ${summary} — frozen since ${frozenSince.version} (${frozenSince.date}).`);
    process.exit(0);
}

// ── check: the snapshot against the tree ────────────────────────────────────
if (!existsSync(SNAPSHOT)) {
    console.error(
        `\n[frozen-surface] no snapshot at ${rel(SNAPSHOT)}.\n`
        + 'Take it with `pnpm frozen:update` and commit it — the stability page renders from it.\n',
    );
    process.exit(1);
}
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/** Changesets that announce a deprecation — the notice release the promise requires. */
const notices = existsSync(CHANGESETS)
    ? readdirSync(CHANGESETS)
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .map((f) => ({ file: rel(join(CHANGESETS, f)), text: readFileSync(join(CHANGESETS, f), 'utf8') }))
        .filter((c) => /deprecat/i.test(c.text))
    : [];

/**
 * A changeset that names this exact name. The boundary class carries `-` so
 * `aparte-chat` is not credited by a changeset about `aparte-chat-bubble`.
 */
function noticeFor(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![A-Za-z0-9_$-])${escaped}(?![A-Za-z0-9_$-])`);
    return notices.find((c) => re.test(c.text))?.file ?? null;
}

/** @type {{label: string, name: string}[]} */
const removed = [];
/** @type {{label: string, name: string}[]} */
const added = [];
/** @type {string[]} */
const drifted = [];

function diff(label, before, now) {
    const b = new Set(before ?? []);
    const n = new Set(now ?? []);
    for (const name of sorted(b)) if (!n.has(name)) removed.push({ label, name });
    for (const name of sorted(n)) if (!b.has(name)) added.push({ label, name });
}

// elements, then the attributes of the ones both sides agree exist
const snapTags = Object.keys(snapshot.elements ?? {});
const treeTags = Object.keys(surface.elements);
diff('element', snapTags, treeTags);
for (const tag of snapTags.filter((t) => surface.elements[t])) {
    diff(`attribute of <${tag}>`, snapshot.elements[tag].attributes, surface.elements[tag].attributes);
    if (snapshot.elements[tag].package !== surface.elements[tag].package) {
        drifted.push(`<${tag}> moved from ${snapshot.elements[tag].package} to ${surface.elements[tag].package}`);
    }
}

diff('typed event', snapshot.events?.typed, surface.events.typed);
diff('event name', snapshot.events?.names, surface.events.names);

const snapPkgs = Object.keys(snapshot.exports ?? {});
diff('published package', snapPkgs, Object.keys(surface.exports));
for (const pkg of snapPkgs.filter((p) => surface.exports[p])) {
    diff(`export of ${pkg}`, snapshot.exports[pkg], surface.exports[pkg]);
}

diff('locale key', snapshot.locale, surface.locale);
diff('token', snapshot.tokens, surface.tokens);

const withNotice = [];
const withoutNotice = [];
for (const r of removed) {
    const notice = noticeFor(r.name);
    (notice ? withNotice : withoutNotice).push({ ...r, notice });
}

const problems = [
    ...withoutNotice.map((r) => `removed without notice: ${r.label} \`${r.name}\` is frozen in the snapshot and gone from the tree.`),
    ...drifted.map((d) => `${d} — run \`pnpm frozen:update\`.`),
    ...added.map((a) => `missing from the snapshot: ${a.label} \`${a.name}\` — an addition, which the promise allows; run \`pnpm frozen:update\`.`),
];

for (const n of notes) console.log(`[frozen-surface] note: ${n}`);
for (const r of withNotice) console.log(`[frozen-surface] deprecated with notice: ${r.label} \`${r.name}\` (${r.notice}).`);

if (problems.length) {
    console.error(`\n[frozen-surface] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
        '\nA frozen name leaves in TWO releases, never one: a notice release that keeps it and\n'
        + 'marks it deprecated (a changeset naming it, with the word "deprecated"), then a removal\n'
        + 'release at least one minor later. An addition only needs the snapshot re-taken:\n'
        + '`pnpm frozen:update`, and commit `apps/docs/src/data/frozen-surface.json` with it.\n',
    );
    process.exit(1);
}

console.log(`[frozen-surface] OK: ${summary} — frozen since ${snapshot.frozenSince?.version ?? '(unstamped)'}`);
