// @vitest-environment jsdom
/**
 * The scroll-to-bottom button, pressed from the keyboard, hands the focus to the transcript as it
 * hides.
 *
 * Once the glide reaches the bottom the button hides: transparent, out of the tab order and
 * `aria-hidden`. It kept the focus all the same: a screen reader was left on a node removed from
 * the accessibility tree, a sighted keyboard user had no focus ring anywhere, and Space or Enter
 * kept pressing a control nobody could see (axe: aria-hidden-focus). The transcript is a named tab
 * stop, the place the focus goes on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(async () => {
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
});

afterEach(() => { document.body.innerHTML = ''; });

/** A container that reports `top` of a 2000px thread in a 500px window. */
function scrolledTo(container: HTMLElement, top: number): void {
    Object.defineProperty(container, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(container, 'scrollTop', { configurable: true, get: () => top, set: () => {} });
    container.dispatchEvent(new Event('scroll'));
}

describe('the scroll-to-bottom button', () => {
    it('gives the focus to the transcript when it hides with the focus on it', () => {
        const vp = document.createElement('aparte-chat-viewport');
        document.body.appendChild(vp);
        const container = vp.querySelector<HTMLElement>('[role="log"]')!;
        const btn = vp.querySelector<HTMLElement>('.aparte-scroll-btn')!;
        scrolledTo(container, 0);
        expect(btn.getAttribute('aria-hidden'), 'shown while the thread is scrolled up').toBeNull();
        btn.focus();
        expect(document.activeElement).toBe(btn);

        // The glide reached the bottom: the button hides.
        scrolledTo(container, 1500);
        expect(btn.getAttribute('aria-hidden')).toBe('true');
        expect(document.activeElement, 'not left on a hidden control').not.toBe(btn);
        expect(document.activeElement).toBe(container);
    });

    it('takes nothing from anyone when it hides without the focus', () => {
        const vp = document.createElement('aparte-chat-viewport');
        const field = document.createElement('input');
        document.body.append(vp, field);
        const container = vp.querySelector<HTMLElement>('[role="log"]')!;
        scrolledTo(container, 0);
        field.focus();
        scrolledTo(container, 1500);
        expect(document.activeElement).toBe(field);
    });
});
