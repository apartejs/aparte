import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Read core's stylesheets as one text, for the tests that assert on them.
 *
 * Three suites need it — the composer toolbar's row, the tool-call row and the artifact
 * card's tab row — which is the threshold this repo sets for extracting a helper. The
 * last two arrived when their renderers stopped shipping CSS from `getStyles()`.
 *
 * It used to read `styles/aparte.css` alone, and the day that file was split by family
 * all three suites went red at once — not because a rule had changed, but because the
 * helper located its corpus by a single path. Same failure the docs generator hit the
 * same hour. So it reads the whole `styles/` set now, in import order, and asserts a
 * FLOOR: a corpus that silently shrinks is the thing worth catching.
 *
 * Resolved by walking up from the cwd rather than from `import.meta.url`: under Vite
 * that is an http URL, not a file one, so `readFileSync` on it throws "The URL must be
 * of scheme file". The cwd also differs between `pnpm test` at the root and
 * `nx test @aparte/core` in the package, hence two candidate roots per level.
 *
 * What these suites can and cannot prove: jsdom does not resolve `var()` or apply a
 * stylesheet it was never given, so no unit test here asserts a computed colour. They
 * assert that a rule EXISTS and names what it claims to style — the source-shape half.
 * The rendered half belongs to `pnpm e2e`.
 */
/**
 * The sheets, DERIVED from `src/index.ts`'s import block rather than listed here.
 *
 * This was a hand-written list, and it had already fallen three sheets behind —
 * `display/icon`, `primitives/select`, `primitives/progress-spinner` — which is 308
 * lines of CSS these suites were silently blind to. Nothing went red, because a missing
 * name is simply absent from the concatenation and the total stayed far above the
 * floor: a future assertion about `.aparte-icon` would just have failed while the rule
 * demonstrably existed.
 *
 * It was the last copy of a list `scripts/core-stylesheets.mjs` already derives for the
 * guard and the docs generator, for exactly this reason. It is read here rather than
 * imported because that helper resolves paths from its own location, and this file has
 * to work from two different working directories (see below).
 */
const SHEET_FLOOR = 30;
function sheetsFrom(coreSrc: string): string[] {
    const entry = join(coreSrc, 'index.ts');
    const names = [...readFileSync(entry, 'utf8').matchAll(/^import\s+'\.\/(styles\/[^']+)\.css';/gm)].map(
        (m) => m[1].slice('styles/'.length),
    );
    if (names.length < SHEET_FLOOR) {
        throw new Error(
            `read-stylesheet: read only ${names.length} sheet imports from ${entry}, floor is ${SHEET_FLOOR}. ` +
                'The imports moved or the matcher broke; either way every assertion below would be judging ' +
                'a fraction of the CSS.',
        );
    }
    return names;
}
/** Below this, the corpus has collapsed and every assertion below is vacuous. */
const MIN_LINES = 2500;

export function readAparteStylesheet(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core/src/styles', 'src/styles']) {
            const base = join(dir, root);
            if (!existsSync(join(base, 'theme.css'))) continue;
            const text = sheetsFrom(dirname(base))
                .map((name) => join(base, name + '.css'))
                .map((p) => readFileSync(p, 'utf8'))
                .join('\n');
            const lines = text.split('\n').length;
            if (lines < MIN_LINES) {
                throw new Error(
                    `core's stylesheets read as only ${lines} lines from ${base}, floor is ${MIN_LINES}. `
                    + 'A sheet was renamed or moved and this helper stopped seeing it.',
                );
            }
            return text;
        }
    }
    throw new Error(`core's styles/ not found from ${process.cwd()}`);
}

/**
 * The `@aparte/core` package directory — the one that holds `src/` — from either working
 * directory. Thirty-five stylesheet suites resolved their sheets from `process.cwd()`
 * and were green under `nx test @aparte/core` (cwd = the package) and red under the
 * root `pnpm test` (cwd = the repo), which is the run the gate makes: nine of them
 * failed to even load. Same walk as above, one answer, so `resolve(coreRoot(), 'src/…')`
 * reads the same file from both places.
 */
export function coreRoot(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core', '.']) {
            const base = join(dir, root);
            if (existsSync(join(base, 'src', 'styles', 'theme.css'))) return base;
        }
    }
    throw new Error(`core's package directory not found from ${process.cwd()}`);
}
