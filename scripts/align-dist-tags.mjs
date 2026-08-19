#!/usr/bin/env node
/*
 * Point the `alpha` dist-tag at the version that was just published.
 *
 * Why this exists: the dist-tags drifted on three releases in a row (0.3.0, 0.4.0,
 * 0.5.0) — `changeset publish` was moving `latest` and leaving `alpha` on the version
 * before, so `npm i @aparte/core@alpha` served stale bits. `pnpm release` now passes
 * `--tag alpha` (possible again since the repo left changesets' pre mode), and this
 * script is the check that both tags actually ended up on the version just built.
 *
 * BOTH tags are aligned, on purpose. There is no stable line yet: `latest` already
 * pointed at an alpha, so freezing it protects nobody and only serves older bits to
 * a bare `npm i @aparte/core`. The day a stable line exists, `latest` stops following
 * the alpha channel — and that is the day to change this script.
 *
 * Usage (part of `pnpm release`):
 *   node scripts/align-dist-tags.mjs [--dry]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * The channel this repo publishes under, and the tags that must both point at it.
 * `alpha` is the channel (`package.json`'s `release` script passes it to
 * `changeset publish`); `latest` follows while no stable line exists — see above.
 */
const TAGS = ['alpha', 'latest'];

/** Every publishable package in the workspace, at its current version. */
function publishable() {
    const roots = ['packages'];
    const found = [];
    const walk = (dir, depth) => {
        if (depth > 3) return;
        for (const entry of readdirSync(dir)) {
            if (entry === 'node_modules' || entry === 'dist') continue;
            const full = join(dir, entry);
            const manifest = join(full, 'package.json');
            if (existsSync(manifest)) {
                const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
                if (pkg.name && !pkg.private && pkg.version) found.push(pkg);
            }
            try { walk(full, depth + 1); } catch { /* not a directory */ }
        }
    };
    for (const r of roots) walk(join(root, r), 0);
    return found;
}

const packages = publishable();
if (packages.length === 0) {
    console.error('[align-dist-tags] FAIL: found no publishable package.');
    process.exit(1);
}

let moved = 0;
let already = 0;
const failed = [];

for (const pkg of packages) {
    const spec = `${pkg.name}@${pkg.version}`;
    let current;
    try {
        current = JSON.parse(npm(['view', pkg.name, 'dist-tags', '--json']));
    } catch {
        failed.push(`${pkg.name} (not on npm yet?)`);
        continue;
    }
    for (const tag of TAGS) {
        if (current[tag] === pkg.version) {
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
