/**
 * Is a package's `dist/` older than the `src/` it was built from?
 *
 * The rule and its subtleties live here, in ONE place, because three guards need the
 * answer and a second implementation of it would be wrong in the specific way the first
 * one already learned not to be:
 *
 *   **mtime is not content.** A `git checkout`, a branch switch or a restored backup
 *   bumps an mtime while leaving the bytes identical. nx correctly does not rebuild, and
 *   a naive mtime comparison cries stale. That happened twice, on files whose content had
 *   not changed at all. So mtime is the fast path only: when it says stale, the src
 *   inputs are hashed and compared against the hash recorded the last time the package
 *   was verified fresh, in a gitignored `.dist-freshness/` at the repo ROOT (not inside
 *   `dist`, which the build wipes — the first attempt put it there and the stamp
 *   vanished exactly when it was needed). With no recorded hash — a fresh clone — it
 *   falls back to mtime alone, which is the conservative answer and the one CI wants,
 *   since CI always builds first.
 *
 * `check-dist-freshness.mjs` is the repo-wide gate step. `check-node-barrel-types.mjs`
 * and `check-node-import.mjs` call this for the packages THEY read, because both are run
 * standalone by contributors and both return a meaningless green against a stale build —
 * measured: a deliberate sabotage passed both in source and failed both the moment the
 * package was rebuilt.
 */
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '.svelte-kit']);
const IS_INPUT = (name) => /\.(ts|tsx|css|svelte|vue|json)$/.test(name) && !/\.test\.ts$/.test(name);
const STAMP_DIR = '.dist-freshness';

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

/** Every published package under `root`: has a package.json and a src/. */
export function* packageDirs(root = 'packages') {
    for (const name of readdirSync(root)) {
        if (SKIP_DIRS.has(name)) continue;
        const dir = join(root, name);
        if (!statSync(dir).isDirectory()) continue;
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))) yield dir;
        else yield* packageDirs(dir);
    }
}

/**
 * Freshness for the given package directories (default: all of them).
 *
 * Returns `{ checked, stale, mtimeOnly }` — `stale` holds a human sentence per package,
 * `mtimeOnly` the names whose mtime moved with identical content. `record` writes the
 * verified hash; the repo-wide gate step does that, the narrower callers do not, so a
 * scoped run cannot stamp a package it did not fully consider.
 */
export function distFreshness({ dirs, record = false } = {}) {
    const stale = [];
    const mtimeOnly = [];
    let checked = 0;
    if (record) mkdirSync(STAMP_DIR, { recursive: true });

    for (const dir of dirs ?? packageDirs()) {
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
            if (recorded === hash) { mtimeOnly.push(rel); continue; }
            const skew = Math.round((srcNewest - distNewest) / 1000);
            stale.push(
                `${rel}  src is ${skew}s newer than dist`
                + (recorded ? ' (and its content changed since the last verified build)' : ' (no recorded hash to compare)'),
            );
            continue;
        }
        // Fresh: record what was verified, so a later mtime-only change is recognisable.
        if (record) {
            try { writeFileSync(stamp, `${hash}\n`); } catch { /* read-only checkout: mtime path still applies */ }
        }
    }
    return { checked, stale, mtimeOnly };
}
