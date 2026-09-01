// @vitest-environment jsdom
/**
 * What the bubble's DOM says to a host form, a screen reader and a keyboard (UI audit
 * LOT 6). Three things, each once broken:
 *
 * - A copy button inside a host `<form>` submitted it: the button had no `type`.
 * - The code block's copy button was named by `title` alone — the only icon button
 *   core emits without an `aria-label`, so the name depended on the platform reading a
 *   tooltip, which a screen reader does not.
 * - The reasoning panel is a scroll container (`max-height` + `overflow-y: auto`) with
 *   no tab stop, so a keyboard reader on Safari could not scroll it.
 *
 * Markdown tables scroll sideways too and are deliberately NOT given a tab stop: the
 * markup is the markdown provider's, most tables do not overflow, and a static
 * `tabindex` would cost a stop on every one of them. Chrome (130) and Firefox (129)
 * make an overflowing scroller focusable on their own; the reasoning panel is marked
 * because it is core's own markup and always a scroller.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { setSegments(segments: AparteSegment[]): void };

function mountBubble(parent: HTMLElement, segments: AparteSegment[]): BubbleEl {
    const bubble = document.createElement('aparte-chat-bubble') as BubbleEl;
    bubble.setAttribute('data-role', 'assistant');
    bubble.setAttribute('message-id', 'a1');
    parent.appendChild(bubble);
    bubble.setSegments(segments);
    return bubble;
}

beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.resolve()) },
        configurable: true,
    });
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('inside a host <form>', () => {
    it('copying a code block does not submit the form', () => {
        const form = document.createElement('form');
        document.body.appendChild(form);
        let submitted = 0;
        form.addEventListener('submit', (e) => { e.preventDefault(); submitted++; });
        const bubble = mountBubble(form, [{ id: 'c', type: 'code', language: 'ts', content: 'const a = 1;' }]);

        (bubble.querySelector('.aparte-code-copy') as HTMLButtonElement).click();

        expect(submitted).toBe(0);
    });

    it('every button the bubble renders is type="button"', () => {
        const bubble = mountBubble(document.body, [
            { id: 'x', type: 'text', content: 'The answer.' },
            { id: 'c', type: 'code', language: 'ts', content: 'const a = 1;' },
        ]);
        const buttons = [...bubble.querySelectorAll('button')];
        expect(buttons.length).toBeGreaterThanOrEqual(3);
        expect(buttons.filter((b) => b.getAttribute('type') !== 'button').map((b) => b.className)).toEqual([]);
    });
});

describe('the code block copy button', () => {
    it('is named by aria-label, and the name follows the confirmation', () => {
        const bubble = mountBubble(document.body, [{ id: 'c', type: 'code', language: 'ts', content: 'const a = 1;' }]);
        const btn = bubble.querySelector('.aparte-code-copy') as HTMLButtonElement;
        const resting = btn.getAttribute('title');
        expect(resting).toBeTruthy();
        expect(btn.getAttribute('aria-label')).toBe(resting);

        btn.click();

        expect(btn.getAttribute('title')).not.toBe(resting);
        expect(btn.getAttribute('aria-label')).toBe(btn.getAttribute('title'));
    });
});

describe('the reasoning panel', () => {
    it('is a keyboard-reachable region named after its label', () => {
        const bubble = mountBubble(document.body, [
            { id: 't', type: 'thinking', content: 'weighing the options', label: 'Thinking' },
        ]);
        const panel = bubble.querySelector('.aparte-thinking-content') as HTMLElement;
        expect(panel.getAttribute('tabindex')).toBe('0');
        expect(panel.getAttribute('role')).toBe('region');
        expect(panel.getAttribute('aria-label')).toBe('Thinking');
    });
});
