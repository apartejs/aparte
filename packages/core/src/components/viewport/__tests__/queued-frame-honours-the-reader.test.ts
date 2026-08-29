// @vitest-environment jsdom
/**
 * A scroll-to-bottom frame queued before the reader went up does not drag them back.
 *
 * During a stream a frame is nearly always queued (every token queues one), and the
 * callback used to scroll unconditionally when it ran. The reader wheeled up, the
 * gesture disarmed auto-follow, and one frame later the already-queued scroll put them
 * back at the bottom — whose scroll event re-armed the follow. Every attempt to read
 * above the stream lasted one frame ("on a du mal à remonter"). The callback re-reads
 * the intent flag now; the frames queued while a reader is legitimately at the bottom
 * still land, which the second test pins.
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

const geometry = (top: number, height: number, client = 500): void => {
    Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: client, configurable: true });
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
};

/** The reader's hand: a wheel notch, then the scroll it produces — the way a person goes up. */
const wheelUp = (top: number, height: number): void => {
    box.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    geometry(top, height);
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

describe('a queued scroll frame and the reader', () => {
    it('does not pull a reader back down after they went up', async () => {
        geometry(1000, 1500);                       // at the bottom, following
        expect(vp._isAutoScrollEnabled).toBe(true);

        vp.appendToken('a1', 'more');               // a frame is queued while armed
        wheelUp(700, 1500);                         // the reader goes up before it runs
        expect(vp._isAutoScrollEnabled).toBe(false);

        await frame();
        await frame();
        expect(box.scrollTop, 'the queued frame must not scroll a reader who left').toBe(700);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });

    it('still lands the frame for a reader who stayed at the bottom', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        Object.defineProperty(box, 'scrollHeight', { value: 1700, configurable: true }); // content grew, no gesture

        await frame();
        await frame();
        expect(box.scrollTop, 'auto-follow keeps the reader at the new bottom').toBe(1700);
        expect(vp._isAutoScrollEnabled).toBe(true);
    });
});

describe('a decrease the browser made while settling our scroll', () => {
    // Measured on WebKit: the action bar appears at the end of a stream (+34px), the
    // spacer gives the 34px back in the same frame, and through that churn scrollTop
    // moved from 829 to 804 — a decrease no reader made, seconds after their last
    // gesture. It must not read as "the reader went up".
    it('does not disarm the follow: small, right after our scroll, no reader input', async () => {
        geometry(1000, 1500);                       // at the bottom, following
        vp.appendToken('a1', 'more');
        await frame();                              // the queued frame scrolls: ours, just now
        await frame();
        geometry(940, 1560);                        // -60px, 60px from the bottom, nobody touched it
        expect(vp._isAutoScrollEnabled, 'a browser-made decrease keeps the follow armed').toBe(true);
    });

    it('still disarms for the same decrease when the reader touched the transcript', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        wheelUp(940, 1500);                         // same 60px, but a wheel notch came first
        expect(vp._isAutoScrollEnabled, 'a gesture is the reader, whatever we just did').toBe(false);
    });

    it('still disarms for a decrease that follows no scroll of ours', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        // Outside the one-second shadow of our own scroll — the same gap a find-in-page
        // jump or a host's scrollTo lands in. (Not a size rule: a branch swap on React
        // moves scrollTop by ~200px through its rebuild, and that is the browser's.)
        (vp as unknown as { _ownScrollAt: number })._ownScrollAt = Number.NEGATIVE_INFINITY;
        geometry(700, 1500);
        expect(vp._isAutoScrollEnabled, 'no scroll of ours to blame: the reader left').toBe(false);
    });

    // Classifying the churn correctly was only half the job: the handler's outputs were the
    // flag and the button, and neither of them scrolls. Measured on react-webkit after a
    // branch swap — top 763 -> 759 -> 720 while the max churned 891 -> 1091 -> 891 — the
    // follow stayed armed, the transcript stood 171px short, and no code path acted on it.
    // The settle window is closed here on purpose (0ms), so what this pins is the handler's
    // branch and not the chain the scroll before it started.
    it('re-anchors when the churn leaves a gap', async () => {
        geometry(891, 1611, 720);                   // at the bottom of the short layout
        (vp as unknown as { _settleWindowMs: number })._settleWindowMs = 0;
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        geometry(720, 1811, 720);                   // the rebuild's tall layout: -171 top, +200 height
        expect(vp._isAutoScrollEnabled, 'churn is not the reader').toBe(true);

        await frame();
        expect(box.scrollTop, 'armed and short of the bottom must become a scroll').toBe(1811 - 720);
    });

    // The same branch from the other side, and the reason it is gated on a DECREASE.
    // A scroll of OURS that is still moving is `settlingOurs` too — `drop` is negative,
    // so the churn test passes trivially — and that is every frame of a native smooth
    // scroll. Re-anchoring one of them assigns `scrollTop`, which per CSSOM-View is an
    // instant scroll and aborts the animation: the send glide, the scroll-to-bottom
    // button and `requestSmoothScroll()` on all four wrappers all became a stutter and
    // a jump, with no test able to see it (jsdom takes the instant fallback unless
    // `scrollTo` is a function).
    it('leaves a smooth scroll of ours gliding instead of snapping it to the bottom', async () => {
        geometry(1000, 1500);                       // at the bottom, following
        wheelUp(200, 1500);                         // the reader goes up: the button appears
        await frame();
        await frame();                              // nothing of ours is still queued
        expect(vp._isAutoScrollEnabled).toBe(false);

        // The wheel was over a second ago — the reader stopped, read, then pressed the
        // button. That is what makes the glide's own scroll events `settlingOurs`: a
        // press on the button is not a scroll gesture (it is not in the gutter), so
        // nothing refreshes the reader's trace while the animation runs.
        (vp as unknown as { _readerInputAt: number })._readerInputAt = Number.NEGATIVE_INFINITY;
        let glideTo: number | null = null;
        box.scrollTo = ((o: ScrollToOptions) => { glideTo = o.top ?? null; }) as typeof box.scrollTo;

        (vp.querySelector('.aparte-scroll-btn') as HTMLElement).click();
        expect(glideTo, 'the button glides to the bottom').toBe(1500);

        box.scrollTop = 400;                        // one frame of that glide: still 600 short
        box.dispatchEvent(new Event('scroll'));
        for (let i = 0; i < 4; i++) await frame();
        expect(box.scrollTop, 'the glide must reach its own end, not be assigned mid-animation')
            .toBe(400);
    });

    it('does not re-anchor a drag-selection upward', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        geometry(300, 1500);                        // -700px with the height standing still
        expect(vp._isAutoScrollEnabled, 'a selection dragged upward is the reader').toBe(false);

        await frame();
        await frame();
        expect(box.scrollTop, 'the new branch must never reach a reader').toBe(300);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });
});

