// @vitest-environment jsdom
/**
 * `<aparte-progress-spinner>` — published, documented, 16% function coverage.
 *
 * Its two modes are its whole contract: no `value` means an indeterminate spin,
 * a `value` means a real arc. Both are drawn by arithmetic on the SVG dash
 * properties, and arithmetic that nothing checks is arithmetic that drifts. The
 * accessibility half matters as much: it declares `role="progressbar"`, and a
 * progressbar that reports a stale or out-of-range `aria-valuenow` is worse for a
 * screen-reader user than one that reports none.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-progress-spinner.js';

const CIRC = 2 * Math.PI * 9; // r = 9 in a 24×24 viewBox, per the component

function mount(value?: string): HTMLElement {
    const el = document.createElement('aparte-progress-spinner');
    if (value !== undefined) el.setAttribute('value', value);
    document.body.appendChild(el);
    return el;
}

const fill = (el: HTMLElement): SVGCircleElement => el.querySelector<SVGCircleElement>('.aparte-spinner-fill')!;
const offset = (el: HTMLElement): number => parseFloat(fill(el).getAttribute('stroke-dashoffset')!);

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-progress-spinner', () => {
    it('declares itself a progressbar with a 0–100 range', () => {
        const el = mount();
        expect(el.getAttribute('role')).toBe('progressbar');
        expect(el.getAttribute('aria-valuemin')).toBe('0');
        expect(el.getAttribute('aria-valuemax')).toBe('100');
    });

    it('reports NO aria-valuenow while indeterminate', () => {
        // The distinction a screen reader needs: "working" versus "37% done".
        const el = mount();
        expect(el.hasAttribute('aria-valuenow')).toBe(false);
        // A partial arc, drawn as a dash pattern rather than a full ring.
        expect(fill(el).getAttribute('stroke-dasharray')).toContain(' ');
        expect(offset(el)).toBe(0);
    });

    it('reports aria-valuenow and a proportional arc when determinate', () => {
        const el = mount('50');
        expect(el.getAttribute('aria-valuenow')).toBe('50');
        // Half the ring hidden at 50%.
        expect(offset(el)).toBeCloseTo(CIRC / 2, 1);
    });

    it('draws an empty ring at 0 and a full one at 100', () => {
        expect(offset(mount('0'))).toBeCloseTo(CIRC, 1);
        document.body.innerHTML = '';
        expect(offset(mount('100'))).toBeCloseTo(0, 1);
    });

    it('clamps out-of-range values instead of drawing past the ring', () => {
        const over = mount('250');
        expect(over.getAttribute('aria-valuenow')).toBe('100');
        expect(offset(over)).toBeCloseTo(0, 1);
        document.body.innerHTML = '';
        const under = mount('-40');
        expect(under.getAttribute('aria-valuenow')).toBe('0');
        expect(offset(under)).toBeCloseTo(CIRC, 1);
    });

    it('treats an unparseable value as 0 rather than NaN', () => {
        // `parseFloat('abc') || 0`. Without the fallback the dash attributes would
        // read "NaN" and the arc would vanish silently.
        const el = mount('not-a-number');
        expect(el.getAttribute('aria-valuenow')).toBe('0');
        expect(Number.isNaN(offset(el))).toBe(false);
        expect(offset(el)).toBeCloseTo(CIRC, 1);
    });

    it('re-renders when the value attribute changes', () => {
        const el = mount('10');
        const first = offset(el);
        el.setAttribute('value', '90');
        expect(el.getAttribute('aria-valuenow')).toBe('90');
        expect(offset(el)).toBeLessThan(first);
    });

    it('drops back to indeterminate when the value is removed', () => {
        const el = mount('40');
        expect(el.hasAttribute('aria-valuenow')).toBe(true);
        el.removeAttribute('value');
        expect(el.hasAttribute('aria-valuenow')).toBe(false);
        expect(fill(el).getAttribute('stroke-dasharray')).toContain(' ');
    });

    it('hides its SVG from assistive tech, since the host carries the role', () => {
        const el = mount('25');
        expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
        expect(el.querySelectorAll('svg')).toHaveLength(1);
    });
});
