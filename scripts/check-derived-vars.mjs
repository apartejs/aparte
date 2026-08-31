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
 *   6. A token referenced with NO fallback is declared somewhere, or written from JS.
 *      This was the hole in rule 5: the scan returned the moment there was no comma, so
 *      all three ownership rules keyed off the fallback and a bare `var(--typo)` — which
 *      owns nothing, resolves to nothing and drops the whole declaration in silence —
 *      was never compared against the declared set at all.
 *   7. Every class core and the plugins EMIT is prefixed `aparte-` (or `language-`,
 *      which is the highlighters' name, not ours). CLAUDE.md has stated this as policy
 *      for a long time and no guard read it. Core is light DOM: an unprefixed rule is a
 *      global rule in the consumer's page.
 *   8. Every `.aparte-…` rule in a SEGMENT sheet is emitted by some source. That family
 *      styles markup core's own renderers build, so an orphan is a rename done on one
 *      side only. The recipe kit (`display/`, `surface/`, `button`, `field`) is
 *      deliberately outside this: those classes exist for a consumer to wear.
 *
 * A note on testing this: jsdom does not resolve `var()`, so no unit test can assert
 * "the avatar follows the primary". The browser proof belongs in `pnpm e2e`; the
 * source-shape invariant belongs here.
 *
 * Run by `pnpm gate`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { coreStylesheets } from './core-stylesheets.mjs';

/**
 * The sheets core ships, in the order `src/index.ts` imports them — which is the order
 * a browser sees, and therefore the only order in which the cascade can be reasoned
 * about. They are analysed CONCATENATED for exactly that reason: the anchored layer
 * lives in theme.css while its responsive overrides live at the end of aparte.css, so
 * a guard reading one file would judge half a rule.
 */
const SHEETS = coreStylesheets(false);
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
 *
 * Raised 6 -> 7 on 2026-08-28: the bubble's action bar joins the coarse-pointer block
 * (`--aparte-action-bar-btn-size`, a size read from `--aparte-touch-target-size`), the
 * one control that block had left at 28px.
 *
 * Raised 7 -> 8 on 2026-08-29: the split's seam joins the coarse-pointer block
 * (`--aparte-split-hit-area`, a size read from `--aparte-touch-target-size`) — a
 * responsive SIZE, which is the case this exemption exists for.
 */
const AT_RULE_CEILING = 9; // #56 split --aparte-message-padding into -block/-inline: one responsive size became two
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

/**
 * A declaration SCOPED TO AN ELEMENT is not the failure this guard exists for.
 *
 * That failure is a derived token declared at the ROOT: substituted once, there, it
 * cannot follow a palette a subtree overrides. A declaration on a component's own
 * selector is substituted AT THAT ELEMENT, so it follows by construction —
 * `--aparte-btn-intent: var(--aparte-primary)` on `.aparte-btn--primary` reads
 * whatever primary is in force at that button, dark theme and per-instance override
 * included.
 *
 * The rule started narrower — the token name had to be prefixed by the component the
 * selector named — and three real cases showed that was wrong, all of them the same
 * shape: a component ADOPTING a shared recipe parameterises it from its own element.
 * `.aparte-tool-spinner` sizing `.aparte-spinner`, `.aparte-elic-option` tightening
 * `.aparte-field-choice`. That is the mechanism the recipes are built on, not a
 * loophole, and forbidding it would have pushed those values back into duplicated
 * rules — the thing the recipes removed.
 *
 * `:root` and `:host` stay checked, which is where the original bug lived.
 */
function scopedToAnElement(selectors) {
    return selectors.length > 0 && selectors.every((sel) => !/^\s*(:root|:host)\b/.test(sel));
}

const stack = [];
const anchored = [];
const atRuleExempt = [];
const stray = [];
const byBlock = new Map();
const declaredNames = new Set();
/**
 * Declared where EVERY element can resolve it — a `:root`-rooted block, so the literal
 * palette or the anchored layer. Only these forbid a fallback elsewhere.
 *
 * The distinction is not pedantry. `--aparte-spinner-size` was declared on
 * `.aparte-spinner` alone, and the single-owner rule then flagged the fallback that
 * `<aparte-progress-spinner>` — which does not wear that class, and therefore inherits
 * nothing — was relying on. Removing it collapsed the element to `auto`. A
 * component-scoped declaration is not a default; it is a value for that component.
 */
const globallyDeclared = new Set();
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
    if (top.selectors.some((sel) => sel.trim().startsWith(':root'))) globallyDeclared.add(name);
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
    if (!insideAtRule && scopedToAnElement(top.selectors)) continue;
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
/**
 * `var(--x)` with NO fallback, naming a token no sheet declares. name -> `sheet:line`s.
 *
 * The hole this closes was measured, not imagined: the loop below used to `continue`
 * the moment there was no comma, so a bare reference was counted and then dropped
 * without ever being compared against `declaredNames`. All three ownership rules key
 * off the FALLBACK, so a name that owns nothing was invisible to every one of them. The
 * consequence in the browser is total silence — the declaration is invalid at
 * computed-value time and the property drops to `initial`, so an element renders
 * unstyled and 1817 references still report "single-owner".
 */
const bareUndeclared = new Map();
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
        if (comma < 0) {
            const bare = inner.trim();
            // The shape test also keeps CSS COMMENTS out: this file's own prose says
            // `var(--aparte-*)`, and an asterisk is not a token name.
            if (/^--aparte-[a-z0-9-]+$/.test(bare) && !declaredNames.has(bare)) {
                if (!bareUndeclared.has(bare)) bareUndeclared.set(bare, []);
                bareUndeclared.get(bare).push(`${sheet}:${text.slice(0, i).split('\n').length}`);
            }
            continue;
        }
        const name = inner.slice(0, comma).trim();
        if (!fallbacks.has(name)) fallbacks.set(name, new Set());
        fallbacks.get(name).add(inner.slice(comma + 1).trim().replace(/\s+/g, ' '));
        if (!globallyDeclared.has(name)) continue;
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

const CSSPROP_SOURCES = [
    'packages/core/src',
    'packages/plugins',
];
/**
 * Every `.ts` under `CSSPROP_SOURCES`. Read once and shared: three rules below walk the
 * same corpus (the `@cssprop` tags, the tokens written from JS, and the classes core and
 * the plugins emit), and three copies of one walk is three chances for them to disagree
 * about what "core's source" means.
 */
const cssPropFiles = [];
{
    const stack = [...CSSPROP_SOURCES];
    while (stack.length) {
        const p = stack.pop();
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) {
            for (const e of readdirSync(p)) {
                if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
                stack.push(p + '/' + e);
            }
        } else if (/[.]ts$/.test(p) && !/[.]test[.]ts$/.test(p)) {
            cssPropFiles.push(p);
        }
    }
}

