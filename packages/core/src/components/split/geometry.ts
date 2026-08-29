/**
 * The split's arithmetic, with no DOM in it.
 *
 * Separate from the element on purpose: a pointer drag is the path jsdom exercises
 * worst — it has no layout, no `PointerEvent` and no pointer capture — so the numbers
 * are proven here, in plain functions a test can call, and the element is left with
 * the listeners and the attributes.
 *
 * Nothing here parses a CSS unit. `--aparte-split-min` and `--aparte-split-max` are
 * clamp bounds in the grid template, so the browser clamps the pane and this module
 * only ever moves a percentage between 0 and 100.
 */

/** One step of a drag: where it started, how far the pointer went, and along which axis. */
export interface SplitStep {
    /** The primary pane's size when the gesture began, as a percentage of the container. */
    startPercent: number;
    /** How far the pointer has travelled since, in CSS pixels, along the split's axis. */
    deltaPx: number;
    /** The container's size along that same axis. */
    containerPx: number;
    /** The computed reading direction is right-to-left. Ignored on the vertical axis. */
    rtl: boolean;
    /** The split's orientation is `vertical` — the panes are stacked, the axis is the block one. */
    vertical: boolean;
    /**
     * `primary="end"`: the sized track is the LAST one, so the seam's distance from the
     * container's start is `100% - handle - position` and a bigger number moves the seam
     * TOWARD the start. Without this the seam runs away from the pointer.
     */
    primaryEnd?: boolean;
}

/** Keep `value` inside `[min, max]`, and answer `min` for anything that is not a number. */
function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return value < min ? min : value > max ? max : value;
}

/**
 * The primary pane's new size, as a percentage of the container, clamped to 0..100.
 *
 * A right-to-left drag moves the other way: in `rtl` the start pane is on the right, so
 * a pointer travelling in +x makes it smaller. The block axis never inverts — `rtl` is a
 * writing direction, not a gravity — so it is ignored when `vertical`.
 *
 * `primaryEnd` inverts it too, and for a different reason: the pane being sized is the
 * one the pointer moves AWAY from. The two inversions compose — an `rtl` split whose
 * primary is the end pane reads like a plain one again — so they are XORed, not summed.
 *
 * A container of zero (measured before layout, or while display:none) yields the
 * starting value rather than `Infinity`: the caller gets a number it can write back.
 */
export function nextPosition(step: SplitStep): number {
    const start = Number.isFinite(step.startPercent) ? step.startPercent : 0;
    if (!Number.isFinite(step.containerPx) || step.containerPx <= 0) return clamp(start, 0, 100);
    const inverted = (!step.vertical && step.rtl) !== (step.primaryEnd === true);
    const sign = inverted ? -1 : 1;
    const moved = (sign * step.deltaPx * 100) / step.containerPx;
    return clamp(start + moved, 0, 100);
}

/**
 * How far a key moves the seam, in percentage points — or `null` for a key that is not
 * ours, so the handler can leave the page's own scrolling alone.
 *
 * Shift is ×10. That is an ecosystem convention (Shoelace's `×10`, Zag's delta of 10),
 * NOT the APG, which specifies only the single step: it is here because a 1% step across
 * a 1600px window is 16px and nobody arrows a pane across a screen one percent at a time.
 *
 * Home and End are the extremes as ±100: the clamp in `nextPosition` — and then the CSS
 * clamp in the grid — decide where that actually lands, so a `--aparte-split-min` of
 * `20rem` means Home stops at 20rem without this function knowing what a rem is.
 *
 * `primaryEnd` mirrors the ARROWS only, for the same reason `nextPosition` mirrors the
 * pointer: an arrow names a direction the SEAM travels in. Home and End name the primary
 * pane's own extremes — its minimum is its minimum whichever end it sits at — so they are
 * left alone.
 */
export function keyDelta(
    key: string,
    shift: boolean,
    rtl: boolean,
    vertical: boolean,
    primaryEnd = false,
): number | null {
    if (key === 'Home') return -100;
    if (key === 'End') return 100;
    const step = (shift ? 10 : 1) * (primaryEnd ? -1 : 1);
    if (vertical) {
        if (key === 'ArrowUp') return -step;
        if (key === 'ArrowDown') return step;
        return null;
    }
    if (key === 'ArrowLeft') return rtl ? step : -step;
    if (key === 'ArrowRight') return rtl ? -step : step;
    return null;
}
