// @vitest-environment jsdom
/**
 * The rail reads the transcript and never owns it: which bubbles exist, which one is
 * under the reader, and the first words of each. These tests mount plain elements —
 * an un-upgraded `<aparte-chat>` and `<aparte-chat-viewport>` around bubble tags with
 * the attributes the real viewport writes — so what is proved is the rail's own logic,
 * not the viewport's.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '../aparte-scroll-rail.js';
import type { AparteScrollRailJumpDetail } from '../aparte-scroll-rail.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
interface StubObserver { cb: IOCallback; opts: IntersectionObserverInit | undefined; observed: Element[] }
/** Every observer the rail made, in order. The rail makes two per transcript: the reading band and the whole surface. */
const observers: StubObserver[] = [];
let ioConstructed = 0;
/** The latest reading-band observer (the one with a negative bottom margin), and the latest whole-surface one. */
const band = (): StubObserver => observers.filter((o) => o.opts?.rootMargin?.includes('-70%')).at(-1)!;
const screen = (): StubObserver => observers.filter((o) => !o.opts?.rootMargin?.includes('-70%')).at(-1)!;
/** The bubble the reading band watches under a message id: it watches the replies too, so indices would lie. */
const inBand = (id: string): Element => band().observed.find((e) => e.getAttribute('message-id') === id)!;

