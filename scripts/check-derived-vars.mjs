/**
 * A CSS custom property is substituted where it is DECLARED. A value that reads
 * another variable is therefore computed once, at the selector that declares it, and
 * everything below merely inherits the result — so a derived value declared only on
 * `:root` cannot follow a master that a subtree overrides.
 *
 * Why a gate. 79 of core's declarations derive from another variable, and all 79 lived
 * in `:root, :host` alone. Two things were broken by that and neither was visible:
 *
 *   - **Per-instance theming did not work.** Setting `--aparte-primary` on one
 *     `<aparte-chat>` moved the send button and nothing else. The avatar, the accent
 *     and the focus ring all kept the root's brass, because those three are derived.
 *     The landing page had to retract a sentence claiming otherwise.
 *   - **Core's own dark theme had the same hole.** `[data-aparte-theme="dark"]`
 *     overrides eight masters and re-declared NONE of the derived layer. Worse, 24 of
 *     the 79 had been patched over with hardcoded dark literals — on a palette the
 *     theme had since left (the Tailwind slate ramp, against aparté's purple-ink), so
 *     code blocks, reasoning, the input and the conversation list rendered in a
 *     different colour family from the rest of the chat. Two owners for one value, and
 *     they had already drifted.
 *
 * Both halves are structural, so both are checked here rather than trusted:
 *
 *   1. Every derived declaration lives in the ANCHORED block — the one whose selector
 *      list names every place a palette can be overridden.
 *   2. The literal block stays NARROW (`:root, :host`). Widening that one instead
 *      looks like the same fix and is not: it would re-declare the light literals on
 *      an `<aparte-chat>` nested in a dark wrapper, where a local declaration beats
 *      the inherited dark value, and the chat would go light.
 *   3. No name is declared in both the derived block and a theme block. One owner.
 *   4. No name is declared twice in the SAME block: the later one wins in silence,
 *      and the first then reads like the value in force without being it.
 *   5. A DECLARED token is referenced without a fallback. The fallback is a second
 *      owner of the same default and drifts from it — 155 had, across 54 names.
 *
 * A note on testing this: jsdom does not resolve `var()`, so no unit test can assert
 * "the avatar follows the primary". The browser proof belongs in `pnpm e2e`; the
 * source-shape invariant belongs here.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync } from 'node:fs';

/**
 * The sheets core ships, in the order `src/index.ts` imports them — which is the order
 * a browser sees, and therefore the only order in which the cascade can be reasoned
 * about. They are analysed CONCATENATED for exactly that reason: the anchored layer
 * lives in theme.css while its responsive overrides live at the end of aparte.css, so
 * a guard reading one file would judge half a rule.
 */
const SHEETS = [
    'packages/core/src/styles/theme.css',
    'packages/core/src/styles/aparte.css',
    'packages/core/src/primitives/select/select.css',
    'packages/core/src/primitives/progress-spinner/progress-spinner.css',
];
/** Same reasoning as ANCHORED_FLOOR: a collapsed reference count is a broken matcher. */
const REF_FLOOR = 500;
/** Global concatenated line index -> `sheet:line`, so a message still points somewhere real. */
const origin = [];

/** Every place a palette can change, and therefore every place the layer re-anchors. */
const ANCHORS = [':root', ':host', '[data-aparte-theme]', '[data-aparte-host]', 'aparte-chat'];
/** The literal palette's own selector list, which must stay exactly this. */
const LITERAL_SELECTORS = [':root', ':host'];
/**
 * Derived declarations inside an `@media` / `@container` are exempt: a responsive
 * override is scoped on purpose, and those derive from DIMENSIONAL masters (spacing,
 * sizes), which no theme overrides. The ceiling is here so that a seventh one is a
 * decision somebody made rather than a line nobody noticed — if it is another
 * responsive size, raise it; if it reads a palette master, it belongs in the
 * anchored block instead.
 */
const AT_RULE_CEILING = 6;
/**
 * If the anchored count collapses, the matcher stopped matching — that is not a clean
 * file. Same reasoning as check-attr-escaping's SEEN_FLOOR.
 */
const ANCHORED_FLOOR = 70;

const lines = [];
for (const sheet of SHEETS) {
    const own = readFileSync(sheet, 'utf8').split(String.fromCharCode(10));
    for (let k = 0; k < own.length; k++) { lines.push(own[k]); origin.push(sheet + ":" + (k + 1)); }
}
const at = (n) => origin[n] ?? '?';

