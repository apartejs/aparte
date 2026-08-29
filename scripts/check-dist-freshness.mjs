/**
 * A published `dist` must not be older than the `src` it was built from.
 *
 * This exists because it happened, and cost a full red browser suite. `pnpm gate`
 * reported green — including four guards that READ the built output
 * (`check-export-mentions`, `check-node-barrel-types`, `check-bundle-entries`,
 * `check-node-import`) — while `packages/core/dist/index.js` was nine minutes older
 * than `packages/core/src/utils/uuid.ts`. So the barrel guards were happily
 * validating an artifact that predated the export they were meant to check, and the
 * only thing that noticed was `pnpm e2e`: the Svelte example resolves core from
 * `dist`, so all 42 of its tests died on
 *
 *     The requested module '.../core/dist/index.js' does not provide an export
 *     named 'uuid'
 *
 * Why `pnpm build` did not refresh it is an nx cache question (`targetDefaults.build`
 * uses the `production` named input, which is `{projectRoot}/**\/*` minus tests — so
 * a project's own `dist` is part of its own inputs). Rather than reverse-engineer the
 * hashing, this asserts the property that actually matters, deterministically.
 *
 * The comparison itself — and the mtime-is-not-content subtlety it took two false
 * alarms to learn — moved to `scripts/dist-freshness.mjs`, because two of those four
 * barrel guards now ask the same question for themselves: both are run standalone by
 * contributors, and both return a green that means nothing against a stale build. One
 * rule, one implementation. This file is the repo-wide gate step, and the only caller
 * that RECORDS the verified hash.
 *
 * Run by `pnpm gate`, AFTER the build.
 */
import { distFreshness } from './dist-freshness.mjs';

const { checked, stale, mtimeOnly } = distFreshness({ record: true });

if (stale.length) {
    console.error(`\n[dist-freshness] ${stale.length} package(s) have a stale dist:\n`);
    for (const s of stale) console.error('  ' + s);
    console.error(
        '\nThe guards that read built output would be validating the OLD artifact, and a'
        + '\nexample resolving the package from `dist` will fail at runtime on anything'
        + '\nadded since. Rebuild with `npx nx run <project>:build --skip-nx-cache`.\n',
    );
    process.exit(1);
}

console.log(
    `[dist-freshness] OK: ${checked} built packages, every dist current with its src.`
    + (mtimeOnly.length
        ? ` (${mtimeOnly.length} had a newer mtime with identical content: ${mtimeOnly.join(', ')})`
        : ''),
);
