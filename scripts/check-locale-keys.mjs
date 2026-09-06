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
 *   4. **Whose string it is.** `AparteLocale` is the closed list of what CORE renders,
 *      and `t()` is typed against it — so a plugin that wants a translatable label has
 *      exactly one place to put its key, and nine keys arrived that way: the artifact
 *      card's six, its two sandbox lines, and the compaction summary's title. They are
 *      right where they are (a locale package translates ONE bag, not one per plugin),
 *      and they are also invisible: nothing distinguished them from core's own words,
 *      so a tenth would have been added by reflex — and every one of them is a name the
 *      frozen surface then holds for two releases. `PLUGIN_OWNED` writes the exception
 *      down, and this guard reads it in both directions: a new plugin-only key has to
 *      join the list deliberately, and a listed key core has started rendering has to
 *      leave it.
 *
 * A key that is DECLARED and read by nothing is not checked here — that one needs a
 * repo-wide textual search, since a key is reached by `t('x')`, by `getLocale().x`,
 * and by a computed lookup, and it lives in `config/__tests__/locale.test.ts` where
 * the corpus can be walked with a floor.
 *
 * The two corpora are `core/src` and each `plugins/<name>/src`, so assertion 4 attributes
 * a key to core or to a plugin and to nothing else: a declared key rendered ONLY from a
 * provider or a wrapper falls in neither and passes in silence. Measured, not assumed —
 * the one such read today is the four wrappers' `t('loadingConversation')`, and core's
 * viewport renders that key too, so the attribution is right. The dead-key half is covered
 * anyway by `config/__tests__/locale.test.ts`, which walks a wider corpus. Widen these two
 * the day a wrapper or a provider owns a word core does not draw.
 *
 * SEEN floors, because a guard that stops matching reports zero violations and looks
 * exactly like a clean tree. Two other guards in this repo were found decorative that
 * way.
 *
 * Run with `node scripts/check-locale-keys.mjs`. Reads SOURCE only — no build
 * required, so it can sit anywhere in the chain once it is wired into `pnpm gate`.
 *
 * `--locale <file>` and `--sources <dir>` move the two inputs, so the ownership rules can
 * be exercised over a doctored locale and a doctored corpus instead of being described —
 * which is what `scripts/__tests__/check-locale-keys.test.ts` does. Two things follow from
 * a fixture. The floors are skipped whenever either flag is given: a fixture is smaller
 * than the tree by construction, and a floor measured on the tree would only ever fire
 * there. And `--locale` also stands the French mirror down, because the mirror compares
 * `@aparte/locale-fr` against what core DECLARES: hold three fixture keys up to 91 real
 * translations and it reports 90 findings around the one that matters.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function flag(name) {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1] ?? null;
}
const localeFlag = flag('--locale');
const sourcesFlag = flag('--sources');
/** A doctored input: the floors below describe the real tree and would only misfire. */
const DOCTORED = localeFlag !== null || sourcesFlag !== null;
/** A doctored declared list: `@aparte/locale-fr` mirrors core's, so it has nothing to mirror. */
const DOCTORED_LOCALE = localeFlag !== null;

const LOCALE = resolve(root, localeFlag ?? 'packages/core/src/config/locale.ts');
/** Holds `core/src` and each plugin's `src` — the two corpora, kept apart on purpose. */
const PACKAGES = resolve(root, sourcesFlag ?? 'packages');
const FR = join(root, 'packages/locales/fr/src/index.ts');

/**
 * Below these, the matcher broke rather than the tree being clean. Measured in the order
 * the two constants come, because the line drifted once already: 82 reads, 91 keys, and
 * 91 of them translated in `@aparte/locale-fr`.
 */
const READ_FLOOR = 60;
const KEY_FLOOR = 75;

/**
 * Declared in `AparteLocale`, rendered by a plugin and by no core file — and allowed to
 * be. The locale is one flat bag every package shares, so a locale author translates a
 * single object and `@aparte/locale-fr` needs no companion per plugin; that is the whole
 * reason these live in core's list. Each line names the package that renders it, because
 * the day core starts rendering one, this list is what has to give way (assertion 4
 * says so, in both directions).
 */
const PLUGIN_OWNED = new Set([
    'compactionSummaryTitle', // @aparte/plugin-compaction — the summary message's title
    'download', // @aparte/plugin-artifacts — the card's download button
    'preview', // @aparte/plugin-artifacts — the card's two tabs
    'code',
    'generating', // @aparte/plugin-artifacts — a binary artifact in flight, then rebuilt
    'rebuildingPreview',
    'previewPending', // @aparte/plugin-artifacts — the preview pane before anyone presses it
    'sandboxError', // @aparte/plugin-artifacts — a sandbox run that failed, and its hint
    'sandboxErrorHint',
]);

