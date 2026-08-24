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
 *
 * A note on testing this: jsdom does not resolve `var()`, so no unit test can assert
 * "the avatar follows the primary". The browser proof belongs in `pnpm e2e`; the
 * source-shape invariant belongs here.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync } from 'node:fs';

const FILE = 'packages/core/src/styles/aparte.css';

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

const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

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
for (const s of stray) problems.push(`${FILE}:${s.line}  ${s.name} — ${s.why}`);

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
if (atRuleExempt.length > AT_RULE_CEILING) {
    problems.push(
        `${atRuleExempt.length} derived declarations inside an @media/@container, ceiling is ${AT_RULE_CEILING}:\n`
        + atRuleExempt.map((e) => `      ${FILE}:${e.line}  ${e.name}  (${e.where})`).join('\n')
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
    + `${atRuleExempt.length} responsive exemption(s).`,
);
