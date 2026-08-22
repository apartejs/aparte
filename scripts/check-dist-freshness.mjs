/**
 * A published `dist` must not be older than the `src` it was built from.
 *
 * This exists because it happened, and cost a full red browser suite. `pnpm gate`
 * reported green — including four guards that READ the built output
 * (`check-export-mentions`, `check-node-barrel-types`, `check-bundle-entries`,
 * `check-node-import`) — while `packages/core/dist/index.js` was nine minutes older
 * than `packages/core/src/utils/uuid.ts`. So the barrel guards were happily
 * validating an artifact that predated the export they were meant to check, and the
 * only thing that noticed was `pnpm e2e`: the Svelte playground resolves core from
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
 * ## mtime is not content
 *
 * The first version compared mtimes alone, and that produces false alarms: a
 * `git checkout`, a branch switch, or restoring a file from a backup all bump the
 * mtime while leaving the bytes identical — nx correctly does not rebuild, and the
 * guard cried stale. It happened here, twice, on a file whose content had not
 * changed at all.
 *
 * So mtime is only the fast path. When it says stale, the guard hashes the src
 * inputs and compares them against the hash recorded the last time this package was
 * verified fresh — kept in a gitignored `.dist-freshness/` at the repo ROOT, not
 * inside `dist`, which the build wipes (the first attempt put it there and the stamp
 * vanished exactly when it was needed). Same content, older dist → an mtime
 * artifact, and it passes. Different content → the real thing, and it fails as before.
 *
 * With no recorded hash — a fresh clone — it falls back to mtime alone, which is the
 * conservative answer and the one CI wants, since CI always builds first.
 *
 * Run by `pnpm gate`, AFTER the build.
 */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.svelte-kit']);

const IS_INPUT = (name) => /\.(ts|tsx|css|svelte|vue|json)$/.test(name) && !/\.test\.ts$/.test(name);

function newestMtime(dir, newest = 0) {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) newest = newestMtime(path, newest);
        else if (IS_INPUT(name)) newest = Math.max(newest, st.mtimeMs);
    }
    return newest;
}

/**
 * A stable hash of exactly the files `newestMtime` walks — the build's inputs. Paths
 * are included so a rename registers, and the list is sorted so directory-read order
 * cannot change the answer between machines.
 */
function srcHash(dir) {
    const files = [];
    (function collect(d) {
        for (const name of readdirSync(d)) {
            if (SKIP_DIRS.has(name)) continue;
            const p = join(d, name);
            if (statSync(p).isDirectory()) collect(p);
            else if (IS_INPUT(name)) files.push(p);
        }
    })(dir);
    const h = createHash('sha256');
    for (const f of files.sort()) {
        h.update(relative(dir, f).split(sep).join('/'));
        h.update(readFileSync(f));
    }
    return h.digest('hex');
}

/** Every published package: has a package.json, a src/ and a dist/. */
function* packages(root) {
    for (const name of readdirSync(root)) {
        if (SKIP_DIRS.has(name)) continue;
        const dir = join(root, name);
        if (!statSync(dir).isDirectory()) continue;
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))) yield dir;
        else yield* packages(dir);
    }
}

// The stamp CANNOT live inside dist: the build wipes that directory, so the hash
// recorded by the previous run disappears exactly when it would be needed. Root
// level, gitignored, one file per package.
const STAMP_DIR = '.dist-freshness';
mkdirSync(STAMP_DIR, { recursive: true });

const stale = [];
const mtimeOnly = [];
let checked = 0;

for (const dir of packages('packages')) {
    const dist = join(dir, 'dist');
    if (!existsSync(dist)) continue;   // never built here; the build step covers that
    checked++;
    const srcNewest = newestMtime(join(dir, 'src'));
    const distNewest = newestMtime(dist) || statSync(dist).mtimeMs;
    const rel = relative(process.cwd(), dir).split(sep).join('/');
    const stamp = join(STAMP_DIR, rel.replace(/[^a-zA-Z0-9]/g, '_'));
    const hash = srcHash(join(dir, 'src'));

    if (srcNewest > distNewest) {
        // mtime says stale. Believe it only if the CONTENT also moved.
        const recorded = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
        if (recorded === hash) {
            mtimeOnly.push(rel);
            continue;
        }
        const skew = Math.round((srcNewest - distNewest) / 1000);
        stale.push(
            `${rel}  src is ${skew}s newer than dist`
            + (recorded ? ' (and its content changed since the last verified build)' : ' (no recorded hash to compare)'),
        );
        continue;
    }
    // Fresh: record what was verified, so a later mtime-only change is recognisable.
    try { writeFileSync(stamp, `${hash}\n`); } catch { /* read-only checkout: mtime path still applies */ }
}

if (stale.length) {
    console.error(`\n[dist-freshness] ${stale.length} package(s) have a stale dist:\n`);
    for (const s of stale) console.error('  ' + s);
    console.error(
        '\nThe guards that read built output would be validating the OLD artifact, and a'
        + '\nplayground resolving the package from `dist` will fail at runtime on anything'
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
