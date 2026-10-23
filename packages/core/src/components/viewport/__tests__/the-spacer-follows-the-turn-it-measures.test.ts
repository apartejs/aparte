// @vitest-environment jsdom
/**
 * The bottom spacer is re-measured when the turn it measures changes size.
 *
 * The spacer pins the last question under the top edge, so it measures that question and
 * everything after it. A bubble that has never been on screen is skipped
 * (`content-visibility: auto`) and measures its 320px fallback; a send measured the new
 * question and its reply at 320px each, sized the spacer for them — and when they came into
 * view at their real height, nothing re-measured it: a bubble taking its size is neither a
 * mutation nor a resize of the scroll container. The question stood a third of the way down
 * the view (WebKit under load). The viewport now watches the size of those bubbles.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeResizeObserver {
    static all: FakeResizeObserver[] = [];
    readonly observed = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) { FakeResizeObserver.all.push(this); }
    observe(el: Element): void { this.observed.add(el); }
    unobserve(el: Element): void { this.observed.delete(el); }
    disconnect(): void { this.observed.clear(); }
}

type Vp = HTMLElement & { appendMessage(m: object): void };
let vp: Vp;

const flush = () => new Promise((r) => setTimeout(r, 0));
const watchedBubbles = () => FakeResizeObserver.all
    .flatMap((o) => [...o.observed])
    .filter((el) => el.tagName === 'APARTE-CHAT-BUBBLE')
    .map((el) => el.getAttribute('message-id'));
const turn = (i: number) => {
    vp.appendMessage({ id: `u${i}`, role: 'user', content: `question ${i}`, timestamp: i });
    vp.appendMessage({ id: `a${i}`, role: 'assistant', content: `answer ${i}`, timestamp: i, status: 'completed' });
};

beforeEach(async () => {
    FakeResizeObserver.all = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
    document.body.innerHTML = '';
    vp = document.createElement('aparte-chat-viewport') as unknown as Vp;
    document.body.appendChild(vp);
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('the spacer and the turn it measures', () => {
    it('watches the last question and what follows it, and moves on with the next turn', async () => {
        turn(1);
        await flush();
        expect(watchedBubbles()).toEqual(['u1', 'a1']);
        turn(2);
        await flush();
        expect(watchedBubbles(), 'the history above is not watched').toEqual(['u2', 'a2']);
    });

    it('re-measures when one of them changes height from what was measured — not on a width alone', async () => {
        turn(1);
        await flush();
        const tail = FakeResizeObserver.all.find((o) => [...o.observed].some((el) => el.tagName === 'APARTE-CHAT-BUBBLE'))!;
        const reply = [...tail.observed].find((el) => el.getAttribute('message-id') === 'a1')! as HTMLElement;
        const report = (width: number, height: number) => tail.callback(
            [{ target: reply, contentRect: { width, height }, borderBoxSize: [{ inlineSize: width, blockSize: height }] } as unknown as ResizeObserverEntry],
            tail as unknown as ResizeObserver,
        );
        const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
        // The insertion queued a re-measure of its own; let it run before listening.
        await frame();
        await frame();
        const recalc = vi.spyOn(vp as unknown as { _recalculateSpacer(): void }, '_recalculateSpacer');
        // What the spacer measured it at when it started being watched (jsdom lays nothing out).
        const measured = reply.offsetHeight;

        report(600, measured);            // its first report: the height the spacer already used
        await frame();
        expect(recalc, 'a report of the height already measured says nothing').not.toHaveBeenCalled();
        report(585, measured);            // a scrollbar took 15px
        await frame();
        expect(recalc, 'a width alone says nothing').not.toHaveBeenCalled();
        report(585, measured + 91);       // on screen at last: its real height
        await frame();
        expect(recalc).toHaveBeenCalled();
    });

    it('lets go of every bubble when it leaves the page', async () => {
        turn(1);
        await flush();
        vp.remove();
        expect(watchedBubbles()).toEqual([]);
    });
});