const DECL = /^\s+(--aparte-[a-z0-9-]+)\s*:\s*(.+?);/;
const isDerived = (value) => value.includes('var(--aparte-');

/** Selector list of the rule opening on `i`, gathering the comma-continued lines above. */
function selectorAt(i) {
    const head = lines[i].trim().replace(/\{$/, '').trim();
    const parts = head ? [head] : [];
    for (let k = i - 1; k >= 0 && lines[k].trim().endsWith(','); k--) {
        parts.unshift(lines[k].trim().replace(/,$/, ''));
    }
    return parts.filter(Boolean);
}

const stack = [];
const anchored = [];
const atRuleExempt = [];
const stray = [];
const byBlock = new Map();
const declaredNames = new Set();
const duplicated = new Set();
const blockOf = new Map();
const fallbacks = new Map();
let anchoredSelectors = null;
let literalSelectors = null;

for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.endsWith('{')) {
        const isAtRule = t.startsWith('@');
        const selectors = isAtRule ? [t.replace(/\{$/, '').trim()] : selectorAt(i);
        stack.push({ selectors, isAtRule, key: selectors.join(', ') });
        continue;
    }
    if (t === '}') { stack.pop(); continue; }

    const m = DECL.exec(lines[i]);
    if (!m || !stack.length) continue;
    const [, name, value] = m;
    const top = stack[stack.length - 1];
    const insideAtRule = stack.some((f) => f.isAtRule);

    const scope = stack.map((fr) => fr.key).join(' > ');
    if (blockOf.get(name) === scope) duplicated.add(name);
    blockOf.set(name, scope);
    declaredNames.add(name);
    if (!byBlock.has(top.key)) byBlock.set(top.key, new Set());
    byBlock.get(top.key).add(name);

    const set = new Set(top.selectors);
    if (ANCHORS.every((a) => set.has(a)) && set.size === ANCHORS.length) {
        anchoredSelectors = top.selectors;
        if (isDerived(value)) anchored.push({ name, line: i + 1 });
        else stray.push({ name, line: i + 1, why: 'a LITERAL in the derived block' });
        continue;
    }
    if (LITERAL_SELECTORS.every((a) => set.has(a)) && set.size === LITERAL_SELECTORS.length) {
        literalSelectors = top.selectors;
    }
    if (!isDerived(value)) continue;
    if (insideAtRule) atRuleExempt.push({ name, line: i + 1, where: top.key });
    else stray.push({ name, line: i + 1, why: `derived, but declared on \`${top.key}\`` });
}

const problems = [];

if (!anchoredSelectors) {
    problems.push(
        `no anchored block found. The derived layer must be declared on exactly:\n      ${ANCHORS.join(',\n      ')}`,
    );
}
if (!literalSelectors) {
    problems.push(
        `the literal palette block (\`${LITERAL_SELECTORS.join(', ')}\`) is gone or its selector list changed.\n`
        + '      Widening it is NOT the same fix: it re-declares the light literals on an\n'
        + '      <aparte-chat> nested in a dark wrapper, and the chat goes light.',
    );
}
for (const s of stray) problems.push(`${at(s.line - 1)}  ${s.name} — ${s.why}`);

// One owner: a name in the derived block may not also be declared by a theme block.
if (anchoredSelectors) {
    const derivedNames = byBlock.get(anchoredSelectors.join(', ')) ?? new Set();
    for (const [key, names] of byBlock) {
        if (key === anchoredSelectors.join(', ')) continue;
        if (!key.includes('data-aparte-theme')) continue;
        const both = [...names].filter((n) => derivedNames.has(n));
        if (both.length) {
            problems.push(
                `\`${key}\` re-declares ${both.length} name(s) the derived layer owns: ${both.join(', ')}.\n`
                + '      A theme overrides MASTERS; the derived layer follows them on its own. Two\n'
                + '      owners for one value is how 24 of these ended up on a dead palette.',
            );
        }
    }
}
/**
 * One owner, second half: a name declared TWICE in the same block. The later
 * declaration silently wins, so the earlier one reads like the value in force and
 * is not. Caught the day it was written: `--aparte-select-min-width` already meant
 * `.aparte-model-select` at 120px when a second declaration gave it 200px for the
 * `<aparte-select>` element, which would have widened the model picker with nothing
 * on screen to explain why.
 */
