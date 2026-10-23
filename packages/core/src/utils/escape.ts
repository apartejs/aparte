/**
 * HTML escaping — one implementation, for every interpolation core makes.
 *
 * Escapes all five characters that matter, which makes the result safe in BOTH
 * text position and quoted-attribute position (single or double quotes). Callers
 * that read better saying "attribute" use {@link escapeAttr}, which is this same
 * function under a second name — an alias, deliberately not a second body.
 *
 * PUBLIC. Both names are exported from the barrel and documented in the
 * customization guide, because a render hook that returns a string needs them.
 */
export function escapeHtml(value: string): string {
    // The single implementation for the whole package: duplicated copies of a security
    // helper drift apart, and nothing at the call site says which one stopped matching.
    let out = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '&') out += '&amp;';
        else if (ch === '<') out += '&lt;';
        else if (ch === '>') out += '&gt;';
        else if (ch === '"') out += '&quot;';
        else if (ch === "'") out += '&#039;';
        else out += ch;
    }
    return out;
}

/**
 * The same escaping as {@link escapeHtml}, named for the position it guards.
 *
 * An attribute value needs exactly the same five characters escaped as a text
 * node — quotes to keep the value from ending early, angle brackets so a broken
 * value cannot start a tag, and the ampersand so none of it can be smuggled back
 * in as an entity. Two names, one body.
 *
 * REQUIRES A QUOTED ATTRIBUTE. `title="${escapeAttr(v)}"` and `title='…'` are
 * both safe; bare `title=${escapeAttr(v)}` is NOT, because a space, tab, newline
 * or backtick in the value ends an unquoted attribute and starts the next one —
 * and none of those five escaped characters is one of them. No unquoted attribute
 * interpolation exists in the library.
 *
 * The fix is to quote the attribute, not to escape harder: encoding spaces would
 * make every legitimate `title="Hello world"` read `Hello&#32;world`.
 */
export const escapeAttr = escapeHtml;
// In this repo, `pnpm check:attr-escaping` rejects an unquoted attribute interpolation
// outright rather than trusting `escapeAttr` to cover a position it cannot.
