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
import type { AparteSidebar, AparteSidebarToggleDetail } from '../aparte-sidebar.js';
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
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(el.collapsed).toBe(true);
            expect(document.activeElement).toBe(opener);
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
