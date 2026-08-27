#!/usr/bin/env node
/**
 * Escaping in TEXT position — the sibling `check-attr-escaping` never had.
 *
 * That guard is 358 lines of hardening for one of the two places an interpolation
 * can land: inside a quoted attribute value. The other place — between tags,
 * `<span>${x}</span>` — had nothing at all. An audit swept it and found 89 such
 * interpolations, 49 of them with no escaper in sight. Every one is benign today:
 * icons that are SVG by contract, markdown that went through the sanitiser, locals
 * escaped one line above. But "benign today, checked by nobody" is precisely the
 * state the attribute surface was in before nine private escapers had drifted, three
 * of them escaping only four of the five characters that matter.
 *
 * ## What counts as safe, and why each rule exists rather than a list
 *
 *   1. **Escaped at the site** — `${escapeHtml(x)}`. Whole identifiers only: matching
 *      `esc(` as a substring once blessed every name ending in those letters.
 *   2. **Escaped at its assignment** — `const name = escapeHtml(a.name)` then
 *      `${name}`. This is the commonest shape in the repo and the one a per-site list
 *      could never keep up with. Anchored to the start of the right-hand side, so
 *      `const v = raw + escapeHtml('')` is NOT safe.
 *   3. **Markup by contract** — `getIcon()`, `renderMarkdown()`. Escaping these would
 *      break the feature: an icon provider returns SVG on purpose, and markdown has
 *      already passed the configured sanitiser. In an ATTRIBUTE value the same calls
 *      would still be defects, which is why this rule lives only here.
 *   4. **Composed from safe parts** — a local built by concatenating literals with
 *      already-safe interpolations. Recognised by shape, following the same
 *      derivation the attribute guard uses for literal-only locals.
 *   5. **Literal-only expressions** — a ternary whose branches are string literals,
 *      or nested template literals containing no unsafe interpolation of their own.
 *
 * Anything else needs `// safe-text: <reason>` — explicit, greppable, and a sentence
 * somebody had to write.
 *
 * The marker goes on the line where the value is DECLARED, not where it is used, and
 * that is not a preference. Most of these interpolations sit inside a multi-line
 * template literal, so a comment on the use site lands INSIDE the string and ships as
 * text in the rendered HTML. I did exactly that on the first attempt and the marker
 * would have been served to users. The declaration is also the honest place: it is
 * where the safety is decided.
 *
 * A SEEN floor pins the count: zero violations with a collapsed total is the
 * signature of a matcher that stopped matching, which is how two guards in this repo
 * were found decorative.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ESCAPER_NAMES, TRUSTED_MARKUP_CALLS, calledNames, stripComments, preEscapedLocals } from './escaping-names.mjs';

const ROOTS = ['packages'];
const SKIP = new Set(['node_modules', 'dist', '__tests__', '.svelte-kit']);
/** Measured at 89 text-position interpolations. Raise when the surface grows. */
const SEEN_FLOOR = 70;

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) yield p;
    }
}

/** Balanced `${ … }` starting at `i`, which must point at the `$`. */
function interpolationAt(text, i) {
    if (text[i] !== '$' || text[i + 1] !== '{') return null;
    let depth = 1;
    let j = i + 2;
    for (; j < text.length && depth > 0; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
    }
    return depth === 0 ? { expr: text.slice(i + 2, j - 1).trim(), end: j } : null;
}

/** An expression that can only ever produce literals: a ternary of string literals. */
const LITERAL_ONLY = [
    /^[^?]*\?\s*'[^']*'\s*:\s*'[^']*'$/s,
    /^[^?]*\?\s*"[^"]*"\s*:\s*""$/s,
];

/**
 * A ternary whose branches are string OR template literals, where every
 * interpolation inside is itself safe. This is the artifact-card shape: a big
 * conditional block of markup with escaped values inside it.
 */
