/**
 * The sheets core ships, in the order `packages/core/src/index.ts` imports them.
 *
 * That order IS the cascade — it is the order a browser sees — so anything reasoning
 * about core's CSS has to read them in it, concatenated: the anchored token layer lives
 * in `theme.css` while its responsive overrides live in `responsive.css`, and a reader
 * that took one file at a time would judge half a rule.
 *
 * DERIVED, not listed. Two readers used to keep a copy of this list by hand and both
 * drifted the moment a sheet was added: the derived-var guard had the two primitive
 * sheets but not `display/icon.css`, and the docs' variable generator had neither — so
 * 269 lines of declarations were missing from the public reference and nobody was told.
 * A list that must be kept equal to an import block is a list that will not be. Reading
 * the import block removes the possibility.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'packages/core/src/index.ts');

/** A floor, not decoration: a corpus that silently shrinks is the failure worth catching. */
const SHEET_FLOOR = 30;

/**
 * @param {boolean} [absolute] - absolute paths (default), or repo-relative for messages.
 * @returns {string[]} every `.css` `index.ts` imports, in import order.
 */
export function coreStylesheets(absolute = true) {
    const entry = readFileSync(ENTRY, 'utf8');
    const rel = [...entry.matchAll(/^import\s+'(\.\/[^']+\.css)';/gm)].map((m) => m[1]);
    if (rel.length < SHEET_FLOOR) {
        throw new Error(
            `[core-stylesheets] read only ${rel.length} sheet imports from packages/core/src/index.ts, ` +
                `floor is ${SHEET_FLOOR}. Either the imports moved out of that file, or the matcher broke — ` +
                `both mean every reader downstream is now judging a fraction of the CSS.`,
        );
    }
    return rel.map((p) => {
        const full = resolve(ROOT, 'packages/core/src', p.slice(2));
        return absolute ? full : 'packages/core/src/' + p.slice(2);
    });
}
