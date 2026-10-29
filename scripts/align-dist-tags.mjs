#!/usr/bin/env node
/*
 * Point the `beta` dist-tag at the version that was just published.
 *
 * Why this exists: the dist-tags drifted on three releases in a row (0.3.0, 0.4.0,
 * 0.5.0) — `changeset publish` was moving `latest` and leaving the channel tag on the
 * version before, so `npm i @aparte/core@alpha` served stale bits. `pnpm release` now
 * passes `--tag beta` (possible since the repo left changesets' pre mode), and this
 * script is the check that every tag actually ended up on the version just built.
 *
 * The tags are aligned, on purpose. There is no stable line yet: `latest` already
 * pointed at a pre-release, so freezing it protects nobody and only serves older bits
 * to a bare `npm i @aparte/core`. The day a stable line exists, `latest` stops
 * following the beta channel — and that is the day to change this script. `alpha` was
 * kept aligned for 0.17.0 only, a bridge for the READMEs and pins that said `@alpha`
 * for months, and left the list at the release after it: it stays on 0.17.0.
 *
 * Usage (part of `pnpm release`):
 *   node scripts/align-dist-tags.mjs [--dry]
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lower, publishable } from './publishable.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');

/**
 * `npm` is a shell script (`npm.cmd` on Windows), and Node refuses to spawn a `.cmd`
 * without a shell (`EINVAL` since Node 20's Windows hardening). Without `shell: true`
 * every lookup failed as "not on npm yet" — the script would have reported a clean
 * run while moving nothing, which is worse than not having it.
 *
 * One composed string rather than an args array, which keeps Node from warning about
 * unescaped arguments: every part here is a package name, a version or a literal from
 * this workspace — nothing external is interpolated.
 */
const npm = (args) => execSync(`npm ${args.join(' ')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * The channel this repo publishes under, and the tags that must all point at it.
 * `beta` is the channel (`package.json`'s `release` script passes it to
 * `changeset publish`); `latest` follows while no stable line exists — see above.
 */
const TAGS = ['beta', 'latest'];

const packages = publishable(root);
if (packages.length === 0) {
    console.error('[align-dist-tags] FAIL: found no publishable package.');
    process.exit(1);
}

let moved = 0;
let already = 0;
const failed = [];

for (const pkg of packages) {
    const spec = `${pkg.name}@${pkg.version}`;
    // `npm dist-tag ls`, not `npm view … dist-tags`: the packument endpoint `view` reads
    // answered 404 for several minutes after the FIRST publish of a package (0.14.0,
    // provider-scenario) while `dist-tag ls` — a different endpoint — already listed
    // both tags correctly, and the release chain stopped on a false "not on npm yet".
    let current;
    try {
        current = Object.fromEntries(
            npm(['dist-tag', 'ls', pkg.name]).split('\n').filter(Boolean)
                .map((line) => line.split(':').map((part) => part.trim())),
        );
    } catch {
        failed.push(`${pkg.name} (not on npm yet?)`);
        continue;
    }
    for (const tag of TAGS) {
        if (current[tag] === pkg.version) {
            already++;
            continue;
        }
        // Never down: a tag already on a newer version belongs to a release after this one
        // (two overlapping, unfinished releases), and moving it would serve older bits.
        if (current[tag] && lower(pkg.version, current[tag])) {
            console.log(`  ${tag}: ${current[tag]} kept, newer than ${pkg.version}  ${pkg.name}`);
            already++;
            continue;
        }
        console.log(`  ${tag}: ${current[tag] ?? '(none)'} -> ${pkg.version}  ${pkg.name}`);
        if (dry) { moved++; continue; }
        try {
            npm(['dist-tag', 'add', spec, tag]);
            moved++;
        } catch (err) {
            failed.push(`${spec} (${tag}): ${(err instanceof Error ? err.message : String(err)).split('\n')[0]}`);
        }
    }
}

console.log(`[align-dist-tags] ${moved} moved, ${already} already correct${dry ? ' (dry run)' : ''}.`);
if (failed.length) {
    console.error('[align-dist-tags] FAILED for:');
    for (const f of failed) console.error(`  ${f}`);
    process.exit(1);
}
