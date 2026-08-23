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

console.log(`[peer-ranges] OK: ${checked} internal peer ranges, all literal and bounded.`);