for (const [key, names] of byBlock) {
    const dupes = [...names].filter((n) => duplicated.has(n) && blockOf.get(n).endsWith(key));
    if (dupes.length) {
        problems.push(
            `\`${key}\` declares ${dupes.length} name(s) twice: ${dupes.join(', ')}.\n`
            + '      The later declaration wins and the earlier one is a decoy. Pick one, or\n'
            + '      give the second thing its own name.',
        );
    }
}

/**
 * One owner per value. A `var(--x, fallback)` on a token this sheet also DECLARES
 * states the same default twice, and the two drift: 155 of them had, with
 * `--aparte-border` carrying eleven different fallbacks and `--aparte-primary`
 * falling back to an indigo the palette had left. Since `src/index.ts` imports every
 * sheet in SHEETS, a declared token always resolves and its fallback is dead text.
 * A token this sheet never declares is the opposite case: there the fallback IS the
 * owner — that is the "unset by default" knob, and it stays.
 */
let refs = 0;
for (const sheet of SHEETS) {
    const text = readFileSync(sheet, 'utf8');
    const textLines = text.split('\n');
    for (let i = 0; i < text.length; i++) {
        if (!text.startsWith('var(--aparte-', i)) continue;
        let depth = 0;
        let j = i + 3;
        for (; j < text.length; j++) {
            if (text[j] === '(') depth++;
            else if (text[j] === ')') { depth--; if (!depth) break; }
        }
        const inner = text.slice(i + 4, j);
        const comma = inner.indexOf(',');
        refs++;
        if (comma < 0) continue;
        const name = inner.slice(0, comma).trim();
        if (!fallbacks.has(name)) fallbacks.set(name, new Set());
        fallbacks.get(name).add(inner.slice(comma + 1).trim().replace(/\s+/g, ' '));
        if (!declaredNames.has(name)) continue;
        const line = text.slice(0, i).split('\n').length;
        const decl = textLines.find((l) => l.trim().startsWith(name + ':'));
        problems.push(
            `${sheet}:${line}  ${name} is DECLARED and still carries a fallback.\n`
            + `      Declared as: ${(decl ?? '?').trim()}\n`
            + '      Two owners for one default is how the old palette survived in the fallbacks.',
        );
    }
}
/**
 * One owner, third shape. A token this sheet never declares is owned by its fallback
 * — so every reference has to state the SAME one. Two different fallbacks means two
 * defaults for one knob, and which applies depends on which rule wins. Found the day
 * it was written: a `String.replace` fixed the first `--aparte-select-radius` and
 * left the second, so the element and its dropdown disagreed about their own radius.
 */
for (const [name, fbs] of fallbacks) {
    if (declaredNames.has(name) || fbs.size < 2) continue;
    problems.push(
        `${name} is never declared, so its fallback is its default — but it carries ${fbs.size}:\n`
        + [...fbs].map((f) => `        ${f}`).join('\n')
        + '\n      Pick one, or declare the token and drop the fallbacks.',
    );
}

if (refs < REF_FLOOR) {
    problems.push(
        `only ${refs} var() references scanned across ${SHEETS.length} sheets, floor is ${REF_FLOOR}.\n`
        + '      A collapsed count means the scanner stopped seeing the sheets.',
    );
}

if (atRuleExempt.length > AT_RULE_CEILING) {
    problems.push(
        `${atRuleExempt.length} derived declarations inside an @media/@container, ceiling is ${AT_RULE_CEILING}:\n`
        + atRuleExempt.map((e) => `      ${at(e.line - 1)}  ${e.name}  (${e.where})`).join('\n')
        + '\n      A responsive SIZE is fine — raise the ceiling. A value reading a palette\n'
        + '      master is not: it belongs in the anchored block.',
    );
}
if (anchored.length < ANCHORED_FLOOR) {
    problems.push(
        `only ${anchored.length} derived declarations found in the anchored block, floor is ${ANCHORED_FLOOR}.\n`
        + '      A collapsed count is a matcher that stopped matching, not a clean file.',
    );
}

if (problems.length) {
    console.error(`\n[derived-vars] ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}\n`);
    console.error(
        'A derived value is substituted where it is DECLARED. Declared once on `:root`,\n'
        + 'it cannot follow a master that a subtree overrides — which is why the dark theme\n'
        + 'and per-instance theming both silently kept light values.\n',
    );
    process.exit(1);
}

console.log(
    `[derived-vars] OK: ${anchored.length} derived declarations, all on the ${ANCHORS.length}-anchor layer; `
    + `the literal palette stays on \`${LITERAL_SELECTORS.join(', ')}\`; `
    + `${atRuleExempt.length} responsive exemption(s); ${refs} var() refs, single-owner.`,
);
