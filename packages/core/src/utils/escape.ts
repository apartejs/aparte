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
 * Not exported from the package barrel: this is core's internal hygiene, not a
 * public API. Consumers who need to escape their own render-hook output have
 * `textContent` and the sanitizer.
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
 */
export const escapeAttr = escapeHtml;
