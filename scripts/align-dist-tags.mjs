#!/usr/bin/env node
/*
 * Point the `alpha` dist-tag at the version that was just published.
 *
 * Why this exists: `changeset publish` publishes a prerelease to **`latest`** and
 * leaves `alpha` on the previous version — three releases in a row (0.3.0, 0.4.0,
 * 0.5.0) shipped with `npm i @aparte/core@alpha` resolving to the version before.
 * And the obvious fix is refused: `changeset publish --tag alpha` errors with
 * "Releasing under custom tag is not allowed in pre mode", so the tag has to be
 * moved afterwards, on all fifteen packages.
 *
 * `latest` is deliberately left where `changeset publish` put it: every version so
 * far is a prerelease, so there is no stable release for it to point at, and moving
 * it backwards would only make `npm i @aparte/core` resolve to something older.
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

const TAG = JSON.parse(readFileSync(join(root, '.changeset/pre.json'), 'utf8')).tag ?? 'alpha';

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
    if (current[TAG] === pkg.version) {
        already++;
        continue;
    }
    console.log(`  ${TAG}: ${current[TAG] ?? '(none)'} -> ${pkg.version}  ${pkg.name}`);
    if (dry) { moved++; continue; }
    try {
        npm(['dist-tag', 'add', spec, TAG]);
        moved++;
    } catch (err) {
        failed.push(`${spec}: ${(err instanceof Error ? err.message : String(err)).split('\n')[0]}`);
    }
}

console.log(`[align-dist-tags] ${moved} moved, ${already} already correct${dry ? ' (dry run)' : ''}.`);
if (failed.length) {
    console.error('[align-dist-tags] FAILED for:');
    for (const f of failed) console.error(`  ${f}`);
    process.exit(1);
}
