/**
 * Every interpolation in ATTRIBUTE position must be escaped — with the escaper
 * that matches the position.
 *
 * Why a gate rather than a review note: a cold audit found `data-role="${role}"`
 * twice and `data-status="${status}"` once, each sitting one line from a sibling
 * that WAS escaped. Fixing those three would have left the class alive. The sweep
 * that followed found 42 unescaped attribute interpolations across eight files —
 * and NINE private copies of the escaping helper, three of which had drifted to
 * escape four of the five characters that matter (the apostrophe went through,
 * which is enough to break out of a single-quoted attribute).
 *
 * Two positions, two escapers, and the difference is not cosmetic:
 *   - markup      → `escapeAttr` (entity-encodes, so the value cannot end early)
 *   - a selector  → `cssEscape` (backslash-escapes, so `querySelector` does not
 *                   throw or match the wrong node). This check writing the sweep
 *                   found a real instance: the host built a `[message-id="…"]`
 *                   selector from a raw id while its three siblings in the
 *                   viewport used cssEscape.
 *
 * An `attr="${expr}"` passes when:
 *   - it is in selector context and goes through `cssEscape`, or
 *   - it is in markup and goes through one of the escapers below, or is a local
 *     already assigned from one (`const escapedId = escapeHtml(id)`), or
 *   - `expr` is provably not attacker-shaped — a named boolean/number, a ternary
 *     between two string literals, a comparison, `String(...)`, `.toFixed(...)`, or
 *   - the line carries `// safe-attr: <reason>`, which makes the exemption
 *     explicit, greppable and reviewable instead of invisible.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['packages/core/src', 'packages/plugins', 'packages/providers'];

/** Calls that produce a value safe to drop into markup. */
const ESCAPERS = [
    'escapeHtml(', 'escapeAttr(', 'cssEscape(', 'esc(',
    'encodeURIComponent(', 'escapeClosingScriptTag(',
];

/** Shapes that cannot carry an attacker-controlled string. */
const SAFE_SHAPES = [
    /^[\w$.]+\s*\?\s*'[^']*'\s*:\s*'[^']*'$/,
    /^String\(/,
    /^[\w$.]+\.toFixed\(/,
    /^[\w$.()]+\s*(===|!==|>=|<=|>|<)\s*[\w$.'"]+$/,
];

/**
 * Bare identifiers are only safe when they really are booleans or numbers, so
 * they are NAMED here rather than inferred from the spelling.
 */
const BOOLEANS_AND_NUMBERS = new Set([
    'visible', 'disabled', '!disabled', 'previewable', 'isStreaming', 'isBinary',
    'pct', 'this._r', 'dasharray', 'initialTab',
]);

/** Calls whose argument is a CSS selector, so `cssEscape` is the right escaper. */
const SELECTOR_CALLS = ['querySelector(', 'querySelectorAll(', '.matches(', '.closest('];

/**
 * Match an attribute and its whole QUOTED VALUE, either quoting style.
 *
 * The first version of this guard used one regex — `([a-zA-Z-]+)="\$\{([^}]*)\}"`
 * — and a follow-up audit walked through it three times on the very line it
 * otherwise catches:
 *
 *   1. `data-role="x-${role}"`      the interpolation is not the ENTIRE value, so
 *                                  `="\$\{` never matched. This is the common
 *                                  shape (`class="aparte-x ${variant}"`).
 *   2. `data-role='${role}'`        single quotes — the exact break-out the header
 *                                  of this file names as the risk.
 *   3. `data-role="${ {a:role}.a }"` a `}` inside the expression truncated
 *                                  `[^}]*` and the match failed.
 *
 * So the value is captured first, and interpolations are pulled out of it by
 * counting braces rather than by a character class.
 */
const ATTR_VALUE = /([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)')/g;

/** Every `${…}` in one attribute value, brace-balanced so nested objects survive. */
function interpolationsIn(value) {
    const found = [];
    for (let i = 0; i < value.length; i++) {
        if (value[i] !== '$' || value[i + 1] !== '{') continue;
        let depth = 1;
        let j = i + 2;
        for (; j < value.length && depth > 0; j++) {
            if (value[j] === '{') depth++;
            else if (value[j] === '}') depth--;
        }
        if (depth === 0) {
            found.push(value.slice(i + 2, j - 1));
            i = j - 1;
        }
    }
    return found;
}

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (['node_modules', 'dist', '__tests__'].includes(name)) continue;
            yield* walk(path);
        } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
            yield path;
        }
    }
}

