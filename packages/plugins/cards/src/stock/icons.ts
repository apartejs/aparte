/**
 * The stock card's glyphs: the arrows beside a change, and the card's own glyph for its
 * one-line states.
 *
 * Constants of this package — the only markup the card parses. The arrows are filled in
 * `currentColor`, so the change's colour reaches them through `color`; the sign written
 * beside them says the same thing in text, so neither the colour nor the arrow is alone.
 */

/** A small filled triangle, pointing up. */
export const UP = '<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M6 2.2l4.3 6.6H1.7z"/></svg>';

/** The same, pointing down. */
export const DOWN = '<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M6 9.8L1.7 3.2h8.6z"/></svg>';

/** A rising line over an axis: the card's glyph when it has nothing to draw. */
export const CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 4v15.5h17"/><path d="M6.5 15l4-4.5 3 2.5 5.5-6.5"/><path d="M15.8 6.5h3.2v3.2"/></svg>';
