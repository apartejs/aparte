/*
 * Makes hand-written prose safe to drop into an MDX page.
 *
 * The prose these generators emit comes from JSDoc written for developers, so it is full of
 * `<aparte-composer>` — and roughly half of those occurrences are not inside backticks, because
 * a docblock reader does not need them to be. MDX parses a bare `<tag>` as JSX and fails the
 * whole build with "Expected a closing tag", which is how 18 generated pages took the docs site
 * down at once.
 *
 * Backticks rather than `&lt;`: a tag name is code, so it should read as code on the page, and
 * the authors who did wrap theirs were right. Code spans are left exactly as they are — the
 * whole point is not to double-wrap what is already correct.
 */

/** `<a-tag>`, `</a-tag>`, `<a-tag />` — lowercase and hyphenated, i.e. a custom element name. */
const BARE_TAG = /<(\/?)([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(\s*\/?)>/g;

/**
 * Any other `<` that starts something MDX would read as a tag. `<` before a space or a digit is
 * arithmetic and left alone, which is why this is not a blanket escape.
 */
const OPENING_ANGLE = /<(?=[A-Za-z/])/g;

export function mdxSafe(text) {
    // Split on code spans and fenced blocks so their contents are never touched. The capture
    // group keeps the delimiters in the result, and every odd index is a code span.
    const parts = String(text ?? '').split(/(`{1,3}[^`]*`{1,3})/);
    return parts
        .map((part, i) => {
            if (i % 2 === 1) return part;
            return (
                part
                    .replace(BARE_TAG, (_m, slash, name, tail) => `\`<${slash}${name}${tail.trim()}>\``)
                    .replace(OPENING_ANGLE, '&lt;')
                    // The second hazard, and the one that is easy to miss because it does not look
                    // like markup: MDX reads `{` as the start of a JSX expression. Prose that says
                    // `AparteClient({ autoRegister: false })` outside backticks fails the parse with
                    // "Unexpected content after expression", pointing at a column rather than at the
                    // brace. Both braces are escaped, since an unbalanced one breaks just as loudly.
                    .replace(/\{/g, '&#123;')
                    .replace(/\}/g, '&#125;')
            );
        })
        .join('');
}
