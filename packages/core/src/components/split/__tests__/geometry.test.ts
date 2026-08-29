/**
 * The split's arithmetic. No DOM, no jsdom directive: these are the numbers the drag
 * and the arrow keys are made of, proven where a test can read them — the element's
 * own suite can then assert on attributes and events instead of on pixels jsdom does
 * not have.
 */
import { describe, it, expect } from 'vitest';
import { nextPosition, keyDelta } from '../geometry.js';

const step = (over: Partial<Parameters<typeof nextPosition>[0]> = {}): Parameters<typeof nextPosition>[0] => ({
    startPercent: 38,
    deltaPx: 0,
    containerPx: 1000,
    rtl: false,
    vertical: false,
    ...over,
});

describe('nextPosition', () => {
    it('a pixel delta becomes a percentage of the container', () => {
        expect(nextPosition(step({ deltaPx: 100 }))).toBe(48);
        expect(nextPosition(step({ deltaPx: -80 }))).toBe(30);
    });

    it('it clamps to 0 and 100', () => {
        expect(nextPosition(step({ deltaPx: -1000 }))).toBe(0);
        expect(nextPosition(step({ deltaPx: 1000 }))).toBe(100);
    });

    it('a right-to-left drag moves the other way', () => {
        expect(nextPosition(step({ deltaPx: 100, rtl: true }))).toBe(28);
        expect(nextPosition(step({ deltaPx: -100, rtl: true }))).toBe(48);
    });

    it('the vertical axis reads the same arithmetic', () => {
        expect(nextPosition(step({ deltaPx: 100, vertical: true }))).toBe(48);
        // rtl is a writing direction, not a gravity: it never inverts the block axis.
        expect(nextPosition(step({ deltaPx: 100, vertical: true, rtl: true }))).toBe(48);
    });

    it('a zero-width container yields a number, not NaN', () => {
        expect(nextPosition(step({ deltaPx: 100, containerPx: 0 }))).toBe(38);
        expect(nextPosition(step({ deltaPx: 100, containerPx: Number.NaN }))).toBe(38);
    });

    it('the end pane grows the other way', () => {
        // The sized track is last, so the seam sits at `100 - handle - position`: a
        // pointer travelling right makes the END pane smaller, not bigger.
        expect(nextPosition(step({ deltaPx: 100, primaryEnd: true }))).toBe(28);
        expect(nextPosition(step({ deltaPx: -100, primaryEnd: true }))).toBe(48);
    });

    it('and right-to-left un-inverts it again', () => {
        // Two mirrors: the pane is on the left and the axis runs the other way, so the
        // pointer and the seam agree once more.
        expect(nextPosition(step({ deltaPx: 100, primaryEnd: true, rtl: true }))).toBe(48);
        // The block axis has no reading direction, so only `primaryEnd` bites.
        expect(nextPosition(step({ deltaPx: 100, primaryEnd: true, rtl: true, vertical: true }))).toBe(28);
    });
});

describe('keyDelta', () => {
    it('arrow steps are one, and ten with shift', () => {
        expect(keyDelta('ArrowRight', false, false, false)).toBe(1);
        expect(keyDelta('ArrowRight', true, false, false)).toBe(10);
        expect(keyDelta('ArrowLeft', false, false, false)).toBe(-1);
        expect(keyDelta('ArrowLeft', true, false, false)).toBe(-10);
    });

    it('Home and End are the extremes', () => {
        expect(keyDelta('Home', false, false, false)).toBe(-100);
        expect(keyDelta('End', false, false, false)).toBe(100);
        // Shift and the reading direction leave the extremes alone: they are already there.
        expect(keyDelta('Home', true, true, true)).toBe(-100);
        expect(keyDelta('End', true, true, true)).toBe(100);
    });

    it('right-to-left swaps the arrows, never the up and down', () => {
        expect(keyDelta('ArrowLeft', false, true, false)).toBe(1);
        expect(keyDelta('ArrowRight', false, true, false)).toBe(-1);
        expect(keyDelta('ArrowUp', false, true, true)).toBe(-1);
        expect(keyDelta('ArrowDown', false, true, true)).toBe(1);
    });

    it('the end pane swaps the arrows, and leaves Home and End alone', () => {
        // An arrow names where the SEAM goes; Home and End name the primary pane's own
        // extremes, and its minimum is its minimum whichever end it sits at.
        expect(keyDelta('ArrowRight', false, false, false, true)).toBe(-1);
        expect(keyDelta('ArrowLeft', true, false, false, true)).toBe(10);
        expect(keyDelta('ArrowDown', false, false, true, true)).toBe(-1);
        expect(keyDelta('Home', false, false, false, true)).toBe(-100);
        expect(keyDelta('End', false, false, false, true)).toBe(100);
        // Both mirrors at once cancel, as they do for the pointer.
        expect(keyDelta('ArrowRight', false, true, false, true)).toBe(1);
    });

    it('a key that is not ours returns null', () => {
        expect(keyDelta('a', false, false, false)).toBeNull();
        expect(keyDelta('ArrowUp', false, false, false), 'the block arrows while horizontal').toBeNull();
        expect(keyDelta('ArrowLeft', false, false, true), 'the inline arrows while vertical').toBeNull();
        expect(keyDelta('PageUp', false, false, false)).toBeNull();
    });
});