const cssPropDeclared = new Map();
for (const f of cssPropFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(/@cssprop\s+\[?(--aparte-[\w-]+)/g)) {
        if (!cssPropDeclared.has(m[1])) cssPropDeclared.set(m[1], f);
    }
}

/**
 * One owner, fourth shape — and the one that owns NOTHING.
 *
 * A token written from JS is legitimately undeclared in CSS: `--aparte-split-position`
 * and friends are set with `style.setProperty` at runtime, so a sheet reading one with
 * no fallback is reading a value the element writes. Those are collected from the
 * source rather than listed here, for the same reason the `@cssprop` rule walks the
 * source: a hand-kept list of four names is a list that will be five.
 */
const JS_WRITTEN = new Set();
for (const file of cssPropFiles) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/setProperty\(\s*['"`](--aparte-[a-z0-9-]+)/g)) JS_WRITTEN.add(m[1]);
}
for (const [name, where] of [...bareUndeclared].sort()) {
    if (JS_WRITTEN.has(name)) continue;
    problems.push(
        `${where[0]}  ${name} is read with NO fallback and declared nowhere.\n`
        + `      ${where.length} reference(s): ${where.join(', ')}\n`
        + '      The declaration is invalid at computed-value time, so the property drops to\n'
        + '      `initial` and the element renders unstyled — in total silence. Declare the\n'
        + '      token, give the reference a fallback, or fix the name.',
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

/*
 * Keyframes: every animation names one that exists, and no keyframe is declared twice
 * or left unused.
 *
 * Added because this failure mode is SILENT in both directions. `.aparte-icon-spin` was
 * put on the `loading` glyph and no keyframe of that name was ever written, so core's
 * own loading icon simply sat still — no error, no warning, nothing to notice unless
 * you happened to watch it. And in the other direction the library had accumulated
 * three byte-identical rotations under three names plus a fourth, `tool-spin`, that
 * nothing used and that — being unprefixed — would have shadowed a rule of the same
 * name on the consumer's page.
 *
 * `animation-name` is checked too, not just the `animation` shorthand: the shorthand is
 * what the library happens to use today, and a guard that only reads today's spelling
 * stops guarding the moment someone writes the other one.
 */
/*
 * `styles/bundle.css` lists the same sheets, in the same order, for the `./styles.css`
 * export's source variant — and it is the ONE list that cannot derive itself, because
 * it is plain CSS that a bundler reads. So it is asserted instead.
 *
 * It had already fallen a sheet behind (`display/icon.css`) with no symptom anywhere a
 * developer looks: everything built, every test passed, and the only thing wrong was
 * that the docs site — the sole consumer that reads CSS from source rather than from
 * `dist` — rendered without that sheet.
 */
/*
 * A documented `@cssprop` must actually be read by a stylesheet.
 *
 * This is the rule that would have caught the whole class of damage the recipe adoption
 * did without anyone noticing. When a component stopped drawing its own border-radius
 * and let `.aparte-btn` draw it instead, the component's own `--aparte-radius-send-btn`
 * simply lost its last reader — and stayed in the JSDoc, so the generated page kept
 * listing it: "`--aparte-radius-send-btn` | `6px` | Corner radius of the button." A
 * consumer sets it and nothing happens, and nothing anywhere says why.
 *
 * Six of them had gone that way. The generated CSS-variable reference did label them
 * `palette only`, which is honest but is not where anyone looks: a reader goes to the
 * COMPONENT's page, where the token is presented as that component's knob.
 *
 * Read with a fallback counts as read — `var(--aparte-select-bg, …)` is the documented
 * way a consumer-facing knob with a default is written, and 34 of them are shaped that
 * way on purpose.
 */

/**
 * Same floor reasoning as everywhere else: a matcher that reads nothing is not a pass.
 * It is a COLLAPSE detector, not a count — deliberately deleting a knob is allowed and
 * should not require touching this, so it sits well below the real total (149 at the
 * time of writing). Raise it only if the total climbs far enough that this stops
 * catching a broken matcher.
 */
const CSSPROP_FLOOR = 120;
if (cssPropDeclared.size < CSSPROP_FLOOR) {
    problems.push(
        `[cssprop] read only ${cssPropDeclared.size} @cssprop tags, floor is ${CSSPROP_FLOOR}. `
        + 'The matcher broke, so this rule is guarding nothing.',
    );
}
{
    const readAnywhere = new Set(
        [...lines.join(String.fromCharCode(10)).matchAll(/var\((--aparte-[\w-]+)/g)].map((m) => m[1]),
    );
    for (const [token, file] of cssPropDeclared) {
        if (!readAnywhere.has(token)) {
            problems.push(
                `\`${token}\` is documented as a @cssprop (${file}) but no stylesheet reads it. `
                + 'The generated component page presents it as a working knob; setting it does nothing.',
            );
        }
    }
}

/*
 * ── Every class core emits is prefixed `aparte-` ────────────────────────────────
 *
 * CLAUDE.md has stated this as policy for a long time and NO guard read it: a sweep of
 * `scripts/` for "prefix" returned one hit, and it was about `@keyframes`. The measured
 * state when the policy was written was 146 prefixed component classes against 42 bare
 * ones, and core is light DOM, so the bleed goes both ways — the outward direction being
 * the serious one. A bare global rule like `.error-message { }` restyles the host's own
 * error messages the moment they import the package. Inbound has bitten twice already:
 * a bare `nav` rule on this repo's own docs site moved the artifact card's tabs, and
 * `.segment` is Semantic UI's base class.
 *
 * It lives here rather than in a new script because this file already reads both halves
 * of the question — every sheet, and every source file under `CSSPROP_SOURCES`.
 *
 * `language-*` is the one deliberate exception, and it is not ours: it is the name
 * highlighters look for on a `<code>`.
 */
const CLASS_SITE_FLOOR = 250;
const CLASS_TOKEN_FLOOR = 380;

/**
 * Files whose class attributes are NOT core's DOM.
 *
 * One entry, and it earns it: `preview-document.ts` builds the `srcdoc` of the artifact
 * card's sandboxed iframe — a separate document in a separate origin, whose markup
 * exists to be styled by the CSS the MODEL wrote. Prefixing `<div class="demo">` there
 * would mean the model's own `.demo { }` no longer matches its own preview.
 */
const CLASS_EXEMPT_FILES = new Map([
    ['packages/plugins/artifacts/src/preview-document.ts', "the sandboxed preview's srcdoc: a separate document, styled by the model's CSS"],
]);

let classSites = 0;
let classTokens = 0;
{
    const badClasses = new Map();
    // Rule 8 below reads this, so the two rules agree BY CONSTRUCTION on what "a class
    // core emits" means. It used to keep a walk of its own — a bare `/aparte-[a-z0-9…]/`
    // over raw source — which counted a name inside a docblock, inside an `@example`
    // fence, or inside `--aparte-code-language` as an emission, and so kept an orphaned
    // selector alive after exactly the rename the rule exists to catch.
    const emittedClasses = new Set();
    for (const file of cssPropFiles) {
        if (CLASS_EXEMPT_FILES.has(file)) continue;
        // Block comments and line comments first: a JSDoc `@example` here is a
        // CONSUMER's markup by design (`class="my-typing"`, `class="fas fa-copy"`), and
        // demanding an `aparte-` prefix of it would be demanding the opposite of what
        // those examples teach.
        let text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
        text = text.split(String.fromCharCode(10)).filter((l) => !/^\s*\/\//.test(l)).join(String.fromCharCode(10));

        const record = (raw) => {
            classSites++;
            // `${…}` chunks are computed and unknowable here; the literal tokens around
            // them are what this rule is about.
            for (const token of raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
                if (!token) continue;
                classTokens++;
                emittedClasses.add(token);
                if (token.startsWith('aparte-') || token.startsWith('language-')) continue;
                if (!badClasses.has(token)) badClasses.set(token, new Set());
                badClasses.get(token).add(file);
            }
        };
        // `class="…"` allowing `${…}` to contain quotes of its own — without that, the
        // scan stops at the apostrophe inside `${x || 'text'}` and reads `||` as a class.
        for (const m of text.matchAll(/\sclass=["']((?:\$\{[^}]*\}|[^"'])*)["']/g)) record(m[1]);
        for (const m of text.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) {
            for (const s of m[1].matchAll(/['"`]([^'"`$]*)['"`]/g)) record(s[1]);
        }
        for (const m of text.matchAll(/\.className\s*=\s*['"`]([^'"`]*)['"`]/g)) record(m[1]);
        for (const m of text.matchAll(/setAttribute\(\s*['"]class['"]\s*,\s*['"`]([^'"`]*)['"`]/g)) record(m[1]);
    }

    for (const [token, where] of [...badClasses].sort()) {
        problems.push(
            `class "${token}" is emitted without the \`aparte-\` prefix, from ${[...where].sort().join(', ')}.\n`
            + '      Core is LIGHT DOM: an unprefixed rule is a global rule, so it restyles the\n'
            + "      host's own markup and the host's own rules restyle ours. Prefix it, or — if\n"
            + '      the markup genuinely is not core\'s DOM — name the file in CLASS_EXEMPT_FILES.',
        );
    }
    if (classSites < CLASS_SITE_FLOOR || classTokens < CLASS_TOKEN_FLOOR) {
        problems.push(
            `[classes] read only ${classSites} class sites and ${classTokens} tokens across `
            + `${cssPropFiles.length} source files (floors ${CLASS_SITE_FLOOR}/${CLASS_TOKEN_FLOOR}).\n`
            + '      A collapsed corpus is what a broken matcher looks like, not a clean repo.',
        );
    }

    /*
     * …and the other direction: a `.aparte-…` rule nothing emits.
     *
     * Scoped to `styles/segment/**` deliberately, and the scope is a MEASUREMENT rather
     * than a compromise. A segment sheet styles markup core's own renderers build and
     * nothing else, so an orphan there is a class that was renamed on one side only —
     * which is exactly what happened to `.aparte-code-language`. The rest of `styles/`
     * cannot be judged this way: `display/`, `surface/`, `button.css` and `field.css` are
     * a RECIPE KIT a consumer wears (`aparte-alert`, `aparte-badge`, `aparte-dialog` —
     * 140 classes core deliberately emits nowhere), and `apps/docs` cannot be the corpus
     * that rescues them because `reference/classes.mdx` is GENERATED from these same
     * sheets, which would make the rule prove itself.
     *
     * Measured orphans in the families NOT covered, so widening this is a decision with
     * numbers behind it rather than a rediscovery: components/composer.css 10,
     * components/shell.css 1, components/elicitation.css 1, components/context.css 1,
     * shell/split.css 2, everything else 0.
     */
    const EMITTED_SHEETS = SHEETS.filter((s) => s.includes('/styles/segment/'));
    const SEGMENT_SHEET_FLOOR = 4;
    if (EMITTED_SHEETS.length < SEGMENT_SHEET_FLOOR) {
        problems.push(
            `[classes] found only ${EMITTED_SHEETS.length} segment stylesheet(s), floor is `
            + `${SEGMENT_SHEET_FLOOR}. They moved, and the orphan rule is now guarding nothing.`,
        );
    }
    for (const sheet of EMITTED_SHEETS) {
        const css = readFileSync(sheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
        for (const m of css.matchAll(/\.(aparte-[a-zA-Z0-9_-]+)/g)) {
            if (emittedClasses.has(m[1])) continue;
            problems.push(
                `${sheet}  \`.${m[1]}\` is styled and no source emits it. A segment sheet styles\n`
                + '      markup core builds itself, so an orphan here is a class renamed on one side\n'
                + '      only — the rule is dead weight, and the markup is unstyled.',
            );
        }
    }
}

const BUNDLE = 'packages/core/src/styles/bundle.css';
const bundleImports = [...readFileSync(BUNDLE, 'utf8').matchAll(/@import\s+'([^']+)'/g)].map((m) =>
    m[1].replace(/^\.\//, 'packages/core/src/styles/').replace(/^\.\.\//, 'packages/core/src/'),
);
if (bundleImports.join('|') !== SHEETS.join('|')) {
    const missing = SHEETS.filter((s) => !bundleImports.includes(s));
    const extra = bundleImports.filter((s) => !SHEETS.includes(s));
    problems.push(
        `${BUNDLE} does not match src/index.ts.`
        + (missing.length ? `\n      missing: ${missing.join(', ')}` : '')
        + (extra.length ? `\n      unknown: ${extra.join(', ')}` : '')
        + (!missing.length && !extra.length ? '\n      same sheets, different ORDER — which is a different cascade.' : ''),
    );
}

const css = lines.join(String.fromCharCode(10));
const declaredFrames = new Map();
for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
    declaredFrames.set(m[1], (declaredFrames.get(m[1]) ?? 0) + 1);
}
const usedFrames = new Set();
for (const m of css.matchAll(/animation:\s*([\w-]+)/g)) if (m[1] !== 'none') usedFrames.add(m[1]);
for (const m of css.matchAll(/animation-name:\s*([\w-]+)/g)) if (m[1] !== 'none') usedFrames.add(m[1]);

for (const name of usedFrames) {
    if (!declaredFrames.has(name)) {
        problems.push(
            `\`animation: ${name}\` names a @keyframes that no stylesheet declares. `
            + 'The element will simply not move, and nothing will say so.',
        );
    }
}
for (const [name, count] of declaredFrames) {
    if (count > 1) {
        problems.push(`\`@keyframes ${name}\` is declared ${count} times. The last one silently wins.`);
    }
    if (!usedFrames.has(name)) {
        problems.push(`\`@keyframes ${name}\` is declared but no animation uses it — dead weight in every bundle.`);
    }
    if (!name.startsWith('aparte-')) {
        problems.push(
            `\`@keyframes ${name}\` is not prefixed \`aparte-\`. Keyframe names are global: `
            + "this one can shadow, or be shadowed by, a rule on the consumer's own page.",
        );
    }
}

/*
 * The theming guide states this count in prose, and prose drifts: it said 79 while the
 * real figure had grown to 212 — off by a factor of nearly three, on the sentence whose
 * whole job is to convince a reader that setting a base is enough. The number is computed
 * here already, so asserting the page carries it costs nothing and closes the gap for good.
 *
 * Deliberately not generated into the page: it is one word inside an argument, and a
 * generated fragment there would break the sentence rather than maintain it. Stating the
 * number and checking it is the smaller of the two mechanisms.
 */
const THEMING_GUIDE = 'apps/docs/src/content/docs/guides/theming.md';
if (existsSync(THEMING_GUIDE)) {
    const guide = readFileSync(THEMING_GUIDE, 'utf8');
    if (!new RegExp(`\\b${anchored.length}\\b[^.]*variables? read another`).test(guide)) {
        problems.push(
            `${THEMING_GUIDE} does not state the derived-variable count. It is ${anchored.length} now — `
            + 'find the "N of core\'s variables read another one" sentence and update the number.',
        );
    }
}

/* ── The system-theme duplicates cannot drift ─────────────────────────────────
   theme.css carries the dark palette twice — the attribute block and its
   prefers-color-scheme copy (CSS cannot share one block between a media query
   and an attribute selector) — plus a light veto that re-declares, at their
   light literal values, exactly the properties dark overrides. Both pairings
   are held here: edited apart, the theme forks with no visual error on the
   editor's own OS. Same family as the bundle.css import parity above. */
{
    const themeCss = readFileSync('packages/core/src/styles/theme.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const decls = (block) => new Map([...(block ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const darkAttr = themeCss.match(/\[data-aparte-theme="dark"\]\s*\{([^}]*)\}/)?.[1];
    const darkMedia = themeCss.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-aparte-theme="light"\]\)\s*\{([^}]*)\}/)?.[1];
    const lightVeto = themeCss.match(/\[data-aparte-theme="light"\]\s*\{([^}]*)\}/)?.[1];
    if (!darkAttr || !darkMedia || !lightVeto) {
        problems.push('theme.css: the dark attribute block, its prefers-color-scheme copy or the light veto is missing — the system-default theme lost a leg.');
    } else {
        const a = decls(darkAttr);
        const m = decls(darkMedia);
        const l = decls(lightVeto);
        for (const [prop, value] of a) {
            if (m.get(prop) !== value) problems.push(`theme.css: \`${prop}\` differs between [data-aparte-theme="dark"] (\`${value}\`) and its prefers-color-scheme copy (\`${m.get(prop) ?? 'MISSING'}\`) — the two blocks are one theme; edit both.`);
        }
        for (const prop of m.keys()) {
            if (!a.has(prop)) problems.push(`theme.css: \`${prop}\` is in the prefers-color-scheme copy but not in the attribute block — the two blocks are one theme; edit both.`);
        }
        const beforeDark = themeCss.slice(0, themeCss.indexOf('[data-aparte-theme="dark"]'));
        const lightLiterals = new Map();
        for (const mm of beforeDark.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
            if (!lightLiterals.has(mm[1])) lightLiterals.set(mm[1], mm[2].trim());
        }
        for (const prop of a.keys()) {
            if (!l.has(prop)) problems.push(`theme.css: \`${prop}\` is dark-overridden but the [data-aparte-theme="light"] veto does not reset it — forced light would keep a dark value under a dark OS.`);
            else if (l.get(prop) !== lightLiterals.get(prop)) problems.push(`theme.css: \`${prop}\` in the light veto (\`${l.get(prop)}\`) drifted from its light literal (\`${lightLiterals.get(prop) ?? 'MISSING'}\`) — the veto restates the \`:root\` value, never its own.`);
        }
        for (const prop of l.keys()) {
            if (!a.has(prop)) problems.push(`theme.css: \`${prop}\` is in the light veto but dark never overrides it — a dead reset; remove it or override it in dark.`);
        }
    }
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
    + `${atRuleExempt.length} responsive exemption(s); ${refs} var() refs, single-owner `
    + `and each one declared or written from JS; ${classTokens} class tokens over `
    + `${classSites} sites, all prefixed.`,
);
