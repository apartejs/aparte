/**
 * The items card's two glyphs: the stack it shows on its one-line state drawing, and the
 * picture that stands in for an image a result did not give (or that failed to load).
 *
 * Line drawings in `currentColor`, so the sheet tints them with a token and they follow
 * the theme. Constants of this package — the only markup the card parses.
 */

/** Three cards fanned out: "a set of results", on the waiting / refused / failed line. */
export const ITEMS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="12" height="14" rx="2.2"/><path d="M18 7.5v10.3a2.2 2.2 0 0 1-1.2 2" opacity="0.7"/><path d="M21 9v7.6" opacity="0.45"/><path d="M6 15.5l2.3-2.6a1 1 0 0 1 1.5 0l2.2 2.6"/><circle cx="11.2" cy="10.2" r="1.2"/></svg>`;

/** A framed landscape: the placeholder where an item has no picture. */
export const IMAGE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="M3.5 17.2l4.9-4.6a1.4 1.4 0 0 1 1.9 0l3.4 3.2"/><path d="M12.4 14.6l2.4-2.2a1.4 1.4 0 0 1 1.9 0l3.8 3.6"/></svg>`;
