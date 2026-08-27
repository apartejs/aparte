/**
 * The Reference sidebar's order — in ONE place, because it was in six.
 *
 * Five of the seven Reference pages are generated, and each generator carried its own
 * hardcoded `sidebar.order`. Nobody could see two of them at once, so `engine.md` and
 * `icons.md` both claimed 3 and `wrappers.md` claimed nothing: a third of the section was
 * arranged by Starlight's alphabetical tiebreak rather than by a decision. Editing the
 * generated FILES does not help either — the docs `gen` step runs inside `typecheck`, so
 * a hand edit is overwritten before it can be committed. This is the only place that
 * decides.
 *
 * The order itself: the JS API first, then the styling surface, then the adjacent
 * packages. `config.md` is hand-written and carries its own `order: 1` in frontmatter —
 * it is listed here so this table is the whole picture rather than most of it.
 */
export const REFERENCE_ORDER = {
    'config.md': 1,          // aparteGlobalConfig, AparteClient, the transports
    'events.md': 2,          // the other half of the JS surface
    'css-variables.md': 3,   // the tokens
    'classes.mdx': 4,        // the classes those tokens paint
    'icons.md': 5,           // the glyph names
    'engine.md': 6,          // the adjacent package
    'wrappers.md': 7,        // the framework bridges
};

/** The order for one generated page, by its filename. Throws rather than guessing. */
export function referenceOrder(file) {
    const n = REFERENCE_ORDER[file];
    if (n === undefined) {
        throw new Error(
            `[reference-order] no order for "${file}". Add it to REFERENCE_ORDER — a page `
            + 'with no order falls back to an alphabetical tiebreak, which is how this '
            + 'module came to exist.',
        );
    }
    return n;
}
