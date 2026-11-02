#!/usr/bin/env node
/**
 * Point every internal peer range's FLOOR at the version the lot is on, and its CEILING at
 * the next major.
 *
 * The 15 `@aparte/*` packages are released in lockstep — one `changeset version`, one
 * `changeset publish`, one version number across all of them. Their peer ranges did not
 * follow: fourteen packages declared `"@aparte/core": ">=0.7.0 <1.0.0"` while sitting at
 * 0.12.1 and importing symbols that do not exist before 0.11.0 (`AparteElementAttributes`,
 * `AparteTemplateAttrs`, `AparteElementTagName`) or before 0.12.0 (`AparteUiEventName`) —
 * verified by reading `src/index.ts` at each release tag, not inferred.
 *
 * What that costs a consumer: npm and pnpm both ACCEPT `@aparte/react@0.12.1` beside
 * `@aparte/core@0.7.0`, print nothing, and hand them a tree whose types cannot compile.
 * A peer range is a promise about what the package works with; ours promised five minors
 * it had never been built against.
 *
 * This runs inside `pnpm version-packages`, right after `changeset version`, because that
 * is WHERE the mistake is made: the bump moves every package and nothing moved the floor
 * with it. `check:peer-ranges` asserts the result, but asserting is not fixing — a guard
 * that fails on every release is a chore, not a safeguard.
 *
 * The ceiling is the next major (`<1.0.0` on 0.x, `<2.0.0` on 1.x), and this script writes
 * it too, because a major bump loses it: `changeset version` rewrites a range the new
 * version leaves (`>=0.32.1 <1.0.0` at 1.0.0) as a bare `>=1.0.0`, keeping the operator and
 * dropping the bound. Measured on a dry run of the 1.0.0 bump: 26 ranges came out with no
 * ceiling, which the guard refuses and this script no longer matched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const SCOPE = '@aparte/';
const core = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const ceiling = `${Number(core.split('.')[0]) + 1}.0.0`;

const manifests = globSync('packages/**/package.json', { exclude: (p) => p.includes('node_modules') || p.includes('dist') });

let changed = 0;
let seen = 0;
for (const file of manifests) {
    const before = readFileSync(file, 'utf8');
    /*
     * Rewritten as TEXT, not through JSON.parse/stringify. These manifests do not share
     * one indentation (some are 2-space, some 4-space) and a reformat would bury a
     * one-token change under a whole-file diff.
     *
     * The pattern is safe because only a PEER range uses a comparator: every other
     * internal dep is `workspace:*`, which has no `>=`. The ceiling is optional in what it
     * reads (a major bump drops it) and always present in what it writes.
     */
    const after = before.replace(
        new RegExp(String.raw`("${SCOPE}[^"]+"\s*:\s*")>=\s*[0-9][^ "]*(?:\s+<\s*[0-9][^"]*)?(")`, 'g'),
        (_m, head, tail) => { seen += 1; return `${head}>=${core} <${ceiling}${tail}`; },
    );
    if (after !== before) { writeFileSync(file, after, 'utf8'); changed += 1; }
}

if (seen === 0) {
    console.error(
        `\n[sync-peer-ranges] found NO internal peer range to point at ${core}.\n\n`
        + '  Fourteen packages declare one. Seeing none means this script stopped matching\n'
        + '  where they are — and it would then "succeed" on every release while the floors\n'
        + '  silently rot, which is the exact failure it exists to prevent.\n',
    );
    process.exit(1);
}

console.log(`[sync-peer-ranges] ${seen} internal peer range(s) at >=${core} <${ceiling}; ${changed} file(s) rewritten.`);
