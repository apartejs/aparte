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
const SHEETS = [
    'theme', 'base', 'button', 'field', 'display', 'surface', 'shell', 'bubble', 'composer', 'segment',
    'artifact', 'elicitation', 'conversation', 'prose', 'responsive',
];
/** Below this, the corpus has collapsed and every assertion below is vacuous. */
const MIN_LINES = 2500;

export function readAparteStylesheet(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core/src/styles', 'src/styles']) {
            const base = join(dir, root);
            if (!existsSync(join(base, 'theme.css'))) continue;
            const text = SHEETS
                .map((name) => join(base, name + '.css'))
                .filter((p) => existsSync(p))
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