beforeEach(() => {
    observers.length = 0;
    ioConstructed = 0;
    // jsdom has no IntersectionObserver; a stub that hands each callback to the test.
    class IO {
        private _rec: StubObserver;
        constructor(cb: IOCallback, opts?: IntersectionObserverInit) { this._rec = { cb, opts, observed: [] }; observers.push(this._rec); ioConstructed++; }
        observe(el: Element): void { this._rec.observed.push(el); }
        disconnect(): void { /* noop */ }
        unobserve(): void { /* noop */ }
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

function bubble(id: string, role: 'user' | 'assistant', text: string): HTMLElement {
    const b = document.createElement('aparte-chat-bubble');
    b.setAttribute('message-id', id);
    b.setAttribute('data-role', role);
    const content = document.createElement('div');
    content.className = 'aparte-message-content';
    content.textContent = text;
    b.appendChild(content);
    return b;
}

function mount(bubbles: HTMLElement[], attrs: Record<string, string> = {}): { host: HTMLElement; viewport: HTMLElement; rail: HTMLElement } {
    const host = document.createElement('aparte-chat');
    host.id = 'c1';
    const viewport = document.createElement('aparte-chat-viewport');
    for (const b of bubbles) viewport.appendChild(b);
    host.appendChild(viewport);
    const rail = document.createElement('aparte-scroll-rail');
    for (const [k, v] of Object.entries(attrs)) rail.setAttribute(k, v);
    host.appendChild(rail);
    document.body.appendChild(host);
    return { host, viewport, rail };
}

const ticks = (rail: HTMLElement): HTMLElement[] => Array.from(rail.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick'));
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

const THREE_TURNS = (): HTMLElement[] => [
    bubble('u1', 'user', 'What is a web component?'),
    bubble('a1', 'assistant', 'A custom element.'),
    bubble('u2', 'user', 'And a light-DOM one?'),
    bubble('a2', 'assistant', 'One that renders into the page.'),
    bubble('u3', 'user', 'Which one is this rail?'),
];

describe('aparte-scroll-rail', () => {
    it('draws one tick per user turn by default, in order, named by role and excerpt', () => {
        const { rail } = mount(THREE_TURNS());
        const list = ticks(rail);
        expect(list.map((t) => t.dataset['messageId'])).toEqual(['u1', 'u2', 'u3']);
        expect(list[0]!.getAttribute('aria-label')).toBe('You: What is a web component?');
        expect(list[0]!.tagName, 'a tick is a real button').toBe('BUTTON');
        expect(rail.getAttribute('role')).toBe('navigation');
        expect(rail.getAttribute('aria-label')).toBe('Conversation outline');
        expect(rail.hasAttribute('data-empty')).toBe(false);
    });

    it('every="message" marks each message', () => {
        const { rail } = mount(THREE_TURNS(), { every: 'message' });
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['u1', 'a1', 'u2', 'a2', 'u3']);
        expect(ticks(rail)[1]!.getAttribute('aria-label')).toBe('Assistant: A custom element.');
    });

    it('cuts a long excerpt at sixty characters with an ellipsis', () => {
        const long = 'x'.repeat(200);
        const { rail } = mount([bubble('u1', 'user', long), bubble('u2', 'user', 'short')]);
        const label = ticks(rail)[0]!.getAttribute('aria-label')!;
        expect(label.endsWith('…')).toBe(true);
        expect(label.length).toBeLessThanOrEqual('You: '.length + 60);
    });

    it('renders nothing under two ticks — a rail with one mark says nothing', () => {
        const { rail } = mount([bubble('u1', 'user', 'alone'), bubble('a1', 'assistant', 'reply')]);
        expect(rail.hasAttribute('data-empty')).toBe(true);
        expect(ticks(rail)).toHaveLength(0);
    });

    it('follows the transcript: a bubble appended later gets its tick on the next frame', async () => {
        const { viewport, rail } = mount(THREE_TURNS());
        viewport.appendChild(bubble('u4', 'user', 'One more'));
        await nextFrame();
        await nextFrame();
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['u1', 'u2', 'u3', 'u4']);
    });

    it('marks the LAST question that reached the reading band as current, via the intersection observer', () => {
        const { rail } = mount(THREE_TURNS());
        // Every message is watched, the replies too: a reply in the band names its question.
        expect(band().observed.map((e) => e.getAttribute('message-id'))).toEqual(['u1', 'a1', 'u2', 'a2', 'u3']);
        // The second question fills most of the band and the third has just entered it:
        // the reader is under the third — a scrollspy's rule, not the largest share.
        band().cb([
            { target: inBand('u1'), isIntersecting: false, intersectionRatio: 0 },
            { target: inBand('u2'), isIntersecting: true, intersectionRatio: 0.6 },
            { target: inBand('u3'), isIntersecting: true, intersectionRatio: 0.2 },
        ]);
        expect(ticks(rail).map((t) => t.getAttribute('aria-current'))).toEqual([null, null, 'true']);
        expect((rail as HTMLElement & { currentMessageId: string | null }).currentMessageId).toBe('u3');

        // Only the second one left in the band: the reader is under it.
        band().cb([{ target: inBand('u3'), isIntersecting: false, intersectionRatio: 0 }]);
        expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');

        // Nothing in the band, and nothing laid out to read (jsdom): the last mark stays.
        band().cb([{ target: inBand('u2'), isIntersecting: false, intersectionRatio: 0 }]);
        expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
    });

    it('a reply in the band is read under its question, whatever moved it there', () => {
        // The layout moves under a still reader: a bubble never rendered takes its real height
        // once the scroll has stopped. The band observer reports the reply that slid into it.
        const { rail } = mount(THREE_TURNS());
        band().cb([{ target: inBand('u3'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(ticks(rail)[2]!.getAttribute('aria-current')).toBe('true');
        band().cb([
            { target: inBand('u3'), isIntersecting: false, intersectionRatio: 0 },
            { target: inBand('a1'), isIntersecting: true, intersectionRatio: 0.4 },
        ]);
        expect(ticks(rail)[0]!.getAttribute('aria-current'), 'inside the reply to u1').toBe('true');
        // A question and the reply above it both in the band: the question, the later of the two.
        band().cb([{ target: inBand('u2'), isIntersecting: true, intersectionRatio: 0.3 }]);
        expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
    });

    it('with nothing in the band, marks the last question above its lower edge — the reader is inside its reply', () => {
        // Measured in Chromium: a reader who wheeled up through long replies was still marked
        // on the last question seven questions later. A short question crosses the band between
        // two frames and is never reported in it, and an empty band kept the old mark.
        const turns = THREE_TURNS();
        const { viewport, rail } = mount(turns);
        viewport.getBoundingClientRect = () => ({ top: 0, height: 1000 }) as DOMRect;
        const tops: Record<string, number> = { u1: -2400, u2: -900, u3: 1600 };
        for (const b of turns) b.getBoundingClientRect = () => ({ top: tops[b.getAttribute('message-id')!] ?? 0 }) as DOMRect;
        band().cb([{ target: inBand('u3'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(ticks(rail)[2]!.getAttribute('aria-current')).toBe('true');
        // Wheeled up past u3 and well into the reply to u2: the band holds no question.
        band().cb([{ target: inBand('u3'), isIntersecting: false, intersectionRatio: 0 }]);
        expect(ticks(rail)[1]!.getAttribute('aria-current'), 'under u2, whose top is above the band').toBe('true');
        // Further up, into the reply to u1.
        tops['u2'] = 500;
        tops['u3'] = 3000;
        viewport.dispatchEvent(new Event('scroll'));
        band().cb([]);
        expect(ticks(rail)[0]!.getAttribute('aria-current'), 'under u1 now').toBe('true');
    });

    it('at the bottom of the transcript, the last question is current whatever the band holds', async () => {
        const { viewport, rail } = mount(THREE_TURNS());
        // The observer says the first question is the one in the band…
        band().cb([{ target: inBand('u1'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(ticks(rail)[0]!.getAttribute('aria-current')).toBe('true');
        // …but the surface is at its bottom edge: the reader is under the latest question.
        Object.defineProperty(viewport, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(viewport, 'clientHeight', { value: 300, configurable: true });
        viewport.scrollTop = 700;
        viewport.dispatchEvent(new Event('scroll'));
        await nextFrame();
        expect(ticks(rail)[2]!.getAttribute('aria-current')).toBe('true');
    });

    it('while the last question is on screen at all, it is the current one — the end of the thread is where the reader is', () => {
        const { rail } = mount(THREE_TURNS());
        band().cb([{ target: inBand('u1'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(ticks(rail)[0]!.getAttribute('aria-current')).toBe('true');
        // After a send the viewport rests with the new question low on the screen: off
        // the band, but on screen.
        expect(screen().observed.map((e) => e.getAttribute('message-id')), 'the whole surface watches the last question only').toEqual(['u3']);
        screen().cb([{ target: screen().observed[0]!, isIntersecting: true, intersectionRatio: 0.4 }]);
        expect(ticks(rail)[2]!.getAttribute('aria-current')).toBe('true');
        // It leaves the screen: the band speaks again.
        screen().cb([{ target: screen().observed[0]!, isIntersecting: false, intersectionRatio: 0 }]);
        expect(ticks(rail)[0]!.getAttribute('aria-current')).toBe('true');
    });

    it('a click announces the jump, then scrolls the bubble into view and marks it', () => {
        const turns = THREE_TURNS();
        const { rail } = mount(turns);
        const seen: AparteScrollRailJumpDetail[] = [];
        rail.addEventListener('aparte-scroll-rail-jump', (e) => seen.push((e as CustomEvent<AparteScrollRailJumpDetail>).detail));
        const scrolled = vi.fn();
        turns[2]!.scrollIntoView = scrolled;

        ticks(rail)[1]!.click();

        expect(seen).toEqual([{ messageId: 'u2' }]);
        expect(scrolled).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
        expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
    });

    it('preventDefault() on the jump leaves the transcript where it is', () => {
        const turns = THREE_TURNS();
        const { rail, viewport } = mount(turns);
        rail.addEventListener('aparte-scroll-rail-jump', (e) => e.preventDefault());
        const scrolled = vi.fn();
        turns[2]!.scrollIntoView = scrolled;
        // The viewport is not upgraded in this file: its follow is a stand-in.
        const follow = vi.fn();
        Object.assign(viewport, { setAutoScroll: follow });

        ticks(rail)[1]!.click();

        expect(scrolled).not.toHaveBeenCalled();
        expect(follow, 'and leaves the follow as it was').not.toHaveBeenCalled();
    });

    it('stops the follow before it jumps: the reader chose a message, not the bottom', () => {
        // Mid-stream, a jump into history never rendered shortens the transcript at its first
        // scroll event (the bubbles leave their 320px fallback), and the viewport read that as
        // a clamp of its own and pinned the reader back to the bottom.
        const turns = THREE_TURNS();
        const { rail, viewport } = mount(turns);
        const order: string[] = [];
        Object.assign(viewport, { setAutoScroll: (on: boolean) => { order.push(`follow ${on}`); } });
        turns[2]!.scrollIntoView = () => { order.push('jump'); };

        ticks(rail)[1]!.click();

        expect(order).toEqual(['follow false', 'jump']);
    });

    it('the arrows walk the ticks', () => {
        const { rail } = mount(THREE_TURNS());
        const list = ticks(rail);
        list[0]!.focus();
        list[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(list[1]);
        list[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(list[2]);
        list[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(list[1]);
    });

    it('is one Tab stop: the current tick, else the last, and the stop follows the arrows', async () => {
        // Every tick was a button in the tab order: a keyboard reader crossed 500 of them
        // between the transcript and the composer of a long conversation.
        const { viewport, rail } = mount(THREE_TURNS());
        const stops = (): string[] => ticks(rail).filter((t) => t.tabIndex >= 0).map((t) => t.dataset['messageId']!);
        expect(stops(), 'no current tick yet: the last one').toEqual(['u3']);
        band().cb([{ target: inBand('u2'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(stops(), 'the current tick').toEqual(['u2']);
        // The reader is on a tick: a rebuild leaves the stop where the focus is.
        ticks(rail)[0]!.focus();
        viewport.appendChild(bubble('u4', 'user', 'One more'));
        await nextFrame(); await nextFrame();
        expect(stops(), 'the focused tick keeps the stop').toEqual(['u1']);
        ticks(rail)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(ticks(rail)[3]);
        expect(stops(), 'the stop moved with the focus').toEqual(['u4']);
    });

    it('the arrows walk the ticks inside a host shadow root too', () => {
        // `document.activeElement` retargets to the shadow HOST, so "which tick holds the
        // focus?" answered -1 and the arrows were a silent no-op in the arrangement the
        // theming guide endorses.
        const wrapper = document.createElement('div');
        document.body.appendChild(wrapper);
        const root = wrapper.attachShadow({ mode: 'open' });
        const host = document.createElement('aparte-chat');
        host.id = 'c-shadow';
        const viewport = document.createElement('aparte-chat-viewport');
        for (const b of THREE_TURNS()) viewport.appendChild(b);
        host.appendChild(viewport);
        const rail = document.createElement('aparte-scroll-rail');
        host.appendChild(rail);
        root.appendChild(host);
        const list = ticks(rail);
        expect(list.length).toBe(3);

        list[0]!.focus();
        list[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));

        expect(root.activeElement, 'ArrowDown moves to the next tick').toBe(list[1]);
    });

    it('target names a chat the rail is not inside', () => {
        const host = document.createElement('aparte-chat');
        host.id = 'elsewhere';
        const viewport = document.createElement('aparte-chat-viewport');
        for (const b of THREE_TURNS()) viewport.appendChild(b);
        host.appendChild(viewport);
        document.body.appendChild(host);
        const rail = document.createElement('aparte-scroll-rail');
        rail.setAttribute('target', 'elsewhere');
        document.body.appendChild(rail);

        expect(ticks(rail)).toHaveLength(3);
    });

    it('re-labels on a locale switch', () => {
        const { rail } = mount(THREE_TURNS());
        aparteGlobalConfig.setLocale({
            ...aparteGlobalConfig.getLocale(),
            roleNameUser: 'Vous',
            scrollRailLabel: 'Plan de la conversation',
        });
        expect(rail.getAttribute('aria-label')).toBe('Plan de la conversation');
        expect(ticks(rail)[0]!.getAttribute('aria-label')).toBe('Vous: What is a web component?');
    });
});

/*
 * Measured in three real engines on 2026-09-05 (a 40-turn chat, 420px tall): the rail
 * rebuilt itself 61 to 146 times a second AT REST, with a new IntersectionObserver each
 * time. Its mutation observer watches the whole host subtree — which contains the rail —
 * and every rebuild replaced every tick, which is a mutation, which is a rebuild. Nothing
 * on a tick survived a frame: focus, the arrow keys, a hover tooltip. And the rail clipped
 * past sixteen ticks, so on the long thread it exists for, the current mark was invisible.
 *
 * jsdom runs no layout, so these prove the LOGIC: the rail ignores its own mutations,
 * keeps its nodes across a rebuild, re-observes only when the bubbles change, holds a
 * jumped mark until the transcript settles, and publishes the two measurements the
 * stylesheet positions it by. The geometry is proved by the browser bench, not here.
 */
describe('aparte-scroll-rail holds still', () => {
    it('is not rebuilt by its own mutations: one observer, the same nodes, frame after frame', async () => {
        const { rail } = mount(THREE_TURNS());
        const before = ticks(rail);
        const list = rail.querySelector('ol');
        await nextFrame(); await nextFrame(); await nextFrame();
        expect(ioConstructed, 'one pair of observers for the life of this transcript').toBe(2);
        expect(rail.querySelector('ol')).toBe(list);
        expect(ticks(rail)).toEqual(before);
    });

    it('keeps the existing ticks — and the focus on one — when a bubble is appended', async () => {
        const { viewport, rail } = mount(THREE_TURNS());
        const [first, second] = ticks(rail);
        second!.focus();
        viewport.appendChild(bubble('a3', 'assistant', 'Light DOM.'));
        viewport.appendChild(bubble('u4', 'user', 'One more'));
        await nextFrame(); await nextFrame();
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['u1', 'u2', 'u3', 'u4']);
        expect(ticks(rail)[0]).toBe(first);
        expect(ticks(rail)[1]).toBe(second);
        expect(document.activeElement, 'the reader was on a tick; a new turn does not throw them off it').toBe(second);
        expect(ioConstructed, 'the set of bubbles changed, so the observers were made once more').toBe(4);
    });

    it('a streaming reply changes nothing on the rail: no new observer, no new nodes', async () => {
        const turns = THREE_TURNS();
        const { rail } = mount(turns);
        const before = ticks(rail);
        for (let i = 0; i < 5; i++) {
            turns[1]!.querySelector('.aparte-message-content')!.textContent += ' token';
            await nextFrame();
        }
        expect(ioConstructed).toBe(2);
        expect(ticks(rail)).toEqual(before);
    });

    it('a streaming reply does not even reconcile: only a bubble coming or going rebuilds the rail', async () => {
        // Measured in Chromium at 500 questions: the reconcile ran once a frame for the whole
        // reply, 10.8 ms each, to find every name unchanged.
        const turns = THREE_TURNS();
        const { viewport, rail } = mount(turns);
        const rebuild = vi.spyOn(rail as unknown as { _rebuild(): void }, '_rebuild');
        for (let i = 0; i < 5; i++) {
            turns[1]!.querySelector('.aparte-message-content')!.textContent += ' token';
            await nextFrame();
        }
        expect(rebuild, 'tokens in a reply, which has no tick').not.toHaveBeenCalled();
        viewport.appendChild(bubble('u4', 'user', 'One more'));
        await nextFrame(); await nextFrame();
        expect(rebuild, 'a question arrived').toHaveBeenCalledTimes(1);
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['u1', 'u2', 'u3', 'u4']);
    });

    it('with every="message", a streaming reply re-names its own tick and nothing else', async () => {
        const turns = THREE_TURNS();
        const { rail } = mount(turns, { every: 'message' });
        const rebuild = vi.spyOn(rail as unknown as { _rebuild(): void }, '_rebuild');
        const before = ticks(rail);
        turns[1]!.querySelector('.aparte-message-content')!.textContent = 'A custom element, defined once.';
        await nextFrame(); await nextFrame();
        expect(rebuild).not.toHaveBeenCalled();
        expect(ticks(rail)).toEqual(before);
        expect(ticks(rail)[1]!.getAttribute('aria-label')).toBe('Assistant: A custom element, defined once.');
        expect(ticks(rail)[0]!.getAttribute('aria-label')).toBe('You: What is a web component?');
    });

    it('a streaming reply writes no attribute either: a reconcile leaves an unchanged value alone', async () => {
        const turns = THREE_TURNS();
        const { rail } = mount(turns);
        await nextFrame();
        // Named, not counted, so a red says what was rewritten. CI's WebKit measured the
        // real thing: the rail's own aria-label and the current tick's aria-current, each
        // rewritten to the value it already had, on a reconcile a late host mutation ran.
        const seen: string[] = [];
        const mo = new MutationObserver((records) => {
            for (const r of records) {
                const target = r.target as Element;
                seen.push(r.type === 'attributes'
                    ? `${r.attributeName} on <${target.tagName.toLowerCase()}>: "${r.oldValue}" → "${target.getAttribute(r.attributeName!)}"`
                    : `${r.type} on <${target.tagName.toLowerCase()}>`);
            }
        });
        mo.observe(rail, { childList: true, subtree: true, attributes: true, attributeOldValue: true });
        turns[1]!.querySelector('.aparte-message-content')!.textContent += ' token';
        await nextFrame(); await nextFrame();
        mo.disconnect();
        expect(seen, 'attributes rewritten on a reconcile that changed nothing').toEqual([]);
    });

    it('a turn that drops the oldest question moves no other tick, and the focus stays', async () => {
        // At its cap the viewport releases its oldest bubble on each turn. The stale tick was
        // removed after the placement, so every kept tick was taken out and put back: 500 of
        // them per turn measured in Chromium, and a focused tick lost the focus to <body>.
        const many = Array.from({ length: 6 }, (_, i) => bubble(`q${i}`, 'user', `Question ${i}`));
        const { viewport, rail } = mount(many);
        const list = rail.querySelector('ol')!;
        const focused = ticks(rail)[3]!;
        focused.focus();
        const moved: string[] = [];
        const mo = new MutationObserver((records) => {
            for (const r of records) {
                for (const n of r.removedNodes) moved.push(`- ${(n as Element).querySelector('button')?.dataset['messageId']}`);
                for (const n of r.addedNodes) moved.push(`+ ${(n as Element).querySelector('button')?.dataset['messageId']}`);
            }
        });
        mo.observe(list, { childList: true });
        many[0]!.remove();
        viewport.appendChild(bubble('q6', 'user', 'Question 6'));
        await nextFrame(); await nextFrame();
        mo.disconnect();
        expect(moved, 'one tick out, one in').toEqual(['- q0', '+ q6']);
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
        expect(document.activeElement).toBe(focused);
    });

    it('drops the tick of a bubble that left, and keeps the others in place', async () => {
        const turns = THREE_TURNS();
        const { rail } = mount(turns);
        const [first, , third] = ticks(rail);
        turns[2]!.remove();
        await nextFrame(); await nextFrame();
        expect(ticks(rail).map((t) => t.dataset['messageId'])).toEqual(['u1', 'u3']);
        expect(ticks(rail)[0]).toBe(first);
        expect(ticks(rail)[1]).toBe(third);
    });

    it('holds a jumped mark while the transcript settles, then lets the observer speak again', () => {
        vi.useFakeTimers();
        try {
            const turns = THREE_TURNS();
            const { rail } = mount(turns);
            turns[2]!.scrollIntoView = vi.fn();
            ticks(rail)[1]!.click();
            // Mid-scroll, the band crosses the first question: ignored while the jump settles.
            band().cb([{ target: inBand('u1'), isIntersecting: true, intersectionRatio: 0.9 }]);
            expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
            vi.advanceTimersByTime(400);
            expect(ticks(rail)[1]!.getAttribute('aria-current'), 'settled: the clicked tick is the mark').toBe('true');
            // The reader scrolls on — the first question leaves, the third enters: the observer is in charge again.
            band().cb([
                { target: inBand('u1'), isIntersecting: false, intersectionRatio: 0 },
                { target: inBand('u3'), isIntersecting: true, intersectionRatio: 0.8 },
            ]);
            expect(ticks(rail)[2]!.getAttribute('aria-current')).toBe('true');
        } finally {
            vi.useRealTimers();
        }
    });

    it('re-aligns after the transcript settles when the jump landed off the message, and stops once it is there', () => {
        vi.useFakeTimers();
        try {
            const turns = THREE_TURNS();
            const { viewport, rail } = mount(turns);
            // The scroll surface at 0; the bubble first reported 235px under the top (the
            // estimate `content-visibility: auto` scrolled to), then, once corrected, at 0.
            viewport.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
            const tops = [235, 0, 0];
            turns[2]!.getBoundingClientRect = () => ({ top: tops.shift() ?? 0 }) as DOMRect;
            const scrolled = vi.fn();
            turns[2]!.scrollIntoView = scrolled;

            ticks(rail)[1]!.click();
            expect(scrolled).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(200);
            expect(scrolled, 'settled 235px off: scrolled once more').toHaveBeenCalledTimes(2);
            vi.advanceTimersByTime(200);
            expect(scrolled, 'settled on the message: no third scroll').toHaveBeenCalledTimes(2);
            expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
        } finally {
            vi.useRealTimers();
        }
    });

    it('publishes the width of a classic scrollbar, so the stylesheet can sit clear of it', () => {
        const { viewport, rail } = mount(THREE_TURNS());
        Object.defineProperty(viewport, 'offsetWidth', { value: 300, configurable: true });
        Object.defineProperty(viewport, 'clientWidth', { value: 283, configurable: true });
        (rail as unknown as { _layout(): void })._layout();
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-bar')).toBe('17px');
    });

    it('tightens the pitch to what fits, never under the floor, and lets the default back when it fits', () => {
        const many = Array.from({ length: 10 }, (_, i) => bubble(`u${i}`, 'user', `Question ${i}`));
        const { rail } = mount(many);
        const layout = (rail as unknown as { _layout(): void })._layout.bind(rail);
        Object.defineProperty(rail, 'clientHeight', { value: 100, configurable: true });
        layout();
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-hit-size'), '10 ticks in 100px: a 10px pitch').toBe('10px');
        // The theme derives the gap on :root, where a tightened hit size cannot reach it.
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-gap'), 'the gap follows: pitch minus the line').toBe('8px');
        Object.defineProperty(rail, 'clientHeight', { value: 30, configurable: true });
        layout();
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-hit-size'), 'the floor').toBe('6px');
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-gap')).toBe('4px');
        Object.defineProperty(rail, 'clientHeight', { value: 400, configurable: true });
        layout();
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-hit-size'), 'room enough: the stylesheet decides').toBe('');
        expect(rail.style.getPropertyValue('--aparte-scroll-rail-gap')).toBe('');
    });

    it('past the floor, scrolls itself so the current tick stays in its window', () => {
        const many = Array.from({ length: 10 }, (_, i) => bubble(`u${i}`, 'user', `Question ${i}`));
        const { rail } = mount(many);
        Object.defineProperty(rail, 'clientHeight', { value: 30, configurable: true });
        const last = ticks(rail)[9]!;
        Object.defineProperty(last, 'offsetTop', { value: 56, configurable: true });
        Object.defineProperty(last, 'offsetHeight', { value: 2, configurable: true });
        band().cb([{ target: inBand('u9'), isIntersecting: true, intersectionRatio: 1 }]);
        expect(rail.scrollTop, 'the mark is below the window: the rail slid down to it').toBeGreaterThan(0);
    });
});

