/** Where a floating box goes around its anchor. */
export interface AparteFloatingOptions {
    /** Distance from the anchor, in px. Default 4. */
    gap?: number;
    /** Room kept free at the edges of the window, in px. Default 8. */
    margin?: number;
    /** The side tried first. The opposite one is used when this one has no room and it has. Default `below`. */
    side?: 'below' | 'above' | 'beside';
    /** Which inline edge of the anchor the box lines up with, in the writing direction. Default `start`. */
    align?: 'start' | 'end';
    /** The writing direction is right to left. */
    rtl?: boolean;
}

/**
 * Writes `top` and `left` on a `position: fixed` box, turning it to the other side when the
 * window ends first. It measures once: a caller closes the box on scroll or resize, or calls
 * this again.
 */
export function placeFloating(
    anchor: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>,
    floating: HTMLElement,
    options: AparteFloatingOptions = {},
): void {
    const { gap = 4, margin = 8, side = 'below', align = 'start', rtl = false } = options;
    const box = floating.getBoundingClientRect();
    const clamp = (value: number, room: number, size: number): number => Math.max(margin, Math.min(value, room - size - margin));
    let top: number;
    let left: number;
    if (side === 'beside') {
        const after = anchor.right + gap;
        const before = anchor.left - box.width - gap;
        const [first, second] = rtl ? [before, after] : [after, before];
        const fits = (x: number): boolean => x >= margin && x + box.width <= window.innerWidth - margin;
        left = fits(first) || !fits(second) ? first : second;
        top = anchor.top;
    } else {
        const below = anchor.bottom + gap;
        const above = anchor.top - box.height - gap;
        const fitsBelow = below + box.height <= window.innerHeight - margin;
        const fitsAbove = above >= margin;
        if (side === 'below') top = fitsBelow || !fitsAbove ? below : above;
        else top = fitsAbove || !fitsBelow ? above : below;
        left = (align === 'start') !== rtl ? anchor.left : anchor.right - box.width;
    }
    // A window too short for either side still shows the start of the box.
    floating.style.top = `${clamp(top, window.innerHeight, box.height)}px`;
    floating.style.left = `${clamp(left, window.innerWidth, box.width)}px`;
}
