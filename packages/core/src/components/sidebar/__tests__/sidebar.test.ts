// @vitest-environment jsdom
/**
 * The sidebar has three behaviours and owns no content: it collapses, it becomes a
 * drawer under the breakpoint, and its search field filters the conversation list.
 * jsdom has no layout, so the drawer is driven through a `matchMedia` stub and the
 * assertions are on attributes, the scrim, focus and events — not on pixels.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-sidebar.js';
import '../../conversation-list/aparte-conversation-list.js';
import { AparteSidebar } from '../aparte-sidebar.js';
import type { AparteSidebarToggleDetail } from '../aparte-sidebar.js';
import type { AparteConversationListItem } from '../../conversation-list/aparte-conversation-list.js';

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

function mount(html = ''): AparteSidebar {
    const el = document.createElement('aparte-sidebar') as AparteSidebar;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

/** The same, with the attributes present BEFORE the element is connected. */
function mountWith(attrs: Record<string, string>, html = ''): AparteSidebar {
    const el = document.createElement('aparte-sidebar') as AparteSidebar;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
}

let tagSeq = 0;

/**
 * Author the markup FIRST, then define the element — the only route to the UPGRADE
 * path, where `attributeChangedCallback` fires for every authored attribute while the
 * element is already in the document and before `connectedCallback` has run. `mount()`
 * cannot reach it: `createElement` on a defined tag hands back an upgraded element.
 */
function upgrade(markup: string, html = ''): AparteSidebar {
    const tag = `x-sidebar-${++tagSeq}`;
    document.body.innerHTML = `<${tag} ${markup}>${html}</${tag}>`;
    customElements.define(tag, class extends AparteSidebar {});
    customElements.upgrade(document.body);
    return document.body.firstElementChild as AparteSidebar;
}

/** Toggles heard on the body, so an upgrade that fires one before we hold the element is seen. */
function watchToggles(): { seen: AparteSidebarToggleDetail[]; stop: () => void } {
    const seen: AparteSidebarToggleDetail[] = [];
    const onToggle = (e: Event): void => { seen.push((e as CustomEvent<AparteSidebarToggleDetail>).detail); };
    document.body.addEventListener('aparte-sidebar-toggle', onToggle);
    return { seen, stop: () => document.body.removeEventListener('aparte-sidebar-toggle', onToggle) };
}

const events = (el: HTMLElement): AparteSidebarToggleDetail[] => {
    const seen: AparteSidebarToggleDetail[] = [];
    el.addEventListener('aparte-sidebar-toggle', (e) => seen.push((e as CustomEvent<AparteSidebarToggleDetail>).detail));
    return seen;
};