describe('what counts as the reader\'s hand', () => {
    // jsdom has no layout: give the box a width and a rect so a press can land inside
    // the content (clientX 100) or in the scrollbar's gutter (clientX 590). And no
    // PointerEvent: a MouseEvent named `pointerdown` carries the same clientX.
    const layout = (): void => {
        Object.defineProperty(box, 'clientWidth', { value: 580, configurable: true });
        box.getBoundingClientRect = () => ({ left: 0, right: 600, top: 0, bottom: 500, width: 600, height: 500, x: 0, y: 0, toJSON: () => ({}) });
    };
    const settleOurs = async (): Promise<void> => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
    };

    it('a press on a control inside the transcript is not a scroll gesture', async () => {
        layout();
        await settleOurs();
        const bubble = vp.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 50 }));
        geometry(940, 1560);                        // the swap's churn, a second after the click
        expect(vp._isAutoScrollEnabled, 'a click on a branch arrow must not disarm the follow').toBe(true);
    });

    it('a press in the scrollbar gutter is', async () => {
        layout();
        await settleOurs();
        box.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 590, clientY: 50 }));
        geometry(940, 1560);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });

    it('a navigation key is, a letter is not', async () => {
        layout();
        await settleOurs();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        geometry(940, 1560);
        expect(vp._isAutoScrollEnabled, 'typing is not scrolling').toBe(true);
        await settleOurs();
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
        geometry(940, 1560);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });
});

describe('churn is bounded by the height it moved', () => {
    // During a stream every token refreshes the shadow, so the shadow alone cannot tell
    // the browser's settling from a reader who moved without a recorded gesture — a
    // drag-selection upward lands its press on the text, not in the gutter. What tells
    // them apart is the evidence: churn moves scrollTop by at most the height it changed.
    it('a decrease with the height standing still is the reader — a drag-selection upward', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        geometry(300, 1500);                        // -700px, no wheel, no height change
        expect(vp._isAutoScrollEnabled, 'a selection dragged upward must not be snapped back').toBe(false);
    });

    it('a decrease no larger than the height change, inside the shadow, is churn', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        geometry(800, 1710);                        // the React swap: +210 height, -200 scrollTop
        expect(vp._isAutoScrollEnabled).toBe(true);
    });

    it('a tap on a control (touchstart) is not a scroll gesture; a finger that moves is', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        const bubble = vp.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new Event('touchstart', { bubbles: true }));
        geometry(940, 1560);
        expect(vp._isAutoScrollEnabled, 'a tap on a branch arrow').toBe(true);
        box.dispatchEvent(new Event('touchmove', { bubbles: true }));
        geometry(880, 1620);
        expect(vp._isAutoScrollEnabled, 'a touch that scrolls').toBe(false);
    });
});
