/**
 * HTML escaping — one implementation, for every interpolation core makes.
 *
 * There used to be SEVEN copies of this across the package (`_escapeHtml` in the
 * bubble and in the config, `_escapeAttr` in the chat shell, the composer action
 * and the composer input, plus `escapeHtml` and `escapeAttr` in the segment
 * renderers). They had already drifted: the chat shell's copy escaped only `&`,
 * `"` and `<`, leaving `'` and `>` through, so it was strictly weaker than its
 * six siblings while looking identical at the call site. That is the failure mode
 * a duplicated security helper always ends in — one of them stops matching, and
 * nothing tells you which.
 *
 * Escapes all five characters that matter, which makes the result safe in BOTH
 * text position and quoted-attribute position (single or double quotes). Callers
 * that read better saying "attribute" use {@link escapeAttr}, which is this same
 * function under a second name — an alias, deliberately not a second body.
 *
 * PUBLIC. Both names are exported from the barrel and documented in the
 * customization guide, because a render hook that returns a string needs them and
 * telling an author to "escape it yourself" without naming the function is how a
 * capability becomes invisible. An earlier version of this comment claimed the
 * opposite ("not exported from the package barrel… not a public API") while
 * `index.ts` exported both — the export was real, the comment was not.
 */
export function escapeHtml(value: string): string {
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
 * and none of those five escaped characters is one of them. An audit raised this
 * as a latent gap (no unquoted interpolation exists in the library today).
 *
 * The fix is to quote the attribute, not to escape harder: encoding spaces would
 * make every legitimate `title="Hello world"` read `Hello&#32;world`. So
 * `pnpm check:attr-escaping` now rejects an unquoted attribute interpolation
 * outright rather than trusting this function to cover a position it cannot.
 */
export const escapeAttr = escapeHtml;
