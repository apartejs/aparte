/*
 * The names the two escaping guards must agree on.
 *
 * `check-attr-escaping` and `check-text-escaping` police the two positions an
 * interpolation can land in — inside a quoted attribute value, and between tags.
 * They ask different questions, but they must never disagree about what counts as
 * an escaper: a name added to one list and not the other is a hole that opens
 * silently in whichever guard was forgotten.
 *
 * That is not hypothetical. The attribute guard's own history is a list of times
 * this exact set was wrong — `String(x)` was in it and escapes nothing,
 * `encodeURIComponent` leaves `'` untouched, and matching `esc(` as a substring
 * blessed every identifier ending in those letters (`desc(`). Each of those cost a
 * real hole. One definition, imported twice.
 */

/**
 * Functions that make a value safe to interpolate. Matched as WHOLE identifiers,
 * never as substrings.
 *
 * `_escape` / `_esc` / `esc` are here because several components define a private
 * escaper rather than importing the shared one.
 */
export const ESCAPER_NAMES = new Set([
    'escapeHtml', 'escapeAttr', 'cssEscape', 'esc', '_esc', '_escape',
    'escapeClosingScriptTag',
]);

/**
 * Calls whose RETURN VALUE is markup by contract, so interpolating it between tags
 * is the intended use and escaping it would break the feature.
 *
 * This list only makes sense in TEXT position — in an attribute value every one of
 * these would still be a defect, which is why it lives here and not in the shared
 * escaper set.
 *
 *   • `getIcon` — icons are inline SVG. The whole `AparteIconProvider` contract is
 *     "return markup", documented as "the value is treated as trusted markup", and
 *     the consumer supplies it deliberately.
 *   • `renderMarkdown` — passes through the configured `AparteSanitizer` before it
 *     returns (default: core's allowlist sanitiser). Escaping it would render the
 *     markdown as source, which is the bug the sanitiser exists to avoid.
 *   • `collectRendererStyles` — CSS the renderers declare, injected into a `<style>`.
 *   • `buildElicitationPanel` — markup core itself composed, already escaped inside.
 */
export const TRUSTED_MARKUP_CALLS = new Set([
    'getIcon', 'renderMarkdown', 'collectRendererStyles', 'buildElicitationPanel',
    // Returns the markup for one <button> — that IS its return type. It escapes the
    // label, the class list and every data value itself, which is the point of routing
    // every control through it; the only thing it passes through untouched is the icon,
    // and that is `getIcon` output one line up. Listed here as a contract rather than
    // re-exempted at each of its call sites.
    'controlMarkup',
]);

/** Every `name(` called anywhere in an expression, as bare identifiers. */
export function calledNames(expr) {
    return [...expr.matchAll(/([\w$]+)\s*\(/g)].map((m) => m[1]);
}

/**
 * Blank out comments, preserving line and column positions.
 *
 * Without this a JSDoc `@example` is read as code — a mistake both guards made, and
 * the reason `check-attr-escaping` reported six phantom sites the first time it was
 * widened.
 */
export function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:/])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
}

/**
 * Locals whose value is PRODUCED by an escaper — `const name = escapeHtml(a.name)`.
 *
 * Anchored to the start of the right-hand side on purpose. The first version matched
 * an escaper anywhere in the initialiser, so `const v = raw + escapeHtml('')` passed.
 */
export function preEscapedLocals(src) {
    const names = [...ESCAPER_NAMES].join('|');
    const re = new RegExp(
        String.raw`(?:const|let)\s+([\w$]+)\s*=\s*(?:await\s+)?\(?\s*(?:this\.)?(?:${names})\s*\(`,
        'g',
    );
    return new Set([...src.matchAll(re)].map((m) => m[1]));
}
