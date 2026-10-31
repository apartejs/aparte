/**
 * The order card's glyphs: the bag and the calendar that say which kind of record it is,
 * the box a line shows without a photo, the small marks before a fact (card, van, pin,
 * people, person, house, info), the chevron of a row that links out, and the seal of the
 * confirmation — a disc with a mark drawn on it.
 *
 * Drawn on a 24 × 24 grid in `currentColor` strokes (the seal on 64 × 64), so the sheet
 * colours them through `color` and a theme follows. Constants of this package — the only
 * markup the card parses.
 */

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** A shopping bag: an order, and the card's glyph on its one-line states. */
export const BAG = svg('<path d="M5.5 8h13l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.3a1.8 1.8 0 0 1-1.8-1.6z"/><path d="M9 10.5V6.8a3 3 0 0 1 6 0v3.7"/>');

/** A calendar page: a booking. */
export const CALENDAR = svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/><path d="M7.5 13.6h2M11 13.6h2M14.5 13.6h2M7.5 16.8h2M11 16.8h2"/>');

/** A parcel: the thumbnail of a line that has no photo, or whose photo failed. */
export const BOX = svg('<path d="M3.8 7.6 12 3.5l8.2 4.1v8.8L12 20.5l-8.2-4.1z"/><path d="M3.8 7.6 12 11.7l8.2-4.1M12 11.7v8.8"/>');

/** A delivery van, before the delivery row. */
export const TRUCK = svg('<path d="M2.8 6.5h10.4v9.3H2.8z"/><path d="M13.2 9.5h4.1l3 3.2v3.1h-7.1"/><circle cx="7" cy="17.3" r="1.7"/><circle cx="17" cy="17.3" r="1.7"/>');

/** A bank card, before the payment row. */
export const CARD = svg('<rect x="2.8" y="5.5" width="18.4" height="13" rx="2"/><path d="M2.8 9.6h18.4M6.5 15h3.5"/>');

/** A pin, before where a booking takes place. */
export const PIN = svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>');

/** Two people, before the number of guests. */
export const PEOPLE = svg('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.3" r="2.4"/><path d="M15.8 14.2c2.4-.3 4.3 1.3 4.8 4.3"/>');

/** One person, before the customer. */
export const PERSON = svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.7 3.6-5.8 7-5.8s6.2 2.1 7 5.8"/>');

/** A house, before the delivery address. */
export const HOUSE = svg('<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>');

/** A dot in a circle, before a fact of the tool's own. */
export const INFO = svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>');

/** A chevron at the end of a row that opens the order. Mirrored by the sheet in RTL. */
export const CHEVRON = svg('<path d="M9.5 6l6 6-6 6"/>');

/** The arrow between a stay's two dates. Mirrored by the sheet in RTL. */
export const ARROW = svg('<path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5"/>');

/** The marks a seal can carry, by its tone. Each is one path, drawn on in the sheet. */
const MARKS = {
    success: 'M22 32.5l7 7 13.5-14.5',
    info: 'M32 22v10.5l7 4.5',
    danger: 'M24.5 24.5l15 15M39.5 24.5l-15 15',
    neutral: 'M25.5 27.5h9.5a6.5 6.5 0 0 1 0 13h-8M30 22.5l-5 5 5 5',
} as const;

export type SealTone = keyof typeof MARKS;

/**
 * The confirmation's seal: a soft halo, a disc in the status' tone, and its mark. The mark
 * has `pathLength="1"` so the sheet draws it on with one dash, whatever its real length.
 */
export function seal(tone: SealTone): string {
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle class="aparte-order__seal-halo" cx="32" cy="32" r="31"/><circle class="aparte-order__seal-disc" cx="32" cy="32" r="22"/><path class="aparte-order__seal-mark" pathLength="1" d="${MARKS[tone]}"/></svg>`; // safe-attr: one of this file's four constant paths, never data
}
