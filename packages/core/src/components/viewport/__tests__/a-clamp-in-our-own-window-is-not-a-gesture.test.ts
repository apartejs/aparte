// @vitest-environment jsdom
/**
 * A `scrollTop` decrease that arrives with a height change, inside the viewport's own
 * scroll window and with no reader input in it, is the layout's — not the reader's.
 *
 * `_handleScroll` classified a decrease as ours only when it was no larger than the
 * height churn it could measure at that event. WebKit clamps `scrollTop` the moment a
 * settling reply's DOM is shorter — between the streamed markup leaving and the rendered
 * one landing — and by the time the scroll event is read the content has regrown: the
 * decrease (82px) is larger than the churn the event can see (30px), the follow was
 * disarmed as "the reader went up", and the transcript stayed 82px short of the bottom
 * for good. Measured on react-webkit, one frame at the end of a streamed turn; Chromium
 * pinned first and never showed it.
 *
 * The reader's hand is the evidence that matters, and it is already recorded: wheel,
 * touch, pointer and key on the container. No hand within the window, a height that
 * moved or not, our own scroll a moment ago — that is a settle. A drag-selection upward
 * (a press on the surface) and a find-in-page jump (outside the window) keep disarming.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
type Vp = HTMLElement & { _isAutoScrollEnabled: boolean; _ownScrollAt: number; _readerInputAt: number };
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
    vp = document.createElement('aparte-chat-viewport') as unknown as Vp;
    document.body.appendChild(vp);
    box = vp.querySelector('.aparte-viewport-container') as HTMLElement;
    expect(box, 'the viewport has its scroll container').not.toBeNull();
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('a clamp in our own window', () => {
    it('is not a gesture: the follow stays armed', () => {
        geometry(1000, 1500);                       // at the bottom, armed
        expect(vp._isAutoScrollEnabled).toBe(true);
        vp._ownScrollAt = performance.now();        // we just pinned
        geometry(918, 1530);                        // −82 with the content +30, no hand on it
        expect(vp._isAutoScrollEnabled, 'a settle clamp read as the reader going up').toBe(true);
    });

    it('still yields to a reader whose hand is on it', () => {
        geometry(1000, 1500);
        vp._ownScrollAt = performance.now();
        vp._readerInputAt = performance.now();      // a wheel notch, mid-settle
        geometry(918, 1530);
        expect(vp._isAutoScrollEnabled, 'the reader must be able to read back').toBe(false);
    });

    it('still reads a drag-selection upward as the reader: the press is on the surface', () => {
        geometry(1000, 1500);
        vp._ownScrollAt = performance.now();
        box.dispatchEvent(new Event('pointerdown'));   // the hand, recorded by the container
        geometry(918, 1500);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });

    it('reads a decrease outside our own window as the reader (a find-in-page jump)', () => {
        geometry(1000, 1500);
        vp._ownScrollAt = performance.now() - 5000;
        geometry(918, 1500);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });
});