describe('aparte-sidebar', () => {
    it('is a labelled complementary region that wears the recipe', () => {
        const el = mount();
        expect(el.classList.contains('aparte-sidebar')).toBe(true);
        expect(el.getAttribute('role')).toBe('complementary');
        expect(el.getAttribute('aria-label')).toBe('Conversations');
        expect(el.collapsed).toBe(false);
        expect(el.drawer).toBe(false);
    });

    it('collapsed is the attribute: the property, the methods and the host agree, and each change is announced once', () => {
        const el = mount();
        const seen = events(el);
        el.close();
        expect(el.hasAttribute('collapsed')).toBe(true);
        el.setAttribute('collapsed', '');
        el.toggle();
        expect(el.collapsed).toBe(false);
        expect(seen).toEqual([{ collapsed: true, drawer: false }, { collapsed: false, drawer: false }]);
    });

    it('an authored `collapsed` is markup, not a change: the upgrade announces nothing', () => {
        mediaMatches = true;
        const { seen, stop } = watchToggles();
        try {
            const el = upgrade('collapsed');
            expect(seen, 'the markup is the starting state, not a toggle').toEqual([]);
            expect(el.collapsed).toBe(true);
            expect(el.drawer, 'and it came up over a real drawer').toBe(true);
        } finally {
            stop();
        }
    });

    it('mounted already narrow, the FIRST open() is still announced', () => {
        // The guard against the naive fix: stamp `_lastCollapsed` before the breakpoint
        // runs and the drawer's own close is never recorded, so the first open reads as
        // "no change" and the host hears nothing.
        mediaMatches = true;
        const el = mount();
        expect(el.drawer).toBe(true);
        expect(el.collapsed).toBe(true);
        const seen = events(el);
        el.open();
        expect(seen).toEqual([{ collapsed: false, drawer: true }]);
    });

    it('a [data-aparte-sidebar-toggle] anywhere toggles the nearest sidebar, or the one it names', () => {
        const el = mount();
        const other = document.createElement('aparte-sidebar') as AparteSidebar;
        other.id = 'second';
        document.body.appendChild(other);
        const button = document.createElement('button');
        button.setAttribute('data-aparte-sidebar-toggle', '');
        document.body.appendChild(button);
        const named = document.createElement('button');
        named.setAttribute('data-aparte-sidebar-toggle', 'second');
        document.body.appendChild(named);

        button.click();
        expect(el.collapsed, 'the first sidebar on the page').toBe(true);
        expect(other.collapsed).toBe(false);
        named.click();
        expect(other.collapsed).toBe(true);
        expect(el.collapsed).toBe(true);
    });

    describe('the drawer', () => {
        it('enters on a narrow window, closed, and leaves on a wide one, open', () => {
            const el = mount();
            narrow(true);
            expect(el.drawer).toBe(true);
            expect(el.collapsed, 'a narrow window must not open on an overlay').toBe(true);
            expect(el.querySelector('.aparte-sidebar__scrim')).toBeNull();
            narrow(false);
            expect(el.drawer).toBe(false);
            expect(el.collapsed).toBe(false);
        });

        it('open, it draws a scrim; a click on it or Escape closes and hands the focus back to the opener', () => {
            const el = mount();
            const opener = document.createElement('button');
            opener.setAttribute('data-aparte-sidebar-toggle', '');
            document.body.appendChild(opener);
            narrow(true);

            opener.focus();
            opener.click();
            expect(el.collapsed).toBe(false);
            const scrim = el.querySelector<HTMLElement>('.aparte-sidebar__scrim');
            expect(scrim).not.toBeNull();

            scrim!.click();
            expect(el.collapsed).toBe(true);
            expect(el.querySelector('.aparte-sidebar__scrim')).toBeNull();
            expect(document.activeElement).toBe(opener);

            opener.click();
            // On the element the listener sits on, Escape proves nothing about where the
            // reader's focus is — and opening the drawer moves it inside.
            document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(el.collapsed).toBe(true);
            expect(document.activeElement).toBe(opener);
        });

        it('Escape closes it from wherever focus is, not only from inside', () => {
            mediaMatches = true;
            const el = mount('<button class="in">in</button>');
            const outside = document.createElement('button');
            document.body.appendChild(outside);
            el.open();
            outside.focus();
            expect(document.activeElement, 'focus is on the page, not in the drawer').toBe(outside);

            outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(el.collapsed).toBe(true);
        });

        it('opening the drawer moves focus into it', () => {
            mediaMatches = true;
            const el = mount('<div class="aparte-sidebar__search"><input type="search" data-aparte-sidebar-search></div>');
            const opener = document.createElement('button');
            opener.setAttribute('data-aparte-sidebar-toggle', '');
            document.body.appendChild(opener);
            opener.focus();

            opener.click();
            expect(el.collapsed).toBe(false);
            expect(document.activeElement, 'an overlay nobody can reach is not open').toBe(el.querySelector('input'));
        });

        it('a closed sidebar leaves the tab order and the a11y tree', () => {
            const el = mount('<button class="in">in</button>');
            expect(el.hasAttribute('inert')).toBe(false);
            expect(el.hasAttribute('aria-hidden')).toBe(false);

            el.close();
            expect(el.hasAttribute('inert'), 'a folded column is no tab stop').toBe(true);
            expect(el.getAttribute('aria-hidden')).toBe('true');

            el.open();
            expect(el.hasAttribute('inert')).toBe(false);
            expect(el.hasAttribute('aria-hidden')).toBe(false);
        });

        it('it only ever takes back the inert it put there — a host hiding an open sidebar keeps it', () => {
            // A host inerting the sidebar behind its own modal is the standard pattern.
            // Any re-evaluation of the breakpoint reaches `_syncHidden`, and an element
            // that removes what it did not write un-inerts the page behind the overlay.
            const el = mount('<button class="in">in</button>');
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');

            el.setAttribute('breakpoint', 'none');
            expect(el.collapsed, 'nothing about the collapse changed').toBe(false);
            expect(el.hasAttribute('inert'), "the host's inert is the host's").toBe(true);
            expect(el.getAttribute('aria-hidden')).toBe('true');
        });

        it('a collapse the host asked for survives the window widening, and announces nothing', () => {
            const el = mount();
            el.close();
            const seen = events(el);

            narrow(true);
            expect(el.drawer).toBe(true);
            expect(el.collapsed).toBe(true);

            narrow(false);
            expect(el.drawer).toBe(false);
            expect(el.collapsed, 'a resize is not the host changing its mind').toBe(true);
            expect(seen, 'and nothing was announced either').toEqual([]);
        });

        it('<aparte-sidebar collapsed> loading narrow stays collapsed when the window widens', () => {
            mediaMatches = true;
            const el = mountWith({ collapsed: '' });
            expect(el.drawer).toBe(true);
            narrow(false);
            expect(el.collapsed, 'the markup asked for it').toBe(true);
        });

        it('closing the DRAWER is not a column preference: widening reopens the column', () => {
            mediaMatches = true;
            const el = mount();
            el.open();
            el.close();

            narrow(false);
            expect(el.collapsed, 'dismissing an overlay is not folding a column').toBe(false);
        });

        it('a re-parent does not turn the breakpoint\'s own close into a host preference', () => {
            // The drawer closed itself on the way in. Moving the element — a framework
            // re-render, a tab swap, a drag of the panel — runs `connectedCallback` again,
            // and reading `collapsed` back there would record the element's OWN write as
            // the host's word, so the column would never reopen.
            mediaMatches = true;
            const el = mount();
            expect(el.collapsed).toBe(true);

            const box = document.createElement('div');
            document.body.appendChild(box);
            box.appendChild(el);

            narrow(false);
            expect(el.collapsed, 'a wide window has room for the column').toBe(false);
        });

        it('a collapse the host asked for survives a re-parent too', () => {
            // The other half: the intent is seeded once, so moving the element must not
            // forget it either.
            const el = mount();
            el.close();
            const box = document.createElement('div');
            document.body.appendChild(box);
            box.appendChild(el);

            narrow(true);
            narrow(false);
            expect(el.collapsed, 'the host folded the column before the move').toBe(true);
        });

        it('breakpoint="none" keeps the column in the flow whatever the window; a length sets the query', () => {
            const el = mount();
            el.setAttribute('breakpoint', 'none');
            narrow(true);
            expect(el.drawer).toBe(false);
            expect(el.collapsed).toBe(false);

            el.setAttribute('breakpoint', '40rem');
            expect(el.drawer, 'the stub says the query matches').toBe(true);
        });

        it('Escape does nothing in the flow — the column is not an overlay', () => {
            const el = mount();
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            el.dispatchEvent(event);
            expect(el.collapsed).toBe(false);
            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe('search', () => {
        const items: AparteConversationListItem[] = [
            { id: 'a', title: 'Deploy checklist', updatedAt: Date.now() },
            { id: 'b', title: 'Épingler la conversation', updatedAt: Date.now() },
            { id: 'c', title: 'Old thread', updatedAt: Date.now() - 100 * 864e5 },
        ];

        function withList(): { el: AparteSidebar; input: HTMLInputElement; rows: () => Record<string, boolean> } {
            const el = mount(`
                <div class="aparte-sidebar__search"><input type="search" data-aparte-sidebar-search></div>
                <div class="aparte-sidebar__body"><aparte-conversation-list></aparte-conversation-list></div>`);
            (el.querySelector('aparte-conversation-list') as HTMLElement & { conversations: AparteConversationListItem[] }).conversations = items;
            const input = el.querySelector<HTMLInputElement>('input')!;
            const rows = (): Record<string, boolean> => Object.fromEntries(
                Array.from(el.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => [r.dataset['convId']!, r.hidden]),
            );
            return { el, input, rows };
        }

        it('typing filters the rows by title, case- and accent-insensitive; clearing shows all', () => {
            const { input, rows } = withList();
            input.value = 'epingler';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(rows()).toEqual({ a: true, b: false, c: true });

            input.value = 'DEPLOY';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(rows()).toEqual({ a: false, b: true, c: true });

            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(rows()).toEqual({ a: false, b: false, c: false });
        });

        it('a date group with nothing left hides with its rows', () => {
            const { el, input } = withList();
            input.value = 'deploy';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const groups = Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group'));
            expect(groups.length).toBeGreaterThan(1);
            const hiddenGroups = groups.filter((g) => g.hidden);
            expect(hiddenGroups.length, 'the month of the old thread').toBe(1);
            expect(hiddenGroups[0]!.querySelector('[data-conv-id="c"]')).not.toBeNull();
        });

        it('filter() is the same thing, callable from a host', () => {
            const { el, rows } = withList();
            el.filter('old');
            expect(rows()).toEqual({ a: true, b: true, c: false });
        });
    });
});
