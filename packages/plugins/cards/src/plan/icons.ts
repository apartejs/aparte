/**
 * The plan card's glyphs: one per step status, the timeline's "current" node, a clock for
 * the elapsed time, and the card's own for its one-line states.
 *
 * Drawn on a 24 × 24 grid in `currentColor`, so the sheet colours each status through
 * `color` and a theme follows. The check and the cross inside a disc are drawn in the
 * card's surface (`.aparte-plan__mark`), so they read in light and dark alike. Constants
 * of this package — the only markup the card parses.
 */

const svg = (body: string, className?: string) =>
    `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`; // safe-attr: a class name this file passes, a constant, never data // safe-text: this package's own SVG, built from its glyph constants

/** An empty ring: not started yet. */
const PENDING = svg('<circle cx="12" cy="12" r="8"/>');

/** A faint ring with a quarter of it drawn, which the sheet turns: running now. Still under reduced motion. */
const RUNNING = svg('<circle cx="12" cy="12" r="8" opacity="0.4"/><path d="M12 4a8 8 0 0 1 8 8"/>', 'aparte-plan__spinner');

/** A filled disc with a check: done. */
const DONE = svg('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path class="aparte-plan__mark" d="M8.2 12.4l2.6 2.6 5-5.4"/>');

/** A filled disc with a cross: failed. */
const FAILED = svg('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path class="aparte-plan__mark" d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4"/>');

/** A dashed ring crossed by a dash: skipped, left out on purpose. */
const SKIPPED = svg('<circle cx="12" cy="12" r="8" stroke-dasharray="2.4 2.6"/><path d="M8.6 12h6.8"/>');

/** A padlock: blocked, waiting on something outside the plan. */
const BLOCKED = svg('<rect x="6" y="10.6" width="12" height="9" rx="2.2"/><path d="M8.9 10.6V8.2a3.1 3.1 0 0 1 6.2 0v2.4"/>');

/** The glyph each status wears in a list. */
export const STATUS_GLYPHS = {
    pending: PENDING,
    'in-progress': RUNNING,
    done: DONE,
    failed: FAILED,
    skipped: SKIPPED,
    blocked: BLOCKED,
} as const;

/** The timeline's node for the step under way: a ring round a dot, which the sheet makes pulse. */
export const NODE_CURRENT = svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>');

/** A clock, beside the elapsed time. */
export const CLOCK = svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l2.9 1.9"/>');

/** A clipboard with two ticked lines: the card's own glyph, for its one-line states. */
export const PLAN = svg('<rect x="5" y="4.5" width="14" height="16.5" rx="2.2"/><path d="M9.2 4.5V3.8a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v.7"/><path d="M8.4 10.6l1.4 1.4 2.4-2.6"/><path d="M14.2 10.6h1.8"/><path d="M8.4 16.1l1.4 1.4 2.4-2.6"/><path d="M14.2 16.1h1.8"/>');
