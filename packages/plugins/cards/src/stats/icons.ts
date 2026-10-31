/**
 * The stats card's glyphs: the six a figure may wear beside its label, and the card's own
 * for its one-line states.
 *
 * Drawn on a 24 × 24 grid in `currentColor` strokes, so the sheet colours them through
 * `color` and a theme follows. Constants of this package — the only markup the card parses.
 */

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** A coin stack: revenue, spend, a price. */
const MONEY = svg('<ellipse cx="12" cy="6.5" rx="6.5" ry="2.7"/><path d="M5.5 6.5v5c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7v-5"/><path d="M5.5 11.5v5c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7v-5"/>');

/** Two people: users, visitors, customers. */
const USERS = svg('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.2c.6-3.1 2.9-5 5.8-5s5.2 1.9 5.8 5"/><path d="M15.2 5.6a3.1 3.1 0 0 1 0 5.9"/><path d="M17.4 14.5c1.9.6 3.1 2.3 3.4 4.7"/>');

/** A trolley: orders, carts, sales. */
const CART = svg('<path d="M3 4h2.2l2.1 10.4a1.6 1.6 0 0 0 1.6 1.3h8a1.6 1.6 0 0 0 1.6-1.2L20.2 8H6.1"/><circle cx="9.5" cy="19.3" r="1.3"/><circle cx="17" cy="19.3" r="1.3"/>');

/** A rising line on its axes: growth, a rate, anything charted. */
const CHART = svg('<path d="M4 4v15.5a.5.5 0 0 0 .5.5H20"/><path d="M7.5 15.5l3.6-4.2 3 2.6 5.1-6.4"/><path d="M16.3 7.5h2.9v2.9"/>');

/** A clock: a duration, a response time, an uptime. */
const CLOCK = svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l2.9 1.9"/>');

/** A star: a rating, a score, a favourite. */
const STAR = svg('<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>');

/** The glyphs a figure may name in its `icon`. */
export const STAT_ICONS = { money: MONEY, users: USERS, cart: CART, chart: CHART, clock: CLOCK, star: STAR } as const;

/** Three bars of rising height: the card's own glyph, for its one-line states. */
export const BARS = svg('<path d="M5 20V13.5"/><path d="M12 20V8.5"/><path d="M19 20V4.5"/><path d="M3 20h18"/>');
