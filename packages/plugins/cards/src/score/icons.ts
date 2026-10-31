/**
 * The score card's glyphs: one per sport, one per match event, and the few the footer
 * wears (the venue, the broadcast, the way to the match page).
 *
 * Drawn on a 24 × 24 grid in `currentColor`, so the sheet colours them through `color`
 * and a theme follows — the cards are the exception, filled, because a yellow card is a
 * filled rectangle and nothing else reads as one. Constants of this package: the only
 * markup the card parses.
 */

const svg = (body: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-text: this package's own SVG, built from its glyph constants

/** A football: the centre pentagon and the seams running out of it. */
const FOOTBALL = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.6l4.2 3-1.6 4.9H9.4L7.8 10.6z"/><path d="M12 7.6V3.2M16.2 10.6l4.3-1.3M14.6 15.5l2.6 3.7M9.4 15.5l-2.6 3.7M7.8 10.6L3.5 9.3"/>');

const BASKETBALL = svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.7 5.6a9 9 0 0 1 0 12.8M18.3 5.6a9 9 0 0 0 0 12.8"/>');

const TENNIS = svg('<circle cx="12" cy="12" r="9"/><path d="M5.9 5.2c2.5 1.9 3.9 4.2 3.9 6.8s-1.4 4.9-3.9 6.8"/><path d="M18.1 5.2c-2.5 1.9-3.9 4.2-3.9 6.8s1.4 4.9 3.9 6.8"/>');

/** An oval ball with its seam: rugby. American football has the same ball with laces. */
const RUGBY = svg('<ellipse cx="12" cy="12" rx="9.6" ry="5.6" transform="rotate(-45 12 12)"/><path d="M7.2 16.8C10 15.6 15.6 10 16.8 7.2"/>');

const AMERICAN_FOOTBALL = svg('<ellipse cx="12" cy="12" rx="9.6" ry="5.6" transform="rotate(-45 12 12)"/><path d="M9.6 14.4l4.8-4.8M10.4 11.6l2 2M11.6 10.4l2 2"/>');

/** A stick and its puck. */
const HOCKEY = svg('<path d="M6.5 3l6.6 14.2a1.4 1.4 0 0 0 1.3.8H20"/><ellipse cx="7.5" cy="18.4" rx="3.2" ry="1.5"/>');

const BASEBALL = svg('<circle cx="12" cy="12" r="9"/><path d="M7.3 4.3a11 11 0 0 1 0 15.4M16.7 4.3a11 11 0 0 0 0 15.4"/><path d="M8.6 8.2l1.4-.5M9 12h1.5M8.6 15.8l1.4.5M15.4 8.2l-1.4-.5M15 12h-1.5M15.4 15.8l-1.4.5"/>');

/** A cup: any other sport, and the card's own glyph for its one-line states. */
export const TROPHY = svg('<path d="M8 4h8v5.2a4 4 0 0 1-8 0z"/><path d="M8 6H5.2a3 3 0 0 0 3 4.2M16 6h2.8a3 3 0 0 1-3 4.2"/><path d="M12 13.2v3.6M8.5 20h7M9.8 16.8h4.4V20H9.8z"/>');

/** The glyph a match wears beside its competition, by sport. */
export const SPORT_GLYPHS = {
    football: FOOTBALL,
    basketball: BASKETBALL,
    tennis: TENNIS,
    rugby: RUGBY,
    hockey: HOCKEY,
    baseball: BASEBALL,
    'american-football': AMERICAN_FOOTBALL,
    generic: TROPHY,
} as const;

/** A card held up: the sheet fills it yellow or red. */
const CARD = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="3.5" width="10" height="16" rx="1.6" fill="currentColor" transform="rotate(8 12 11.5)"/></svg>';

/** Two arrows, one going off, one coming on. */
const SUB = svg('<path d="M7.5 4v13.5M4 14l3.5 3.5L11 14"/><path d="M16.5 20V6.5M13 10l3.5-3.5L20 10"/>');

/** A goal is the ball; a penalty and an own goal also say their word beside it. */
export const EVENT_GLYPHS = {
    goal: FOOTBALL,
    penalty: FOOTBALL,
    'own-goal': FOOTBALL,
    yellow: CARD,
    red: CARD,
    sub: SUB,
} as const;

export const PIN = svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>');

export const TV = svg('<rect x="3" y="6.5" width="18" height="12" rx="2"/><path d="M8.5 21h7M9 3l3 3.5L15 3"/>');

export const CHEVRON = svg('<path d="M9.5 6l6 6-6 6"/>');
