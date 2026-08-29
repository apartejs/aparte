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
let ioCallback: IOCallback | null = null;
const observed: Element[] = [];

beforeEach(() => {
    ioCallback = null;
    observed.length = 0;
    // jsdom has no IntersectionObserver; a stub that hands the callback to the test.
    class IO {
        constructor(cb: IOCallback) { ioCallback = cb; }
        observe(el: Element): void { observed.push(el); }
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

    it('marks the bubble with the largest visible share as current, via the intersection observer', () => {
        const { rail } = mount(THREE_TURNS());
        expect(observed.map((e) => e.getAttribute('message-id'))).toEqual(['u1', 'u2', 'u3']);
        ioCallback!([
            { target: observed[0]!, isIntersecting: false, intersectionRatio: 0 },
            { target: observed[1]!, isIntersecting: true, intersectionRatio: 0.6 },
            { target: observed[2]!, isIntersecting: true, intersectionRatio: 0.2 },
        ]);
        expect(ticks(rail).map((t) => t.getAttribute('aria-current'))).toEqual([null, 'true', null]);
        expect((rail as HTMLElement & { currentMessageId: string | null }).currentMessageId).toBe('u2');

        // Nothing in the band keeps the last mark rather than clearing it.
        ioCallback!([
            { target: observed[1]!, isIntersecting: false, intersectionRatio: 0 },
            { target: observed[2]!, isIntersecting: false, intersectionRatio: 0 },
        ]);
        expect(ticks(rail)[1]!.getAttribute('aria-current')).toBe('true');
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
        const { rail } = mount(turns);
        rail.addEventListener('aparte-scroll-rail-jump', (e) => e.preventDefault());
        const scrolled = vi.fn();
        turns[2]!.scrollIntoView = scrolled;

        ticks(rail)[1]!.click();

        expect(scrolled).not.toHaveBeenCalled();
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
