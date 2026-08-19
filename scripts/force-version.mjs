#!/usr/bin/env node
/*
 * Rewrite the version `changeset version` just produced to the one we actually
 * want, across every file it wrote.
 *
 * Why this exists — the number changesets computes for this repo is wrong, and
 * structurally so, not by accident:
 *
 *   Every `@aparte/*` package is `fixed` (lockstep), and the four wrappers carry
 *   `@aparte/core` in `peerDependencies`. For a package still in `0.x`, changesets
 *   treats a MINOR as breaking for its dependents — so a minor on core makes the
 *   wrappers major, and `fixed` then aligns all fifteen on the highest bump. Every
 *   feature release therefore proposes `1.0.0`. Measured, not guessed: a
 *   `patch`-only changeset stays a patch; a `minor`-only one comes out major.
 *
 * Until the group leaves 0.x (or drops `fixed`), releases run:
 *
 *   pnpm version-packages                       # changeset version + root changelog
 *   node scripts/force-version.mjs 0.5.0-alpha.0
 *   node scripts/gen-root-changelog.mjs         # regenerate: it reads the per-package files
 *
 * This used to be done by hand across ~46 files. It was forgotten once (the seven
 * private apps), and the release that followed carried two version numbers.
 *
 * Usage:
 *   node scripts/force-version.mjs <target> [--from <version>] [--dry]
 *
 * `--from` defaults to the current version of @aparte/core, i.e. whatever
 * `changeset version` just wrote.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const target = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--from');
const fromFlag = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : undefined;

if (!target || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(target)) {
    console.error('usage: node scripts/force-version.mjs <target-version> [--from <version>] [--dry]');
    process.exit(1);
}

const corePkg = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const from = fromFlag ?? corePkg.version;

if (from === target) {
    console.log(`[force-version] already at ${target} — nothing to do.`);
    process.exit(0);
}

// Guard: `from` must be the number `changeset version` just wrote and NOT yet
// committed. Run with an already-released version and the global replace would walk
// into the historical CHANGELOG entries ("Updated dependencies @aparte/core@0.4.0-alpha.0")
// and rewrite the past. Checked against HEAD, so the mistake is impossible rather
// than merely documented.
const headCoreVersion = (() => {
    try {
        return JSON.parse(
            execFileSync('git', ['show', 'HEAD:packages/core/package.json'], { cwd: root, encoding: 'utf8' }),
        ).version;
    } catch {
        return undefined;
    }
})();

if (headCoreVersion && from === headCoreVersion && !argv.includes('--force')) {
    console.error(`[force-version] FAIL: ${from} is the version committed at HEAD.`);
    console.error('  This rewrites the version `changeset version` just produced — run it');
    console.error('  BEFORE committing the release, so the past stays the past.');
    console.error('  (--force overrides, and you almost certainly do not want that.)');
    process.exit(1);
}

/** Every package.json / CHANGELOG.md in the workspace, minus build output. */
function collect(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '.nx') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collect(full, out);
        else if (entry === 'package.json' || entry === 'CHANGELOG.md') out.push(full);
    }
    return out;
}

const files = collect(root);
const touched = [];

for (const file of files) {
    const before = readFileSync(file, 'utf8');
    if (!before.includes(from)) continue;

    // Only the version we are replacing — never a dependency range, never another
    // package's number. `from` is a full, exact version string, so a plain global
    // replace is precise: nothing else in these files carries it.
    const after = before.split(from).join(target);
    if (after === before) continue;

    const count = before.split(from).length - 1;
    touched.push([file.slice(root.length + 1).replace(/\\/g, '/'), count]);
    if (!dry) writeFileSync(file, after);
}

if (touched.length === 0) {
    console.error(`[force-version] FAIL: "${from}" appears in no package.json or CHANGELOG.md.`);
    console.error('  Did `changeset version` run? Is --from right?');
    process.exit(1);
}

const total = touched.reduce((n, [, c]) => n + c, 0);
console.log(`[force-version] ${from} -> ${target}${dry ? ' (dry run)' : ''}`);
for (const [file, count] of touched) console.log(`  ${String(count).padStart(3)}x  ${file}`);
console.log(`[force-version] ${touched.length} files, ${total} occurrences.`);
console.log('[force-version] next: node scripts/gen-root-changelog.mjs');
