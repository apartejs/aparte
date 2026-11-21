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

describe('several toasts, and the focus', () => {
    // The first toast waits for its new live region to be heard; a second one shown in the same
    // tick went in at once, ahead of the first and into that same unheard region.
    it('two toasts shown in one tick come in the order they were shown', () => {
        showToast('First');
        showToast('Second');
        expect(toasts(), 'neither before the region is in place').toHaveLength(0);
        vi.advanceTimersByTime(50);
        expect(toasts().map((t) => t.textContent)).toEqual(['First', 'Second']);
    });

    // Closed while it held the focus, the toast took the focused element with it: the focus fell to
    // <body>, and a keyboard user started again from the top of the page.
    it.each([
        ['by Escape', (t: HTMLElement) => t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
        ['by its button', (t: HTMLElement) => t.querySelector<HTMLButtonElement>('.aparte-alert__dismiss')!.click()],
    ])('closed %s while focused, it gives the focus back to where it came from', (_name, close) => {
        document.body.innerHTML = '<button id="before">Before</button>';
        const before = document.getElementById('before') as HTMLButtonElement;
        before.focus();
        showToast('Saved.', { timeout: 0 });
        vi.advanceTimersByTime(50);
        const [toast] = toasts();
        toast!.querySelector<HTMLButtonElement>('.aparte-alert__dismiss')!.focus();
        expect(document.activeElement?.className).toBe('aparte-alert__dismiss');
        close(toast!);
        expect(toasts()).toHaveLength(0);
        expect(document.activeElement).toBe(before);
    });

    // A toast that holds the focus stays, hovered or not: leaving it with the pointer did not
    // restart its time while the keyboard was still on it.
    it('a toast that holds the focus stays when the pointer leaves it', () => {
        showToast('Read me.', { timeout: 1000 });
        vi.advanceTimersByTime(50);
        const [toast] = toasts();
        toast!.querySelector<HTMLButtonElement>('.aparte-alert__dismiss')!.focus();
        toast!.dispatchEvent(new MouseEvent('mouseenter'));
        toast!.dispatchEvent(new MouseEvent('mouseleave'));
        vi.advanceTimersByTime(5000);
        expect(toasts()).toHaveLength(1);
    });
});

describe('a toast for an element', () => {
    // A chat inside a shadow root of the app loads the kit's sheet in that root: a toast added to
    // the document body had no style there. A dark chat on a light page got a light toast.
    it('goes in the shadow root its target is in', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<div class="chat"></div>';
        showToast('Saved.', { target: root.querySelector('.chat')! });
        vi.advanceTimersByTime(50);
        expect(stack(), 'nothing in the page').toBeNull();
        const inRoot = [...root.children].find((c) => c.classList.contains('aparte-toasts'));
        expect(inRoot?.textContent).toContain('Saved.');
    });

    it('wears the theme its target wears', () => {
        document.body.innerHTML = '<div data-aparte-theme="dark"><div class="chat"></div></div>';
        showToast('Saved.', { target: document.querySelector('.chat')! });
        vi.advanceTimersByTime(50);
        expect(toasts()[0]!.getAttribute('data-aparte-theme')).toBe('dark');
    });
});
