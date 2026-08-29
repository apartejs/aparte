// @vitest-environment jsdom
/**
 * The settle after our own scroll outlives a layout churn that re-opens the gap.
 *
 * Measured on react-webkit: a branch swap at the bottom of a long transcript rebuilds
 * the transcript, the scrollable max churns 891 -> 1091 -> 891, and WebKit leaves
 * `scrollTop` where the tall layout put it. The settle used to be bounded by FOUR
 * FRAMES and to return permanently the first frame the gap was closed — and during the
 * churn the gap IS closed for a frame (we clamped to the tall layout's max) before it
 * re-opens. So the chain was spent, auto-follow was still armed, and nothing left in the
 * component converts "armed and 171px short" into a scroll: the rebuild's mutations are
 * over, and in framework-managed mode the ResizeObserver watches the host's border box,
 * which a content churn does not move. The journal decodes exactly to the screenshot:
 * `top=720 max=891` — 171px short, so the scroll-to-bottom button was not lying.
 *
 * jsdom does not clamp `scrollTop` once `scrollHeight`/`clientHeight` are stubbed, which
 * is what lets these tests BE the browser: write the position between frames the way
 * WebKit pins it, and read it back to see whether the component re-anchored.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AparteMessage } from '../../../types/index.js';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }

type Vp = HTMLElement & {
    _isAutoScrollEnabled: boolean;
    appendMessage(m: AparteMessage): void;
    appendToken(id: string, chunk: string): void;
};

let vp: Vp;
let box: HTMLElement;

/** The measured churn, in the journal's own numbers (client 720). */
const SHORT = 1611;   // max 891
const TALL = 1811;    // max 1091
const CLIENT = 720;

const geometry = (top: number, height: number, client = CLIENT): void => {
    Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: client, configurable: true });
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
};

/**
 * The browser's own hand: a layout pass lands and the engine leaves `scrollTop` where it
 * likes. No `scroll` event — the point of these tests is what the component does with no
 * further event to react to.
 */
const browserLayout = (height: number, top: number): void => {
    Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
    box.scrollTop = top;
};

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', NoopObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
    document.body.innerHTML = '';
    vp = document.createElement('aparte-chat-viewport') as unknown as Vp;
    document.body.appendChild(vp);
    box = vp.querySelector('.aparte-viewport-container') as HTMLElement;
    vp.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
});

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('the settle and a churning layout', () => {
    it('the settle survives a gap that re-opens', async () => {
        // The window is stretched, and the tall layout is held for more frames than the
        // old budget had: what this pins is the KIND of bound. A chain that still counted
        // four frames and merely stopped returning on a closed gap passes the assertion
        // below if the re-open lands on frame 3 — so the re-open is pushed past frame 4
        // here, and the deadline is set well clear of the machine's frame cadence so the
        // test measures the component and not the load on the box it runs on.
        (vp as unknown as { _settleWindowMs: number })._settleWindowMs = 1200;

        geometry(891, SHORT);                        // at the bottom of the short layout
        expect(vp._isAutoScrollEnabled).toBe(true);

        vp.appendToken('a1', 'x');
        await frame();                               // our scroll ran: this is what we settle

        browserLayout(TALL, 759);                    // the rebuild's tall layout, position pinned
        await frame();                               // the settle clamps to the tall max...
        await frame();                               // ...and the gap is closed — NOT the end
        for (let i = 0; i < 5; i++) await frame();   // ...and stays closed, past a 4-frame budget

        browserLayout(SHORT, 720);                   // the height falls back, WebKit keeps 720
        await frame();
        await frame();
        await frame();

        expect(box.scrollTop, 'the settle must still be watching when the gap re-opens')
            .toBe(SHORT - CLIENT);                   // 891
        expect(vp._isAutoScrollEnabled).toBe(true);
    });

    it('a reader who leaves mid-settle is left alone for the whole window', async () => {
        // The 4-frame chain made this trivially true. A time-bounded one is where it could
        // regress, so the window is shortened and the assertion runs past its end.
        (vp as unknown as { _settleWindowMs: number })._settleWindowMs = 100;

        geometry(891, SHORT);
        vp.appendToken('a1', 'x');
        await frame();                               // our scroll ran; the settle is in flight

        box.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
        geometry(700, SHORT);                        // the reader goes up mid-settle
        expect(vp._isAutoScrollEnabled).toBe(false);

        for (let i = 0; i < 10; i++) {
            await frame();
            expect(box.scrollTop, `frame ${i + 1}: a reader who left is never pulled back`).toBe(700);
        }
        expect(vp._isAutoScrollEnabled).toBe(false);
    });
});
