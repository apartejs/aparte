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