function nestedTemplateSafe(expr, isSafeExpr) {
    if (!/`/.test(expr)) return false;
    // Every `${…}` inside must satisfy the same predicate, recursively.
    for (let i = 0; i < expr.length; i++) {
        if (expr[i] !== '$') continue;
        const inner = interpolationAt(expr, i);
        if (!inner) continue;
        if (!isSafeExpr(inner.expr)) return false;
        i = inner.end - 1;
    }
    // The literal parts are markup the file wrote itself.
    return true;
}

const problems = [];
let seen = 0;
let exempt = 0;
let declaredExemptions = 0;
const byReason = new Map();

for (const root of ROOTS) {
    for (const file of walk(root)) {
        const raw = readFileSync(file, 'utf8');
        const src = stripComments(raw);
        const rel = file.split('\\').join('/');
        const rawLines = raw.split('\n');
        const preEscaped = preEscapedLocals(src);
        /**
         * Locals holding the ICON PROVIDER itself — `const icons =
         * this._cfg.getIconProvider()`. Every member call on one returns markup by the
         * same contract `getIcon()` does, so `${icons.copy()}` is trusted for the same
         * reason. A rule rather than five exemptions, because it is the contract that
         * makes them safe, not the five call sites.
         */
        const iconProviders = new Set(
            [...src.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*[^;\n]*getIconProvider\s*\(/g)].map((m) => m[1]),
        );
        /**
         * Names whose DECLARATION line carries `// safe-text: <reason>` — a local, or a
         * function parameter. Declared exemptions live there rather than at the use
         * site because most use sites are inside a multi-line template literal, where a
         * comment would become text in the rendered HTML.
         */
        /**
         * Locals PRODUCED by a markup-by-contract call — `const icon =
         * this._getStopIcon()`, `const icon = contextConfig().getIcon('tool')`.
         *
         * The exact counterpart of `preEscapedLocals`, for the other kind of safety:
         * one says "this value was escaped", the other says "this value is markup on
         * purpose". Three sites were relying on the over-generous `composed` rule to
         * be blessed by accident; this states the reason instead.
         *
         * Anchored to the start of the right-hand side, same as the escaper version,
         * so `const x = raw + getIcon('a')` is not safe.
         */
        const preTrusted = new Set(
            [...src.matchAll(
                new RegExp(
                    String.raw`(?:const|let)\s+([\w$]+)\s*=\s*(?:await\s+)?[\w$.()' ]*?\b(?:${[...TRUSTED_MARKUP_CALLS].join('|')}|_get\w*Icon)\s*\(`,
                    'g',
                ),
            )].map((m) => m[1]),
        );
        /**
         * Glyphs imported from `icons/glyphs.js` — markup by contract, exactly like
         * `getIcon()`, which this guard already trusts and which returns those very
         * strings. They are named here rather than exempted at each use site because
         * an import has no declaration line to carry a comment, and the use sites are
         * inside multi-line template literals where a `//` would render as text.
         *
         * Narrow on purpose: only names bound by an import from that one module. A
         * local called `closeIcon` assigned from anything else is not covered.
         */
        const trustedGlyphs = new Set();
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*icons\/(?:glyphs|extended|index)\.js'/g)) {
            for (const name of m[1].split(',')) {
                const bound = name.trim().split(/\s+as\s+/).pop()?.trim();
                if (bound) trustedGlyphs.add(bound);
            }
        }

        const declaredSafe = new Map();
        for (const l of raw.split('\n')) {
            const m = /\/\/\s*safe-text:\s*(\S.*)$/.exec(l);
            if (!m) continue;
            // Three shapes, in order of precision: a local's declaration, ONE
            // parameter on its own line (`body: string,  // safe-text: …`), or a
            // single-parameter signature. A multi-parameter signature is deliberately
            // NOT matched wholesale — that would exempt `title` and `kind` along with
            // `body`, and an exemption should cover exactly the value it names.
            const name = /(?:const|let|var)\s+([\w$]+)\s*=/.exec(l)?.[1]
                ?? /^\s*([\w$]+)\s*[?]?:\s*[^;{]+,\s*\/\//.exec(l)?.[1]
                ?? /function\s+[\w$]+\s*\(\s*([\w$]+)[^,)]*\)/.exec(l)?.[1];
            if (name) { declaredSafe.set(name, m[1].trim()); declaredExemptions++; }
        }
        // Locals built by concatenating literals with already-safe interpolations:
        // `const remove = \`<button …>${name}${ICON}</button>\`;`
        const composed = new Set();
        const isSafe = (expr) => {
            const called = calledNames(expr);
            if (called.some((n) => ESCAPER_NAMES.has(n))) return true;
            if (called.some((n) => TRUSTED_MARKUP_CALLS.has(n))) return true;
            const receiver = /^([\w$]+)\./.exec(expr)?.[1];
            if (receiver && iconProviders.has(receiver) && /\)\s*$/.test(expr)) return true;
            if (declaredSafe.has(expr) || (receiver && declaredSafe.has(receiver))) return true;
            if (preEscaped.has(expr) || composed.has(expr) || preTrusted.has(expr)) return true;
            if (trustedGlyphs.has(expr)) return true;
            if (LITERAL_ONLY.some((re) => re.test(expr))) return true;
            if (/^'[^']*'$/.test(expr) || /^"[^"]*"$/.test(expr)) return true;
            if (nestedTemplateSafe(expr, isSafe)) return true;
            return false;
        };
        // One pass to learn the composed locals, in declaration order.
        for (const m of src.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*([\s\S]{0,600}?);\n/g)) {
            // The initialiser must BE a literal, not merely CONTAIN a quote.
            //
            // The first version tested for a quote character anywhere in the
            // right-hand side, which is far too generous: a local assigned from
            // `element.querySelector('.some-class')` matched, and that marked its NAME
            // safe for the whole file — including an unrelated parameter of the same
            // name in another function. Splitting a file is what surfaced it: three
            // real sites had been passing on that accident, and a `body` parameter
            // holding model-authored HTML was one of them.
            //
            // The analysis is name-based and file-scoped, not scope-aware. That is a
            // deliberate limit — a real scope analysis needs a parser — so the rules
            // have to be narrow enough that a name collision cannot bless anything.
            const rhs = m[2].trim();
            // Either the initialiser is a literal, or it satisfies the SAME safety
            // predicate as any other expression — `const icon = a ? '📁' : '📄'` and
            // `const previewBody = cached.html ? \`…\` : \`…\`` are safe for exactly the
            // reasons already stated, so they are recognised by reuse rather than by a
            // new special case.
            if (!/^[`'"]/.test(rhs) && !isSafe(rhs)) continue;
            let ok = true;
            for (let i = 0; i < m[2].length; i++) {
                if (m[2][i] !== '$') continue;
                const inner = interpolationAt(m[2], i);
                if (!inner) continue;
                if (!isSafe(inner.expr)) { ok = false; break; }
                i = inner.end - 1;
            }
            if (ok) composed.add(m[1]);
        }

        for (let i = 0; i < src.length; i++) {
            if (src[i] !== '$') continue;
            const it = interpolationAt(src, i);
            if (!it) continue;
            // TEXT position: the nearest preceding non-space character closes a tag,
            // and the nearest following one opens a tag or ends the literal.
            let b = i - 1;
            while (b >= 0 && /\s/.test(src[b])) b--;
            if (src[b] !== '>') { i = it.end - 1; continue; }
            let a = it.end;
            while (a < src.length && /\s/.test(src[a])) a++;
            if (src[a] !== '<' && src[a] !== '`') { i = it.end - 1; continue; }

            seen++;
            const line = src.slice(0, i).split('\n').length;
            const marker = /\/\/\s*safe-text:\s*(\S.*)$/.exec(rawLines[line - 1] ?? '');
            if (marker) {
                exempt++;
                byReason.set(`${rel}:${line}`, marker[1].trim());
                i = it.end - 1;
                continue;
            }
            if (!isSafe(it.expr)) {
                problems.push({ where: `${rel}:${line}`, expr: it.expr.replace(/\s+/g, ' ').slice(0, 110) });
            }
            i = it.end - 1;
        }
    }
}

if (seen < SEEN_FLOOR) {
    console.error(
        `\n[text-escaping] FAIL: only ${seen} text-position interpolations seen, floor is ${SEEN_FLOOR}.\n`
        + '  Zero violations on a collapsed count is a matcher that stopped matching, not a\n'
        + '  clean repo. Check the scanner before lowering this.\n',
    );
    process.exit(1);
}

if (problems.length) {
    console.error(`\n[text-escaping] ${problems.length} unescaped interpolation(s) of ${seen} in text position:\n`);
    for (const p of problems) console.error(`  ${p.where}\n    >\${ ${p.expr} }<\n`);
    console.error(
        'Between tags, an unescaped value is markup. Wrap it in escapeHtml() (exported\n'
        + 'from @aparte/core), or — if it is markup ON PURPOSE, like an icon provider\'s\n'
        + 'SVG — add `// safe-text: <reason>` to the line so the exemption is a sentence\n'
        + 'somebody wrote rather than a silence.\n',
    );
    process.exit(1);
}

console.log(
    `[text-escaping] OK: ${seen} text-position interpolations, all escaped, markup-by-contract, `
    + `or exempt (${exempt} marked at the use site, ${declaredExemptions} at a declaration).`,
);
