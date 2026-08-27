#!/usr/bin/env node
/**
 * Refuses a `workspace:` protocol in an INTERNAL peer dependency.
 *
 * ## The trap, and why it needs a guard rather than a comment
 *
 * `changeset version` resolves a peer's `workspace:` protocol to a concrete range
 * against the CURRENT version: `workspace:*` becomes an exact pin, `workspace:~` and
 * `workspace:^` become `~0.7.1` / `^0.7.1` — and for a `0.x` version those two pin
 * the MINOR. So the next minor bump leaves the range, every peer dependent is majored,
 * and a `fixed` lockstep group goes straight to `1.0.0` from a release whose every
 * changeset says `minor`.
 *
 * This repo has now walked into it twice:
 *
 *   - `c736df7` replaced `workspace:*` with a literal `>=0.5.0-alpha.0 <1.0.0`,
 *     documented three measured causes, and deleted `scripts/force-version.mjs`
 *     because there was nothing left to override.
 *   - `aa3d1c7` tightened the published contract to `workspace:~` — rightly, the old
 *     range let `@aparte/react@0.7.1` pair with `@aparte/core@0.5.0` — and silently
 *     reintroduced the first cause. The next release proposed `1.0.0`.
 *
 * Both commits were right about their own concern, and they cannot both hold:
 * npm-enforced lockstep and an automatic `0.x` number are mutually exclusive, because
 * a range tight enough to forbid the mismatch is a range a minor bump leaves. JSON has
 * no comments, so the reasoning cannot live on the field. It lives here, and it bites.
 *
 * At `1.0` this stops being a trap: `^1` means what everyone expects. Delete the guard
 * then, deliberately, rather than discovering it in a release.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCOPE = '@aparte/';
const manifests = [];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'package.json') manifests.push(full);
    }
}
walk('packages');

const problems = [];
let checked = 0;

for (const file of manifests) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const [dep, range] of Object.entries(json.peerDependencies ?? {})) {
        if (!dep.startsWith(SCOPE)) continue;
        checked += 1;
        if (String(range).startsWith('workspace:')) {
            problems.push({ file, name: json.name, dep, range });
        }
    }
}

/**
 * A floor is not enough on its own: `>=0.7.0` with no ceiling would admit a future
 * `2.0.0`, which is not a lockstep contract either. Both halves are checked so a
 * half-written range cannot pass.
 */
for (const file of manifests) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const [dep, range] of Object.entries(json.peerDependencies ?? {})) {
        if (!dep.startsWith(SCOPE)) continue;
        if (String(range).startsWith('workspace:')) continue;
        if (!/<\s*\d/.test(String(range))) {
            problems.push({ file, name: json.name, dep, range, why: 'no upper bound' });
        }
    }
}

/**
 * And the FLOOR has to be the version the lot is actually on.
 *
 * Bounded is not the same as true. Every package here ships in lockstep — one
 * `changeset version`, one number — and yet all fourteen declared `>=0.7.0` while sitting
 * at 0.12.1 and importing symbols core did not export before 0.11.0
 * (`AparteElementAttributes`) or 0.12.0 (`AparteUiEventName`) — established by reading
 * `src/index.ts` at each release TAG, not inferred from a changelog. npm and pnpm both
 * ACCEPT that pairing in silence and hand the consumer a tree whose types cannot compile.
 *
 * This guard only says so. `scripts/sync-peer-ranges.mjs` is what fixes it, and it runs
 * inside `version-packages` where the bump happens — a floor that has to be hand-edited
 * on every release is a floor that will rot again.
 */
const LOCKSTEP = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const stale = [];
for (const file of manifests) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const [dep, range] of Object.entries(json.peerDependencies ?? {})) {
        if (!dep.startsWith(SCOPE)) continue;
        if (String(range).startsWith('workspace:')) continue;
        const floor = /^>=\s*([0-9][^\s]*)/.exec(String(range))?.[1];
        if (floor !== LOCKSTEP) stale.push({ file, name: json.name, dep, range: String(range), floor });
    }
}

if (stale.length) {
    console.error(`\n[peer-ranges] ${stale.length} internal peer floor(s) do not match the lockstep version ${LOCKSTEP}:\n`);
    for (const s of stale) {
        console.error(`  ${s.name}  ->  "${s.dep}": "${s.range}"   (${s.file})`);
        console.error(`    floor is ${s.floor ?? '(unreadable)'}, the lot is on ${LOCKSTEP}\n`);
    }
    console.error(
        '  These packages are published together and are never tested apart, so the floor\n'
        + '  IS the release. A lower one is not generosity, it is an untested claim: the\n'
        + '  package manager accepts the pairing without a word and the build fails at the\n'
        + '  consumer, on types that were added after the floor.\n\n'
        + '  Run `node scripts/sync-peer-ranges.mjs`. It runs on its own inside\n'
        + '  `pnpm version-packages`; seeing this means the bump happened without it.\n',
    );
    process.exit(1);
}

