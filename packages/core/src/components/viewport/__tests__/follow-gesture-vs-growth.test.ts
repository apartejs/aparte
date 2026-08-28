// @vitest-environment jsdom
/**
 * Auto-follow tells a reader's gesture from the content growing under them.
 *
 * `_handleScroll` used to assign `_isAutoScrollEnabled = _isAtBottom()` on every event,
 * and `_isAtBottom()` answers "no" for two unrelated reasons: the reader moved up, or the
 * content grew. The second disarmed the follow exactly when it was needed — a branch swap
 * rebuilds the transcript, its height settles in stages, and the follow meant to put the
 * reader back at the bottom had already switched itself off. CI caught it parked 114px up
 * (scrollTop 1071, scrollHeight 1718, clientHeight 533) five seconds after a swap that
 * started at the bottom.
 *
 * Geometry is stubbed rather than laid out, deliberately: a swap between two branches of
 * DIFFERENT heights is the case that matters and the hardest to stage in a browser — the
 * shrinking one especially, where the engine clamps `scrollTop` and the decrease is not a
 * gesture at all. Here each number is chosen.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }

type Vp = HTMLElement & { _isAutoScrollEnabled: boolean };

let vp: Vp;
let box: HTMLElement;

const geometry = (top: number, height: number, client = 500): void => {
    Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: client, configurable: true });
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
};

beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', NoopObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
    document.body.innerHTML = '';
    vp = document.createElement('aparte-chat-viewport') as Vp;
    document.body.appendChild(vp);
    box = vp.querySelector('.aparte-viewport-container') as HTMLElement;
    expect(box, 'the viewport has its scroll container').not.toBeNull();
});

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('auto-follow, gesture versus growth', () => {
    it('keeps following when the content grows under a reader who is at the bottom', () => {
        geometry(1000, 1500);                       // at the bottom
        expect(vp._isAutoScrollEnabled).toBe(true);

        geometry(1000, 1700);                       // 200px arrived below; scrollTop did NOT move
        expect(
            vp._isAutoScrollEnabled,
            'growth is not a gesture — this is the swap parked 114px up',
        ).toBe(true);
    });

    it('stops following when the reader actually goes up', () => {
        geometry(1000, 1500);
        geometry(700, 1500);                        // the reader moved
        expect(vp._isAutoScrollEnabled).toBe(false);
    });

    it('follows again once the reader comes back to the bottom', () => {
        geometry(1000, 1500);
        geometry(700, 1500);
        expect(vp._isAutoScrollEnabled).toBe(false);
        geometry(1000, 1500);
        expect(vp._isAutoScrollEnabled).toBe(true);
    });

    it('treats a CLAMP as no gesture when the new branch is shorter', () => {
        // Two branches rarely have the same height. Swapping to a shorter one shrinks the
        // scroller, the engine clamps scrollTop, and the decrease is the engine's, not the
        // reader's. It lands AT the bottom, which is what has to decide it.
        geometry(1000, 1500);
        geometry(600, 1100);                        // shorter branch: max is now 600
        expect(
            vp._isAutoScrollEnabled,
            'a clamp puts the reader at the bottom; it must not read as walking away',
        ).toBe(true);
    });

    it('a reader who was already up stays up when the branch grows', () => {
        geometry(1000, 1500);
        geometry(400, 1500);                        // reader goes up
        expect(vp._isAutoScrollEnabled).toBe(false);
        geometry(400, 2000);                        // taller branch arrives below them
        expect(vp._isAutoScrollEnabled, 'still reading, still not followed').toBe(false);
    });
});
