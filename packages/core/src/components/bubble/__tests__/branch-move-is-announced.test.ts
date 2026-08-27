/**
 * Moving between branches has to reach a screen reader.
 *
 * The arrows deliberately do NOT take focus — pressing `›` should not steal the caret
 * from wherever the reader was — which means the only thing left to signal the change is
 * a live region. There wasn't one: `.aparte-sr-only` existed in the bubble, but inside
 * the WAITING indicator, written only with the locale's "typing" label. So a
 * screen-reader user pressing next got a different answer and no indication that anything
 * had happened.
 *
 * The accessibility guide described this behaviour as if it shipped, which is how the gap
 * survived: the sentence was true of the design and false of the code.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';

type BubbleEl = HTMLElement & {
    setSiblings(count: number, index: number): void;
};

function bubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    document.body.appendChild(el);
    return el;
}

const status = (el: HTMLElement) => el.querySelector('.aparte-branch-status');

beforeAll(async () => {
    await customElements.whenDefined('aparte-chat-bubble');
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the branch picker announces its move', () => {
    it('is a polite live region, so it does not interrupt', () => {
        const el = bubble();
        el.setSiblings(2, 0);
        expect(status(el)?.getAttribute('aria-live')).toBe('polite');
    });

    it('carries the position, and updates when the branch changes', () => {
        const el = bubble();
        el.setSiblings(3, 0);
        expect(status(el)?.textContent).toBe('1 / 3');

        el.setSiblings(3, 2);
        expect(status(el)?.textContent).toBe('3 / 3');
    });

    it('is visually hidden, so it costs the sighted reader nothing', () => {
        const el = bubble();
        el.setSiblings(2, 1);
        expect(status(el)?.classList.contains('aparte-sr-only')).toBe(true);
    });

    it('is separate from the visible label, which a custom renderer may replace', () => {
        const el = bubble();
        el.setSiblings(2, 1);
        const label = el.querySelector('.aparte-branch-label');
        expect(label).not.toBeNull();
        expect(status(el)).not.toBe(label);
        // Both say the position today; only one of them is guaranteed to keep saying it.
        expect(status(el)?.textContent).toBe('2 / 2');
    });
});
