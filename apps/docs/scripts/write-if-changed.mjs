/**
 * Write a generated file only when its bytes actually change.
 *
 * ## Why this exists
 *
 * Seven generators feed this site and `pnpm gen` runs six of them before every
 * `astro dev` and `astro build`. All of them wrote unconditionally, so every build
 * bumped the mtime of every generated page — and four of those pages live INSIDE the
 * content collection, where a file that changes after the loader has synced makes
 * Starlight log:
 *
 *     [starlight-docs-loader] Duplicate id "reference/api" found in …
 *     Later items with the same id will overwrite earlier ones.
 *
 * It moved between pages from build to build (`reference/api` one run,
 * `reference/css-variables` the next) precisely because it is a race with the sync,
 * not a property of any one page. Harmless in the end — the later item is the same
 * content — but it is a warning nobody can act on, printed on every build, which is
 * the kind of noise that teaches people to stop reading warnings.
 *
 * A no-op write is also the difference between `astro dev` reloading and not: an
 * unchanged page should not restart anything.
 *
 * Content-addressed rather than time-addressed on purpose: comparing mtimes would
 * ask the filesystem a question about clocks, and comparing bytes asks the only
 * question that matters. `null` from a failed read (no file yet, unreadable) writes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @param {string} path        destination
 * @param {string | Buffer} content  what the generator produced
 * @returns {boolean}          true when it was written, false when it was already right
 */
export function writeIfChanged(path, content) {
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    let current = null;
    try {
        current = readFileSync(path);
    } catch {
        // No file yet, or unreadable — either way, write.
    }
    if (current !== null && current.equals(next)) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
    return true;
}

/** `wrote ? 'wrote' : 'unchanged'`, for a generator's one-line log. */
export const wroteOrNot = (wrote) => (wrote ? 'wrote' : 'unchanged');