/**
 * `tag` has no default on purpose: `undefined` means "follow the browser", which is
 * the right default for a library. Anything else added here needs the same kind of
 * sentence — a key with no value renders an empty string.
 */
// `tag` and `direction` are undefined on purpose: "follow the host" — a locale that pins them
// writes `lang` and `dir`; the default writes neither.
const NO_DEFAULT = new Set(['tag', 'direction']);

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

if (!DOCTORED && declared.size < KEY_FLOOR) {
    problems.push(
        `read only ${declared.size} keys from AparteLocale (floor ${KEY_FLOOR}). The interface moved or `
        + 'the matcher broke — every comparison below would be judging a fraction of the locale.',
    );
}

// ── the two corpora ──────────────────────────────────────────────────────────
const ts = (dir) => (existsSync(dir) ? walk(dir).filter((f) => /\.tsx?$/.test(f)) : []);
const coreSources = ts(join(PACKAGES, 'core/src'));
const pluginSources = (existsSync(join(PACKAGES, 'plugins')) ? readdirSync(join(PACKAGES, 'plugins')) : [])
    .flatMap((p) => ts(join(PACKAGES, 'plugins', p, 'src')));

// ── 1. every t('literal') names a declared key ───────────────────────────────
let reads = 0;
for (const file of [...coreSources, ...pluginSources]) {
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
if (!DOCTORED && reads < READ_FLOOR) {
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
// Skipped under `--locale`: the mirror asks whether fr translates what CORE declares, and
// a fixture's list is not what core declares.
if (!DOCTORED_LOCALE) {
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
}

// ── 4. whose string it is: core renders it, or PLUGIN_OWNED names the plugin ──
/**
 * Which declared keys a corpus renders. Three shapes reach a string — `cfg.t('x')`,
 * `getLocale().x`, and the `const locale = …getLocale()` alias core writes everywhere —
 * and all three count, because a key core reads only through the alias is still core's.
 * Tests are left out: asserting on a plugin's label is not core rendering it.
 */
function rendered(files) {
    const found = new Map();
    for (const file of files) {
        if (/__tests__|\.test\.tsx?$/.test(file)) continue;
        const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const keys = [
            ...[...text.matchAll(/\.t\(\s*(['"])([a-zA-Z]\w*)\1\s*\)/g)].map((m) => m[2]),
            ...[...text.matchAll(/(?:getLocale\(\)|\blocale|\bloc)\s*\??\.\s*([a-zA-Z]\w*)/g)].map((m) => m[1]),
        ];
        for (const key of keys) {
            if (!declared.has(key)) continue;
            if (!found.has(key)) found.set(key, new Set());
            found.get(key).add(file.slice(PACKAGES.length + 1).replace(/\\/g, '/'));
        }
    }
    return found;
}
const byCore = rendered(coreSources);
const byPlugins = rendered(pluginSources);

for (const [key, where] of byPlugins) {
    if (byCore.has(key) || PLUGIN_OWNED.has(key)) continue;
    problems.push(
        `${key} is declared in AparteLocale and no core file renders it — only ${[...where].join(', ')}. `
        + 'AparteLocale is the closed list of the strings CORE draws, and a frozen name leaves in two '
        + "releases: render it in core, read it off getLocale() in the plugin, or add it to PLUGIN_OWNED "
        + 'with the package that owns it.',
    );
}
for (const key of PLUGIN_OWNED) {
    if (!byCore.has(key)) continue;
    problems.push(
        `${key} is listed in PLUGIN_OWNED and core now renders it (${[...byCore.get(key)].join(', ')}). `
        + 'The exception has outlived its reason — remove it from PLUGIN_OWNED.',
    );
}

// ── report ───────────────────────────────────────────────────────────────────
if (problems.length) {
    console.error('[check-locale-keys] the locale lists disagree:\n');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
}
// The mirror is named only when it ran: a count of the real French bundle beside a
// fixture's key count would read as agreement between two lists never compared.
const mirror = DOCTORED_LOCALE ? '' : `, ${french.size} translated in @aparte/locale-fr`;
console.log(`[check-locale-keys] OK — ${declared.size} keys, ${reads} t('…') reads${mirror}.`);
