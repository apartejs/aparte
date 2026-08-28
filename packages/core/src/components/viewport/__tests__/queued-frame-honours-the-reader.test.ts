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
        geometry(940, 1500);                        // -60px, 60px from the bottom, nobody touched it
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

    it('still disarms for a jump too large to be layout churn', async () => {
        geometry(1000, 1500);
        vp.appendToken('a1', 'more');
        await frame();
        await frame();
        geometry(700, 1500);                        // -300px with no input: find-in-page, a host scrollTo
        expect(vp._isAutoScrollEnabled, 'a large decrease is never our own settling').toBe(false);
    });
});
