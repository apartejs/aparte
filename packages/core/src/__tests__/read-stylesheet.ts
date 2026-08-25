import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Read `styles/aparte.css` as text, for the tests that assert on the stylesheet.
 *
 * Three suites need it — the composer toolbar's row, the tool-call row and the artifact
 * card's tab row — which is the threshold this repo sets for extracting a helper. The
 * last two arrived when their renderers stopped shipping CSS from `getStyles()`.
 *
 * Resolved by walking up from the cwd rather than from `import.meta.url`: under Vite
 * that is an http URL, not a file one, so `readFileSync` on it throws "The URL must be
 * of scheme file". The cwd also differs between `pnpm test` at the root and
 * `nx test @aparte/core` in the package, hence two candidate paths per level.
 *
 * What these suites can and cannot prove: jsdom does not resolve `var()` or apply a
 * stylesheet it was never given, so no unit test here asserts a computed colour. They
 * assert that a rule EXISTS and names what it claims to style — the source-shape half.
 * The rendered half belongs to `pnpm e2e`.
 */
export function readAparteStylesheet(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const rel of ['packages/core/src/styles/aparte.css', 'src/styles/aparte.css']) {
            const candidate = join(dir, rel);
            if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
        }
    }
    throw new Error(`aparte.css not found from ${process.cwd()}`);
}
