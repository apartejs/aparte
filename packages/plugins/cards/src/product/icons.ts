/**
 * The product card's glyphs: the bag a tile shows when it has no photo, the van beside a
 * delivery line, the loupe before a search that is still running.
 *
 * Drawn on a 24 × 24 grid in `currentColor` strokes, so the sheet colours them through
 * `color` and a theme follows. Constants of this package — the only markup the card parses.
 */

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** A shopping bag: the placeholder where a photo is missing or failed to load. */
export const BAG = svg('<path d="M5.5 8h13l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.3a1.8 1.8 0 0 1-1.8-1.6z"/><path d="M9 10.5V6.8a3 3 0 0 1 6 0v3.7"/>');

/** A delivery van, before the shipping line. */
export const TRUCK = svg('<path d="M2.8 6.5h10.4v9.3H2.8z"/><path d="M13.2 9.5h4.1l3 3.2v3.1h-7.1"/><circle cx="7" cy="17.3" r="1.7"/><circle cx="17" cy="17.3" r="1.7"/>');

/** A loupe, before the query a running search was given. */
export const SEARCH = svg('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5l4.7 4.7"/>');

/** The card's own glyph, for its one-line states (waiting, refused, failed). */
export const TAG = svg('<path d="M3.5 12.6V4.8a1.3 1.3 0 0 1 1.3-1.3h7.8l8 8a1.3 1.3 0 0 1 0 1.8l-7 7a1.3 1.3 0 0 1-1.8 0z"/><circle cx="8.3" cy="8.3" r="1.5"/>');