/*
 * ── EXTERNAL framework peers ─────────────────────────────────────────────────
 *
 * Everything above only ever looked at `@aparte/` peers (`if (!dep.startsWith(SCOPE))
 * continue`), so `react`, `vue`, `svelte`, `@angular/core` and `rxjs` were never checked
 * at all. The audit's saboteur set the model-selector plugin's `react` peer to `^1.0.0`
 * and the whole gate stayed green. `check:lockfile` cannot cover it either — a lockfile
 * records dependency and devDependency specifiers, not peers — and publint/attw check
 * packaging and type resolution, not range sanity.
 *
 * It was not hypothetical. The plugin shipped `react: "^19.2.7"` and `svelte: "^4.2.0"`,
 * copied from its own devDependency PINS in the same commit that added them. Both exclude
 * versions aparté supports and this repo exercises: React 18 is a gate step
 * (`typecheck:matrix`), and `apps/examples/svelte5` runs svelte 5. An out-of-range peer
 * that is PRESENT is an ERESOLVE conflict whether or not it is optional, so a Svelte 5 app
 * running the install line the docs print would simply fail.
 *
 * The rule is DERIVED, not a list to maintain: the WRAPPER for a framework is the
 * authority on which versions of it aparté supports, because that is the package whose
 * code runs against it. So any other package declaring the same external peer must declare
 * the same range. Widening support then means editing one file, and the guard propagates
 * it. A package is free to declare FEWER peers than the wrapper — the plugin needs
 * `@angular/core` and not `@angular/common` or `rxjs` — it just may not disagree about a
 * range it does declare.
 */
const WRAPPERS = ['react', 'vue', 'svelte', 'angular'];
const authority = new Map();
for (const w of WRAPPERS) {
    const file = join('packages', 'wrappers', w, 'package.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const [dep, range] of Object.entries(json.peerDependencies ?? {})) {
        if (dep.startsWith(SCOPE)) continue;
        authority.set(dep, { range: String(range), from: json.name });
    }
}
if (authority.size === 0) {
    console.error(
        '\n[peer-ranges] the four wrappers declare NO external peer.\n\n'
        + '  They declare react, react-dom, vue, svelte, @angular/core, @angular/common and\n'
        + '  rxjs. Seeing none means this guard stopped reading them — a collapsed count is\n'
        + '  the signature of a broken matcher, not of a clean tree.\n',
    );
    process.exit(1);
}

let externalChecked = 0;
const externalProblems = [];
for (const file of manifests) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    // A wrapper IS the authority for its own framework; comparing it to itself is circular.
    if (WRAPPERS.some((w) => json.name === `@aparte/${w}`)) continue;
    for (const [dep, range] of Object.entries(json.peerDependencies ?? {})) {
        if (dep.startsWith(SCOPE)) continue;
        const ref = authority.get(dep);
        if (!ref) continue;
        externalChecked += 1;
        if (String(range) !== ref.range) {
            externalProblems.push({ file, name: json.name, dep, range: String(range), ref });
        }
    }
}

if (externalProblems.length) {
    console.error('\n[peer-ranges] an external peer range disagrees with its wrapper:\n');
    for (const p of externalProblems) {
        console.error(`  ${p.name}  ->  "${p.dep}": "${p.range}"   (${p.file})`);
        console.error(`    ${p.ref.from} declares "${p.ref.range}" — the wrapper is the authority`);
        console.error('    on which versions of that framework aparté supports.\n');
    }
    console.error(
        '  If the narrower range is right, the WRAPPER is what should say so — change it\n'
        + '  there and this propagates. If it was copied from a devDependency pin, that is\n'
        + '  the bug: a pin is what you develop against, a peer is what you accept.\n'
        + '  An out-of-range peer that is present is an ERESOLVE failure, optional or not.\n',
    );
    process.exit(1);
}

if (checked === 0) {
    console.error(
        '\n[peer-ranges] found NO internal peer dependency to check.\n\n'
        + '  Fourteen packages declare `@aparte/core` as a peer. Seeing none means this\n'
        + '  guard stopped looking where they are — a collapsed count is the signature of\n'
        + '  a broken matcher, not of a clean tree.\n',
    );
    process.exit(1);
}

if (problems.length) {
    console.error('\n[peer-ranges] refusing these internal peer ranges:\n');
    for (const p of problems) {
        console.error(`  ${p.name}  ->  "${p.dep}": "${p.range}"   (${p.file})`);
        console.error(`    ${p.why ?? 'a `workspace:` protocol resolves to a pinned minor for a 0.x version'}\n`);
    }
    console.error(
        '  `changeset version` resolves these against the CURRENT version, so the next\n'
        + '  minor bump leaves the range, every peer dependent is MAJORED, and the lockstep\n'
        + '  group jumps to 1.0.0 from a release whose changesets all say minor.\n\n'
        + '  Use a literal range with both bounds, e.g. ">=0.7.0 <1.0.0". See the header of\n'
        + '  this file for the two commits that walked into this and why they conflict.\n',
    );
    process.exit(1);
}

console.log(
    `[peer-ranges] OK: ${checked} internal peer ranges, all literal and bounded;`
    + ` ${externalChecked} external framework peers agree with their wrapper.`,
);