const offenders = [];
let checked = 0;
let selectors = 0;

for (const root of ROOTS) {
    for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        const lines = src.split('\n');
        const where = i => `${relative(process.cwd(), file).split(sep).join('/')}:${i + 1}`;

        // Locals already escaped upstream are safe at the call site, and the call
        // site is where the attribute is. Collected once per file so the check does
        // not demand a second escaping of an already-escaped value.
        //
        // `this._escape(…)` / `this._esc(…)` are in the alternation because that is
        // the convention across the components — several of them own a private
        // escaper rather than importing the shared one, and the first version of
        // this list missed every one of them.
        const preEscaped = new Set(
            [...src.matchAll(
                /(?:const|let)\s+([\w$]+)\s*=\s*[^;\n]*(?:escapeHtml|escapeAttr|cssEscape|_escape|_esc|esc)\(/g,
            )].map(m => m[1]),
        );

        /**
         * Locals whose value can only ever be a literal or a number, so no input
         * reaches them: `const c = flag ? ' x--active' : ''`, `const n = d * 16`.
         *
         * These are recognised by SHAPE rather than listed by name. The hand-kept
         * `BOOLEANS_AND_NUMBERS` list above is the version that does not scale — it
         * needs an entry per site, and widening this guard's regex surfaced three
         * more sites that would each have wanted one.
         */
        const literalDerived = new Set(
            [...src.matchAll(
                /(?:const|let)\s+([\w$]+)\s*=\s*([^;\n]*)/g,
            )].filter(([, , rhs]) => (
                // a ternary whose two branches are both quoted literals
                /^[^?]*\?\s*(['"`])[^'"`]*\1\s*:\s*(['"`])[^'"`]*\2\s*$/.test(rhs.trim())
                // or pure arithmetic over numbers and identifiers
                || /^[\w$.\s*+\-/()]+$/.test(rhs.trim()) && /[*+\-/]/.test(rhs)
            )).map(m => m[1]),
        );

        /** Lines that are pure comment or JSDoc — an `@example` is not a call site. */
        const commentOnly = new Set();
        let inBlock = false;
        lines.forEach((line, i) => {
            const t = line.trim();
            if (inBlock) {
                commentOnly.add(i);
                if (t.includes('*/')) inBlock = false;
                return;
            }
            if (t.startsWith('/*')) {
                commentOnly.add(i);
                if (!t.includes('*/')) inBlock = true;
                return;
            }
            if (t.startsWith('//') || t.startsWith('*')) commentOnly.add(i);
        });

        /**
         * Variable names that are HANDED to a selector call somewhere in the file.
         *
         * A second audit proved the per-line rule blind to the natural coding
         * order — build the selector, then query with it:
         *
         *   const sel = `[data-segment-id="${escapeHtml(id)}"]`;
         *   el.querySelectorAll(sel);
         *
         * The interpolation's own line has no selector call, so it was judged
         * MARKUP and `escapeHtml` was accepted — entity-encoding, which is the
         * wrong escaper for a selector and would silently match no node. So the
         * name is picked up here and the assignment recognised below.
         */
        const selectorVars = new Set();
        for (const call of SELECTOR_CALLS) {
            const re = new RegExp(`${call.replace(/[.()]/g, '\\$&')}\\s*([\\w$]+)\\s*\\)`, 'g');
            for (const m of src.matchAll(re)) selectorVars.add(m[1]);
        }

        // Offset → line index, so the scan can run over the WHOLE FILE instead of
        // line by line. The per-line version could not see an interpolation whose
        // `${` and `}` sat on different lines — a shape the audit demonstrated.
        const lineStarts = [0];
        for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
        const lineOf = (offset) => {
            let lo = 0;
            let hi = lineStarts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
            }
            return lo;
        };

        // An attribute whose value is NOT quoted at all: `data-x=${expr}`. There is
        // no safe escaping for this position — `escapeAttr` does not encode spaces,
        // tabs or backticks, so any of them ends the value and starts a new
        // attribute. The rule is to quote it, not to escape harder.
        for (const m of src.matchAll(/([a-zA-Z-]+)=\$\{/g)) {
            const i = lineOf(m.index);
            if (commentOnly.has(i) || lines[i].includes('safe-attr:')) continue;
            offenders.push(
                `${where(i)}  ${m[1]}=\${…}  — UNQUOTED attribute value: wrap it in quotes`,
            );
        }

        for (const m of src.matchAll(ATTR_VALUE)) {
            const i = lineOf(m.index);
            const line = lines[i];
            if (line.includes('safe-attr:')) continue;
            // A JSDoc `@example` teaching a consumer's own renderer is documentation,
            // not a sink. The sibling guard for the engine seam had the same defect,
            // found by the same audit: a textual check that reads comments as code.
            if (commentOnly.has(i)) continue;

            const value = m[2] ?? m[3] ?? '';

                // Selector or markup, decided per match. Three ways to be a selector:
                // inside a still-open selector call on this line, or assigned to a
                // name that is later handed to one, or the previous lines opened a
                // selector call that has not closed yet.
                const before = src.slice(Math.max(0, m.index - 400), m.index);
                const lastCall = Math.max(...SELECTOR_CALLS.map(c => before.lastIndexOf(c)));
                let isSelector = false;
                if (lastCall !== -1) {
                    const tail = before.slice(lastCall);
                    const opens = (tail.match(/\(/g) ?? []).length;
                    const closes = (tail.match(/\)/g) ?? []).length;
                    isSelector = opens > closes;
                }
                if (!isSelector) {
                    const assigns = [...before.matchAll(/(?:const|let)\s+([\w$]+)\s*=/g)];
                    const assigned = assigns.length ? assigns[assigns.length - 1][1] : null;
                    if (assigned && selectorVars.has(assigned)) isSelector = true;
                }

                for (const rawExpr of interpolationsIn(value)) {
                checked++;
                const expr = rawExpr.trim();
                const site = `${where(i)}  ${m[1]}="…\${${expr}}…"`;

                if (isSelector) {
                    selectors++;
                    if (!expr.includes('cssEscape(')) {
                        offenders.push(`${site}  — selector: needs cssEscape, not escapeAttr`);
                    }
                    continue;
                }
                if (ESCAPERS.some(e => expr.includes(e))) continue;
                if (preEscaped.has(expr)) continue;
                if (SAFE_SHAPES.some(re => re.test(expr))) continue;
                if (BOOLEANS_AND_NUMBERS.has(expr)) continue;
                if (literalDerived.has(expr)) continue;
                offenders.push(site);
                }
        }
    }
}

if (offenders.length) {
    console.error(`\n[attr-escaping] ${offenders.length} unescaped interpolation(s) of ${checked}:\n`);
    for (const o of offenders) console.error('  ' + o);
    console.error(
        "\nIn markup, wrap the value in escapeAttr() (exported from @aparte/core)."
        + "\nIn a selector, use cssEscape(). If the value genuinely cannot carry an"
        + "\nattacker-controlled string, add `// safe-attr: <reason>` to the line so"
        + "\nthe exemption is explicit.\n",
    );
    process.exit(1);
}

/**
 * A floor on how many sites the guard still SEES.
 *
 * Zero offenders is the same output whether every interpolation is escaped or the
 * matcher stopped finding them. An audit made that concrete: three one-character
 * edits walked past the old regex, and the only tell was the reported total
 * sliding from 110 to 109 — a number nothing checked. Deleting a component drops
 * the count legitimately, so this is a floor with slack, not an equality: it
 * catches a broken matcher (which collapses the count), not normal churn.
 *
 * Raise it when the real number grows; never lower it without saying why here.
 */
const SEEN_FLOOR = 100;
if (checked < SEEN_FLOOR) {
    console.error(
        `\n[attr-escaping] only ${checked} interpolations found, expected at least ${SEEN_FLOOR}.\n\n`
        + 'Zero offenders and a collapsed count is what a BROKEN MATCHER looks like:\n'
        + 'the guard reports success because it can no longer see the sinks. Check\n'
        + 'ATTR_VALUE / interpolationsIn() before adjusting this floor. If markup was\n'
        + 'legitimately deleted, lower it in the same commit and say so.\n',
    );
    process.exit(1);
}

console.log(
    `[attr-escaping] OK: ${checked} attribute interpolations `
    + `(${selectors} in selector position), all escaped or explicitly exempt.`,
);
