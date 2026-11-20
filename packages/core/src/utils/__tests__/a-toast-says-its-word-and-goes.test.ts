// @vitest-environment jsdom
/**
 * `showToast`: a short message in a fixed corner, announced, that goes away on its own.
 *
 * The kit had the alert and no transient form: an app placed its own `role="status"` alert
 * above its lists and removed it with a timer of its own, which pushed the lists down while the
 * person was dragging. A toast stacks in a corner that never moves the layout, says itself to
 * assistive technology, waits while it is read (hovered or focused), and closes by its button or
 * Escape.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { showToast } from '../toast.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

const stack = () => document.body.querySelector<HTMLElement>(':scope > .aparte-toasts');
const toasts = () => [...(stack()?.querySelectorAll<HTMLElement>('.aparte-alert') ?? [])];

describe('a toast', () => {
    it('appears in a named, polite region in a corner, as a status, and goes after its time', () => {
        showToast('Saved.');
        vi.advanceTimersByTime(50);
        expect(stack()?.getAttribute('role')).toBe('region');
        expect(stack()?.getAttribute('aria-label')).toBe('Notifications');
        expect(stack()?.getAttribute('aria-live')).toBe('polite');
        const [toast] = toasts();
        expect(toast!.textContent).toContain('Saved.');
        expect(toast!.getAttribute('role')).toBe('status');
        expect(toast!.classList.contains('aparte-alert--info')).toBe(true);
        vi.advanceTimersByTime(4999);
        expect(toasts()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(toasts()).toHaveLength(0);
    });

    it('an error is an alert, in its tone', () => {
        showToast('The move failed.', { tone: 'danger' });
        vi.advanceTimersByTime(50);
        const [toast] = toasts();
        expect(toast!.getAttribute('role')).toBe('alert');
        expect(toast!.classList.contains('aparte-alert--danger')).toBe(true);
    });

    it('waits while it is hovered, and goes after the time it had left', () => {
        showToast('A reply is still running.', { timeout: 5000 });
        vi.advanceTimersByTime(50 + 4000);
        const [toast] = toasts();
        toast!.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(10000);
        expect(toasts(), 'still there while hovered').toHaveLength(1);
        toast!.dispatchEvent(new MouseEvent('mouseleave'));
        vi.advanceTimersByTime(999);
        expect(toasts()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(toasts()).toHaveLength(0);
    });

    it('closes by its button, by Escape, and by the handle; a timeout of 0 keeps it', () => {
        showToast('One', { timeout: 0 });
        vi.advanceTimersByTime(50);
        const second = showToast('Two', { timeout: 0 });
        const third = showToast('Three', { timeout: 0 });
        expect(toasts()).toHaveLength(3);
        vi.advanceTimersByTime(60000);
        expect(toasts(), 'a timeout of 0 stays').toHaveLength(3);
        toasts()[0]!.querySelector<HTMLButtonElement>('.aparte-alert__dismiss')!.click();
        expect(toasts().map((t) => t.textContent)).toEqual(['Two', 'Three']);
        second.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(toasts().map((t) => t.textContent)).toEqual(['Three']);
        third.close();
        third.close();
        expect(toasts()).toHaveLength(0);
    });

    it('its close button is named', () => {
        showToast('Saved.');
        vi.advanceTimersByTime(50);
        expect(toasts()[0]!.querySelector('.aparte-alert__dismiss')!.getAttribute('aria-label')).toBe('Dismiss');
    });
});
