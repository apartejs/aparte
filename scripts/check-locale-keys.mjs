#!/usr/bin/env node
/**
 * The locale's two lists have to agree: what core READS, and what core DECLARES.
 *
 * WHY THIS EXISTS. `AparteConfig.t(key: keyof AparteLocale)` looks airtight, and for
 * years it was not: the type ended with `[key: string]: string | undefined`, so
 * `keyof` widened to `string` and every literal typechecked. An audit planted
 * `t('copy') -> t('copyCodeBlock')` as a deliberate mistake and nothing saw it —
 * `tsc --noEmit` exited 0, `t()` returned `''` at runtime, and the UI rendered an
 * empty label with no error, no warning, nothing to notice. The type is closed now
 * (`AparteLocaleExtensions` carries the open half), which is the real fix and the one
 * that runs on every commit through the pre-commit hook.
 *
 * This is the second layer, and it is not redundant with the type. It reaches three
 * places the compiler does not:
 *
 *   1. **Casts.** `cfg.t(key as never)` is how a status table looks a word up by a
 *      computed key. The cast is legitimate; it also disables the check for every
 *      literal that flows into it, and the plugins reach `t()` the same way.
 *   2. **The mirror, in the direction TypeScript cannot see.** Every locale key is
 *      optional, so a French bundle that MISSES one compiles perfectly and ships a
 *      string in the wrong language — `t()` silently falls through to
 *      `APARTE_DEFAULT_LOCALE`, which is English. Excess-property checking catches
 *      the other direction; nothing catches this one.
 *   3. **A declared key with no default.** `t()` returns `''` for a key nothing gives
 *      a value to, and an empty `aria-label` is the failure that is invisible on
 *      screen. `tag` is the one deliberate exception (see its JSDoc: `undefined`
 *      means "follow the browser").
 *
 * A key that is DECLARED and read by nothing is not checked here — that one needs a
 * repo-wide textual search, since a key is reached by `t('x')`, by `getLocale().x`,
 * and by a computed lookup, and it lives in `config/__tests__/locale.test.ts` where
 * the corpus can be walked with a floor.
 *
 * SEEN floors, because a guard that stops matching reports zero violations and looks
 * exactly like a clean tree. Two other guards in this repo were found decorative that
 * way.
 *
 * Run with `node scripts/check-locale-keys.mjs`. Reads SOURCE only — no build
 * required, so it can sit anywhere in the chain once it is wired into `pnpm gate`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE = join(root, 'packages/core/src/config/locale.ts');
const FR = join(root, 'packages/locales/fr/src/index.ts');

/** Below these, the matcher broke rather than the tree being clean. Measured: 78 / 88 / 88. */
const READ_FLOOR = 60;
const KEY_FLOOR = 75;

/**
 * `tag` has no default on purpose: `undefined` means "follow the browser", which is
 * the right default for a library. Anything else added here needs the same kind of
 * sentence — a key with no value renders an empty string.
 */
const NO_DEFAULT = new Set(['tag']);

const problems = [];

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

/** Keys at one indent level inside a block, which is how both files are written. */
function keysIn(text, from, to) {
    const block = text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);
    return new Set([...block.matchAll(/^ {4}([a-zA-Z]\w*)\??:/gm)].map((m) => m[1]));
}

// ── the two lists ────────────────────────────────────────────────────────────
const localeSrc = readFileSync(LOCALE, 'utf8');
const declared = keysIn(localeSrc, 'export type AparteLocale = {', 'export type AparteLocaleExtensions');
const defaults = keysIn(localeSrc, 'APARTE_DEFAULT_LOCALE: AparteLocale = {');
const french = keysIn(readFileSync(FR, 'utf8'), 'export const fr');

if (declared.size < KEY_FLOOR) {
    problems.push(
        `read only ${declared.size} keys from AparteLocale (floor ${KEY_FLOOR}). The interface moved or `
        + 'the matcher broke — every comparison below would be judging a fraction of the locale.',
    );
}

// ── 1. every t('literal') names a declared key ───────────────────────────────
const sources = [
    join(root, 'packages/core/src'),
    ...readdirSync(join(root, 'packages/plugins'))
        .map((p) => join(root, 'packages/plugins', p, 'src'))
        .filter((p) => existsSync(p)),
].flatMap((dir) => walk(dir)).filter((f) => /\.tsx?$/.test(f));

let reads = 0;
for (const file of sources) {
    // Block comments stripped: an `@example` showing `t('someKey')` documents a
    // consumer's own key, not a call this package makes.
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of text.matchAll(/\.t\(\s*(['"])([a-zA-Z]\w*)\1\s*\)/g)) {
        reads++;
        if (!declared.has(match[2])) {
            problems.push(
                `${file.slice(root.length + 1)}: t('${match[2]}') names no key in AparteLocale. `
                + "t() returns '' for it, so the label renders empty with no error.",
            );
        }
    }
}
if (reads < READ_FLOOR) {
    problems.push(
        `found only ${reads} t('…') reads across core + plugins (floor ${READ_FLOOR}). `
        + 'The call shape changed and this guard is now checking almost nothing.',
    );
}

// ── 2. every declared key has a default ──────────────────────────────────────
for (const key of declared) {
    if (!defaults.has(key) && !NO_DEFAULT.has(key)) {
        problems.push(
            `${key} is declared in AparteLocale and absent from APARTE_DEFAULT_LOCALE. `
            + "t() returns '' for it — add a default, or add it to NO_DEFAULT with the reason.",
        );
    }
}
for (const key of defaults) {
    if (!declared.has(key)) {
        problems.push(
            `${key} has a default but is not declared in AparteLocale. A locale author meets it `
            + 'through no type and no JSDoc, and t() cannot name it.',
        );
    }
}

// ── 3. the mirror, both ways ─────────────────────────────────────────────────
if (french.size < KEY_FLOOR) {
    problems.push(`read only ${french.size} keys from @aparte/locale-fr (floor ${KEY_FLOOR}).`);
}
for (const key of declared) {
    if (NO_DEFAULT.has(key)) continue;
    if (!french.has(key)) {
        problems.push(
            `@aparte/locale-fr does not translate ${key}. Every key is optional, so this compiles — `
            + 'and t() falls through to the English default, in the middle of a French page.',
        );
    }
}
for (const key of french) {
    if (!declared.has(key) && !NO_DEFAULT.has(key)) {
        problems.push(
            `@aparte/locale-fr translates ${key}, which core declares nowhere. Either the key was `
            + 'removed from AparteLocale and the mirror was not, or it is a typo nothing will read.',
        );
    }
}

// ── report ───────────────────────────────────────────────────────────────────
if (problems.length) {
    console.error('[check-locale-keys] the locale lists disagree:\n');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
}
console.log(
    `[check-locale-keys] OK — ${declared.size} keys, ${reads} t('…') reads, `
    + `${french.size} translated in @aparte/locale-fr.`,
);
