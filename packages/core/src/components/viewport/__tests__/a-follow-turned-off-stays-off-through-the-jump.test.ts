// @vitest-environment jsdom
/**
 * `setAutoScroll(false)` holds through the scroll that comes next.
 *
 * The scroll rail turns the follow off before it jumps to a message, mid-stream, and a host
 * that jumps there itself is told to do the same. A smooth jump from the bottom starts slowly:
 * its first frame moves a few pixels, still within the bottom threshold, so the viewport read
 * the reader as "at the bottom" and armed the follow again — and the next token pinned the
 * view back down, aborting the jump. Turned off by the page, the follow is the reader's
 * choice, and the scroll that follows is the reader's too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
type Vp = HTMLElement & {
    _isAutoScrollEnabled: boolean; _ownScrollAt: number; _lastMutationAt: number;
    setAutoScroll(enabled: boolean): void;
};
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
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

/** At the bottom, following a stream: a pin of ours and a token both just landed. */
const followingAStream = (): void => {
    geometry(3000, 3500);
    expect(vp._isAutoScrollEnabled).toBe(true);
    vp._ownScrollAt = performance.now();
    vp._lastMutationAt = performance.now();
};

describe('a follow the page turned off', () => {
    it('stays off through the first frames of a smooth jump, still near the bottom', () => {
        followingAStream();
        vp.setAutoScroll(false);
        geometry(2990, 3500);
        expect(vp._isAutoScrollEnabled, 'a few pixels up is not the reader coming back').toBe(false);
        vp._lastMutationAt = performance.now();
        geometry(2930, 3500);
        expect(vp._isAutoScrollEnabled).toBe(false);
    });

    it('comes back when the reader returns to the bottom', () => {
        followingAStream();
        vp.setAutoScroll(false);
        geometry(1200, 3500);
        expect(vp._isAutoScrollEnabled).toBe(false);
        geometry(3000, 3500);
        expect(vp._isAutoScrollEnabled).toBe(true);
    });
});
