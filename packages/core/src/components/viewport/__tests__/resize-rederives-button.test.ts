// @vitest-environment jsdom
/**
 * A resize re-derives the scroll button.
 *
 * "Is anything below the fold" is a pure function of the geometry the ResizeObserver
 * exists to watch, and only the MUTATION path re-derived it — `_scheduleSpacerUpdate`,
 * whose own comment says the fold may have moved. The resize path recalculated the
 * spacer and left the button showing whatever the last mutation happened to measure.
 *
 * The case that made it visible: a branch swap rebuilds the transcript and React's
 * height flickers through it (1730 → 1934 → 1730, measured in `navigateBranch`). The
 * settle back down is a RESIZE, not a mutation, so a button evaluated at 1934 stayed
 * wrong — CI caught it on react-webkit holding "visible" across 43 polls, five seconds
 * after a swap that ended at the bottom.
 *
 * Driving the observer's callback directly rather than resizing a window: in a browser
 * a viewport change also mutates the DOM (the spacer's own style), so a window-resize
 * test passes even with this fix removed. It was written, it had no teeth, it is gone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const callbacks: Array<() => void> = [];

class CapturingResizeObserver {
    constructor(cb: () => void) { callbacks.push(cb); }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeEach(async () => {
    callbacks.length = 0;
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
});

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('the scroll button and the resize path', () => {
    it('re-derives on a resize, with no DOM mutation in sight', () => {
        const vp = document.createElement('aparte-chat-viewport');
        document.body.appendChild(vp);

        const btn = vp.querySelector<HTMLElement>('.aparte-scroll-btn');
        expect(btn, 'the viewport renders its scroll button').not.toBeNull();

        // The stale state a flickering rebuild leaves behind: geometry says "at the
        // bottom" (jsdom reports every size as 0, so `_isAtBottom()` is true), and the
        // button is showing anyway because the last evaluation caught a taller layout.
        btn!.classList.remove('aparte-scroll-btn--hidden');
        expect(btn!.className, 'precondition: the button is wrongly visible').not.toContain('--hidden');

        expect(callbacks.length, 'the viewport observes something').toBeGreaterThan(0);
        for (const cb of callbacks) cb();

        expect(
            btn!.className,
            'a resize must re-derive it — nothing else will, a swap fires no scroll event',
        ).toContain('aparte-scroll-btn--hidden');
    });
});
