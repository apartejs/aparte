// @vitest-environment jsdom
/**
 * The sidebar's toggle says what it does, and the drawer keeps the keyboard (UI audit
 * LOT 7).
 *
 * A `[data-aparte-sidebar-toggle]` control opened and closed the sidebar without ever
 * announcing its state — no `aria-expanded`, no `aria-controls` — while the row's own
 * `⋯` button already did both. And the drawer, which draws a scrim over the page, moved
 * the focus in on open and closed on Escape, but Tab from its last control walked out
 * under the scrim, onto the transcript the drawer was covering. Tab is the one path
 * closed here; a `focusin` guard was considered and refused, because it would steal the
 * focus back from a dialog the drawer's own content opens onto `<body>`.
 *
 * The toggle state is synced wherever the state settles (connect, the collapsed
 * attribute, the breakpoint), never from `open()` alone — a close on Escape would
 * otherwise leave an "expanded" that lies.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-sidebar.js';
import type { AparteSidebar } from '../aparte-sidebar.js';

type MediaListener = (e: { matches: boolean }) => void;
let mediaMatches = false;
let mediaListeners: MediaListener[] = [];

beforeEach(() => {
    mediaMatches = false;
    mediaListeners = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        get matches() { return mediaMatches; },
        addEventListener: (_: string, cb: MediaListener) => { mediaListeners.push(cb); },
        removeEventListener: (_: string, cb: MediaListener) => { mediaListeners = mediaListeners.filter((l) => l !== cb); },
    });
});

afterEach(() => { document.body.innerHTML = ''; });

const narrow = (matches: boolean): void => {
    mediaMatches = matches;
    for (const cb of mediaListeners) cb({ matches });
};

function mountPage(): { toggle: HTMLButtonElement; sidebar: AparteSidebar; outside: HTMLButtonElement } {
    document.body.innerHTML = `
        <button type="button" data-aparte-sidebar-toggle>☰</button>
        <aparte-sidebar>
            <button type="button" id="first">New chat</button>
            <input id="search" data-aparte-sidebar-search />
            <button type="button" id="last">Settings</button>
        </aparte-sidebar>
        <button type="button" id="outside">Send</button>`;
    return {
        toggle: document.querySelector('[data-aparte-sidebar-toggle]') as HTMLButtonElement,
        sidebar: document.querySelector('aparte-sidebar') as AparteSidebar,
        outside: document.querySelector('#outside') as HTMLButtonElement,
    };
}

const key = (target: Element, k: string, shiftKey = false): boolean =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

describe('the toggle control', () => {
    it('is bound to the sidebar and announces its state at rest', () => {
        const { toggle, sidebar } = mountPage();
        expect(sidebar.id, 'the sidebar gives itself an id so a control can point at it').toBeTruthy();
        expect(toggle.getAttribute('aria-controls')).toBe(sidebar.id);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('follows a click, both ways', () => {
        const { toggle } = mountPage();
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('follows the breakpoint closing the drawer, and Escape closing it again', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        expect(sidebar.collapsed).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        key(document.body, 'Escape');
        expect(sidebar.collapsed).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps a host-authored id', () => {
        document.body.innerHTML = `<button type="button" data-aparte-sidebar-toggle="nav">☰</button><aparte-sidebar id="nav"></aparte-sidebar>`;
        const toggle = document.querySelector('[data-aparte-sidebar-toggle]')!;
        expect(document.querySelector('aparte-sidebar')!.id).toBe('nav');
        expect(toggle.getAttribute('aria-controls')).toBe('nav');
    });
});

describe('the open drawer keeps the keyboard', () => {
    it('Tab from the last control wraps to the first, Shift+Tab from the first to the last', () => {
        const { toggle, sidebar } = mountPage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);
        const first = sidebar.querySelector<HTMLElement>('#first')!;
        const last = sidebar.querySelector<HTMLElement>('#last')!;

        last.focus();
        const notPrevented = key(last, 'Tab');
        expect(notPrevented, 'Tab at the end must be handled, or the focus leaves the drawer').toBe(false);
        expect(document.activeElement).toBe(first);

        key(first, 'Tab', true);
        expect(document.activeElement).toBe(last);
    });

    it('a script that focuses outside is left alone — a dialog opened from the drawer onto <body> must keep its focus', () => {
        const { toggle, sidebar, outside } = mountPage();
        narrow(true);
        toggle.click();
        expect(sidebar.collapsed).toBe(false);

        outside.focus();
        expect(document.activeElement).toBe(outside);
    });

    it('does nothing in the flow: Tab leaves the column as it always did', () => {
        const { sidebar } = mountPage();
        const last = sidebar.querySelector<HTMLElement>('#last')!;
        last.focus();
        expect(key(last, 'Tab')).toBe(true);
    });
});
