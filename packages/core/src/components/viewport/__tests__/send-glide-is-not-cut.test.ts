// @vitest-environment jsdom
/**
 * #57 — the send glide was cut by the instant bottom-pin.
 *
 * On a user send the viewport sizes the bottom spacer so the new message can sit at
 * the top, then glides there with `scrollTo({ behavior: 'smooth' })`. The client appends
 * the assistant placeholder a few dozen ms later — inside the glide — and that append
 * went through the streaming path: an INSTANT `scrollTop = scrollHeight` plus the
 * settle chain re-writing `scrollTop` every frame. An instant write cancels a running
 * smooth scroll in every engine, so the glide stopped after a few frames and the view
 * teleported. Same for the first token, and for a token arriving during the
 * scroll-button's own glide.
 *
 * The rule: while a glide is in flight, nothing writes `scrollTop` directly — the
 * placeholder and the tokens RE-TARGET the glide (a second smooth `scrollTo` is
 * continuous; an instant write is not). Once the glide has ended, streaming is instant
 * again, as it must be to keep up with token bursts.
 *
 * jsdom has no smooth scrolling, so `scrollTo` is a spy and the instant writes are
 * observed through a `scrollTop` setter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AparteMessage } from '../../../types/index.js';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }

type Vp = HTMLElement & {
    _isAutoScrollEnabled: boolean;
    _glideUntil: number;
    appendMessage(m: AparteMessage): void;
    appendToken(id: string, chunk: string): void;
};

let vp: Vp;
let box: HTMLElement;
let scrollTo: ReturnType<typeof vi.fn>;
/** Every direct `scrollTop = …` write the component made (the test's own are filtered out). */
let instantWrites: number[];
let recording = false;

const CLIENT = 720;

function geometry(top: number, height: number): void {
    recording = false;
    Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: CLIENT, configurable: true });
    box.scrollTop = top;
    box.dispatchEvent(new Event('scroll'));
    recording = true;
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const smoothCalls = (): number => scrollTo.mock.calls.filter((c) => (c[0] as { behavior?: string })?.behavior === 'smooth').length;

beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', NoopObserver);
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
    document.body.innerHTML = '';
    vp = document.createElement('aparte-chat-viewport') as unknown as Vp;
    document.body.appendChild(vp);
    box = vp.querySelector('.aparte-viewport-container') as HTMLElement;

    // The browser's smooth scroll, observed; the instant writes, recorded.
    scrollTo = vi.fn();
    (box as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
    let top = 0;
    instantWrites = [];
    Object.defineProperty(box, 'scrollTop', {
        configurable: true,
        get: () => top,
        set: (v: number) => { top = v; if (recording) instantWrites.push(v); },
    });

    vp.appendMessage({ id: 'a0', role: 'assistant', content: 'earlier reply', timestamp: 1, status: 'completed' });
    geometry(891, 1611);   // a long transcript, pinned at the bottom
    expect(vp._isAutoScrollEnabled).toBe(true);
});

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('#57 — one owner of the scroll during the send glide', () => {
    it('the placeholder and the first token re-target the glide instead of cutting it', async () => {
        vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
        await frame();
        await frame();
        // Measured before the fix: FIVE instant writes in the send's own frame — the spacer
        // recalculation scrolls synchronously inside appendMessage, and the mutation
        // observer queues another. The smooth call of the next frame found the view already
        // at the bottom: there never was a glide to cut.
        expect(instantWrites, 'no instant write starts the send').toEqual([]);
        const afterSend = smoothCalls();
        expect(afterSend, 'the send glides').toBeGreaterThanOrEqual(1);

        // The assistant placeholder lands inside the glide — this used to be the cut.
        vp.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        await frame();
        await frame();
        expect(instantWrites, 'the placeholder must not write scrollTop while the glide is in flight').toEqual([]);
        const afterPlaceholder = smoothCalls();
        expect(afterPlaceholder, 'it re-targets the glide instead').toBeGreaterThan(afterSend);

        // The first token, still inside the glide.
        vp.appendToken('a1', 'Hel');
        await frame();
        await frame();
        expect(instantWrites, 'nor may a token').toEqual([]);
        expect(smoothCalls()).toBeGreaterThan(afterPlaceholder);
    });

    it('a scrollend that arrives before the bottom does not close the glide — WebKit fires one when a smooth scroll is replaced', async () => {
        // Measured on react-webkit and vanilla-webkit: instant writes 45–60 ms into the
        // glide, before the curve had arrived. Re-targeting the smooth scroll ended the
        // previous one, WebKit said `scrollend`, the window closed, the next pin was a cut.
        vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
        await frame();
        const open = vp._glideUntil;
        expect(open).toBeGreaterThan(0);
        // Mid-glide: 500 px short of the bottom (max = 1611 - 720 = 891 is where we started; the
        // spacer grew the height, so the target is further down).
        Object.defineProperty(box, 'scrollHeight', { value: 2000, configurable: true });
        recording = false; box.scrollTop = 900; recording = true;
        box.dispatchEvent(new Event('scrollend'));
        expect(vp._glideUntil, 'not at the bottom: the glide is still in flight').toBe(open);
        // At the bottom: the glide is over.
        recording = false; box.scrollTop = 2000 - CLIENT; recording = true;
        box.dispatchEvent(new Event('scrollend'));
        expect(vp._glideUntil, 'arrived: scrollend closes the window').toBe(0);
    });

    it('the reader\'s hand ends the glide: a wheel mid-glide closes the window and stops the animation where it is', async () => {
        // CI (vanilla-chromium): `streaming-progressive` wheeled up during the glide and the
        // browser's smooth animation ran on to the bottom over the gesture — "top is still
        // 477px". A synthetic wheel does not cancel a programmatic smooth scroll the way a
        // physical one does, so the component cancels it: a write of the current position
        // stops the animation, and the window closes.
        vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
        await frame();
        expect(vp._glideUntil).toBeGreaterThan(0);
        recording = false; box.scrollTop = 1000; recording = true;   // mid-animation
        box.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
        expect(vp._glideUntil, 'the window closes on reader input').toBe(0);
        expect(instantWrites, 'the animation is stopped where it is — a write of the current position').toEqual([1000]);
    });

    it('once the glide has ended, streaming is instant again', async () => {
        vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
        await frame();
        vp.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        await frame();

        vp._glideUntil = 0;   // the glide's deadline has passed
        vp.appendToken('a1', 'lo');
        await frame();
        expect(instantWrites.length, 'a token after the glide pins instantly').toBeGreaterThan(0);
    });

    it('framework-managed: a user bubble the observer sees arrive glides too, with no request from the wrapper', async () => {
        // Measured on React before the fix: 630 px in one frame. The wrapper's
        // requestSmoothScroll() set a flag only _autoScroll read; the observer's own pin ran
        // first, instant. Here no wrapper asks anything: a host that renders bubbles itself
        // must get the glide from the viewport alone.
        document.body.innerHTML = '';
        const fw = document.createElement('aparte-chat-viewport') as unknown as Vp;
        fw.setAttribute('framework-managed', '');
        document.body.appendChild(fw);
        const host = fw as unknown as HTMLElement;   // the host is the scroll surface here
        const fwScrollTo = vi.fn();
        (host as unknown as { scrollTo: unknown }).scrollTo = fwScrollTo;
        let top = 891;
        const fwWrites: number[] = [];
        Object.defineProperty(host, 'scrollHeight', { value: 1611, configurable: true });
        Object.defineProperty(host, 'clientHeight', { value: CLIENT, configurable: true });
        Object.defineProperty(host, 'scrollTop', {
            configurable: true,
            get: () => top,
            set: (v: number) => { top = v; fwWrites.push(v); },
        });
        host.dispatchEvent(new Event('scroll'));
        expect(fw._isAutoScrollEnabled).toBe(true);

        const user = document.createElement('aparte-chat-bubble');
        user.setAttribute('message-id', 'u1');
        user.setAttribute('data-role', 'user');
        host.appendChild(user);                     // React/Vue/Svelte/Angular commit
        await frame();
        await frame();
        expect(fwWrites, 'no instant write on a framework-rendered send').toEqual([]);
        expect(fwScrollTo.mock.calls.filter((c) => (c[0] as { behavior?: string })?.behavior === 'smooth').length).toBeGreaterThanOrEqual(1);

        const assistant = document.createElement('aparte-chat-bubble');
        assistant.setAttribute('message-id', 'a1');
        assistant.setAttribute('data-role', 'assistant');
        assistant.setAttribute('streaming', '');
        host.appendChild(assistant);
        await frame();
        await frame();
        expect(fwWrites, 'nor on the placeholder inside the glide').toEqual([]);
    });

    it('a rebuild that re-adds several bubbles is not a send: it pins instantly, and the settle runs', async () => {
        // CI (vanilla): a branch swap at the bottom re-adds the transcript's bubbles, user
        // ones included, with auto-follow re-armed; taken for a send, the swap glided
        // instead of pinning, the settle chain held its hand for the glide, the swap's
        // height churn left the view short — and a scroll-to-bottom button appeared over a
        // reader who never left ("swapping a branch at the bottom … leaves no scroll
        // button" in bubble-actions.spec.ts — flaky on CI, and CI fails on flaky).
        document.body.innerHTML = '';
        const fw = document.createElement('aparte-chat-viewport') as unknown as Vp;
        fw.setAttribute('framework-managed', '');
        document.body.appendChild(fw);
        const host = fw as unknown as HTMLElement;
        const fwScrollTo = vi.fn();
        (host as unknown as { scrollTo: unknown }).scrollTo = fwScrollTo;
        let top = 891;
        const fwWrites: number[] = [];
        Object.defineProperty(host, 'scrollHeight', { value: 1611, configurable: true });
        Object.defineProperty(host, 'clientHeight', { value: CLIENT, configurable: true });
        Object.defineProperty(host, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; fwWrites.push(v); } });
        host.dispatchEvent(new Event('scroll'));

        // One batch, two bubbles — the shape of a rebuild, not of a send.
        const u = document.createElement('aparte-chat-bubble'); u.setAttribute('message-id', 'u1'); u.setAttribute('data-role', 'user');
        const a = document.createElement('aparte-chat-bubble'); a.setAttribute('message-id', 'a1'); a.setAttribute('data-role', 'assistant');
        host.append(u, a);
        await frame();
        await frame();
        expect(fwScrollTo.mock.calls.filter((c) => (c[0] as { behavior?: string })?.behavior === 'smooth').length, 'no glide for a rebuild').toBe(0);
        expect(fwWrites.length, 'the rebuild pins instantly').toBeGreaterThan(0);
    });

    it('a glide whose window closes with the view still short is settled — the pin is not lost', async () => {
        // `performance` too: the window is a `performance.now()` deadline, and a timer
        // that fires while the clock stands still would find the glide still in flight.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        try {
            vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
            await frame();
            expect(instantWrites).toEqual([]);
            // The engine never arrived (a stale target, a churn): the view sits 191 px short of
            // the max (1611 − 720 = 891) when the window's budget runs out.
            recording = false; box.scrollTop = 700; recording = true;
            vi.advanceTimersByTime(600);
            await frame();
            await frame();
            expect(instantWrites.length, 'the view is pinned once the glide is over').toBeGreaterThan(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reduced motion keeps the instant path — there is no glide to protect', async () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        vp.appendMessage({ id: 'u1', role: 'user', content: 'a question', timestamp: 2, status: 'completed' });
        await frame();
        expect(smoothCalls()).toBe(0);
        expect(instantWrites.length).toBeGreaterThan(0);
        vp.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        await frame();
        expect(smoothCalls(), 'no smooth call is ever made under reduced motion').toBe(0);
    });
});
