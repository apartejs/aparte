// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

function mount(items: AparteConversationListItem[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

const rowOf = (el: ListEl, id: string): HTMLElement => el.querySelector<HTMLElement>(`[data-conv-id="${id}"]`)!;
const moreOf = (el: ListEl, id: string): HTMLElement => rowOf(el, id).querySelector<HTMLElement>('.aparte-conv-item__more')!;
const openMenu = (el: ListEl, id: string): HTMLElement => {
    moreOf(el, id).click();
    return el.querySelector<HTMLElement>('[role="menu"]')!;
};
const choose = (el: ListEl, action: string): void => {
    el.querySelector<HTMLElement>(`[data-menu-action="${action}"]`)!.click();
};
const listen = (el: ListEl, name: string): unknown[] => {
    const seen: unknown[] = [];
    el.addEventListener(name, (e) => seen.push((e as CustomEvent).detail));
    return seen;
};
const key = (el: Element, k: string): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-conversation-list — the row menu', () => {
    it('opens one menu, named after the row, with rename / pin / archive / delete', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const menu = openMenu(el, 'c1');

        expect(menu.getAttribute('aria-label')).toBe('Hello');
        expect(moreOf(el, 'c1').getAttribute('aria-expanded')).toBe('true');
        const actions = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((b) => b.dataset['menuAction']);
        expect(actions).toEqual(['rename', 'pin', 'archive', 'delete']);
        expect(menu.textContent).toContain('Rename');
        expect(menu.textContent).toContain('Pin');
        expect(menu.textContent).toContain('Archive');
        expect(menu.textContent).toContain('Delete');
    });

    it('is one menu at a time: opening a second row closes the first', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        openMenu(el, 'c1');
        openMenu(el, 'c2');

        expect(el.querySelectorAll('[role="menu"]').length).toBe(1);
        expect(moreOf(el, 'c1').getAttribute('aria-expanded')).toBe('false');
        expect(moreOf(el, 'c2').getAttribute('aria-expanded')).toBe('true');
    });

    it('a second click on the same ⋯ closes its menu', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        openMenu(el, 'c1');
        moreOf(el, 'c1').click();
        expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('a pointerdown outside closes it; one on the ⋯ itself does not (the click toggles)', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        openMenu(el, 'c1');
        moreOf(el, 'c1').dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(el.querySelector('[role="menu"]'), 'still open').not.toBeNull();

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('a scroll anywhere closes it — the placement was measured once', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        openMenu(el, 'c1');
        document.dispatchEvent(new Event('scroll'));
        expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('re-assigning conversations while a menu is open drops it cleanly', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        openMenu(el, 'c1');
        el.conversations = [{ id: 'c1', title: 'One again' }];
        expect(el.querySelector('[role="menu"]')).toBeNull();
        expect(moreOf(el, 'c1').getAttribute('aria-expanded')).toBe('false');
    });

    it('pin fires aparte-conversation-pin; on a pinned row the same item fires unpin', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two', pinnedAt: 1 }]);
        const pinned = listen(el, 'aparte-conversation-pin');
        const unpinned = listen(el, 'aparte-conversation-unpin');

        openMenu(el, 'c1');
        choose(el, 'pin');
        openMenu(el, 'c2');
        expect(el.querySelector('[data-menu-action="pin"]')!.textContent).toContain('Unpin');
        choose(el, 'pin');

        expect(pinned).toEqual([{ id: 'c1' }]);
        expect(unpinned).toEqual([{ id: 'c2' }]);
        expect(el.querySelector('[role="menu"]'), 'the menu closes on a choice').toBeNull();
    });

    it('archive fires aparte-conversation-archive; on an archived row it fires unarchive', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two', archivedAt: 1 }]);
        const archived = listen(el, 'aparte-conversation-archive');
        const unarchived = listen(el, 'aparte-conversation-unarchive');

        openMenu(el, 'c1');
        choose(el, 'archive');
        openMenu(el, 'c2');
        choose(el, 'archive');

        expect(archived).toEqual([{ id: 'c1' }]);
        expect(unarchived).toEqual([{ id: 'c2' }]);
    });

    describe('delete asks first', () => {
        it('shows the question with the title, and Cancel fires nothing', () => {
            const el = mount([{ id: 'c1', title: 'Deploy checklist' }]);
            const deleted = listen(el, 'aparte-conversation-delete');
            const menu = openMenu(el, 'c1');
            choose(el, 'delete');

            expect(menu.textContent).toContain('Delete “Deploy checklist”?');
            expect(deleted, 'asking is not deleting').toEqual([]);
            choose(el, 'cancel');

            expect(deleted).toEqual([]);
            expect(el.querySelector('[role="menu"]')).toBeNull();
        });

        it('confirming fires aparte-conversation-delete once and closes', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const deleted = listen(el, 'aparte-conversation-delete');
            openMenu(el, 'c1');
            choose(el, 'delete');
            choose(el, 'confirm-delete');

            expect(deleted).toEqual([{ id: 'c1' }]);
            expect(el.querySelector('[role="menu"]')).toBeNull();
        });

        it('a hostile title cannot break out of the question', () => {
            const el = mount([{ id: 'c1', title: '<img src=x onerror="window.__pwned=1">' }]);
            openMenu(el, 'c1');
            choose(el, 'delete');
            expect(el.querySelector('img')).toBeNull();
            expect(el.querySelector('.aparte-conv-menu__question')!.textContent).toContain('<img src=x');
        });
    });

    describe('rename', () => {
        it('swaps the title for an input holding the current title, focused and selected', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            openMenu(el, 'c1');
            choose(el, 'rename');

            const input = rowOf(el, 'c1').querySelector<HTMLInputElement>('input.aparte-conv-item__input')!;
            expect(input).not.toBeNull();
            expect(input.value).toBe('One');
            expect(input.getAttribute('aria-label')).toBe('Conversation title');
            expect(document.activeElement).toBe(input);
            expect(rowOf(el, 'c1').querySelector('.aparte-conv-item__select'), 'the title button is gone while editing').toBeNull();
        });

        it('Enter commits the trimmed title and puts the focus back on the row', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const renamed = listen(el, 'aparte-conversation-rename');
            openMenu(el, 'c1');
            choose(el, 'rename');
            const input = el.querySelector<HTMLInputElement>('input')!;
            input.value = '  Two  ';
            key(input, 'Enter');

            expect(renamed).toEqual([{ id: 'c1', title: 'Two' }]);
            expect(el.querySelector('input')).toBeNull();
            expect(document.activeElement).toBe(rowOf(el, 'c1').querySelector('.aparte-conv-item__select'));
        });

        it('Escape cancels: no event, the title button is back', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const renamed = listen(el, 'aparte-conversation-rename');
            openMenu(el, 'c1');
            choose(el, 'rename');
            const input = el.querySelector<HTMLInputElement>('input')!;
            input.value = 'Two';
            key(input, 'Escape');

            expect(renamed).toEqual([]);
            expect(el.querySelector('input')).toBeNull();
            expect(rowOf(el, 'c1').textContent).toContain('One');
        });

        it('an unchanged or emptied title fires nothing', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const renamed = listen(el, 'aparte-conversation-rename');
            openMenu(el, 'c1');
            choose(el, 'rename');
            key(el.querySelector('input')!, 'Enter');
            openMenu(el, 'c1');
            choose(el, 'rename');
            el.querySelector<HTMLInputElement>('input')!.value = '   ';
            key(el.querySelector('input')!, 'Enter');

            expect(renamed).toEqual([]);
        });

        it('leaving the field commits once — the blur a removal causes does not commit again', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const renamed = listen(el, 'aparte-conversation-rename');
            openMenu(el, 'c1');
            choose(el, 'rename');
            const input = el.querySelector<HTMLInputElement>('input')!;
            input.value = 'Two';
            input.blur();

            expect(renamed).toEqual([{ id: 'c1', title: 'Two' }]);
        });

        it('typing Enter in the input does not select the row', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            const selected = listen(el, 'aparte-conversation-select');
            openMenu(el, 'c1');
            choose(el, 'rename');
            const input = el.querySelector<HTMLInputElement>('input')!;
            input.click();
            key(input, 'Enter');
            expect(selected).toEqual([]);
        });

        // The rename ends by re-rendering the list, so the field the reader was in stops
        // existing. Enter and Escape put the row back under the keyboard; the third exit
        // — Tab, or a click somewhere else — dropped it on `<body>`, and the next Tab
        // restarted at the top of the page.
        const startRename = (el: ListEl, id: string): HTMLInputElement => {
            openMenu(el, id);
            choose(el, 'rename');
            return el.querySelector<HTMLInputElement>('input')!;
        };
        const blurTo = (input: HTMLInputElement, relatedTarget: Element | null): void => {
            input.dispatchEvent(new FocusEvent('blur', { relatedTarget, bubbles: false }));
        };

        it('leaving the field for somewhere in the list puts the row back under the keyboard', () => {
            const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
            const input = startRename(el, 'c1');
            input.value = 'Renamed';
            blurTo(input, rowOf(el, 'c2'));

            expect(document.activeElement).toBe(rowOf(el, 'c1').querySelector('.aparte-conv-item__select'));
        });

        it('keeps the row focused when the host re-assigns conversations on the rename event', () => {
            const el = mount([{ id: 'c1', title: 'One' }]);
            el.addEventListener('aparte-conversation-rename', (e) => {
                const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
                el.conversations = [{ id, title }];
            });
            const input = startRename(el, 'c1');
            input.value = 'Two';
            key(input, 'Enter');

            expect(rowOf(el, 'c1').textContent).toContain('Two');
            expect(document.activeElement).toBe(rowOf(el, 'c1').querySelector('.aparte-conv-item__select'));
        });

        it('does not pull the focus back when it went to a live control outside the list', () => {
            const outside = document.createElement('button');
            document.body.appendChild(outside);
            const el = mount([{ id: 'c1', title: 'One' }]);
            const input = startRename(el, 'c1');
            input.value = 'Two';
            outside.focus();
            blurTo(input, outside);

            expect(document.activeElement).toBe(outside);
        });
    });

    it('the ⋯ button is named by the locale and its glyph comes from the icon provider', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const more = moreOf(el, 'c1');
        expect(more.getAttribute('aria-label')).toBe('Conversation actions');
        expect(more.querySelector('svg')).not.toBeNull();
    });

    it('a menu is placed with fixed coordinates, so the list\'s own overflow cannot clip it', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            top: 100, bottom: 120, left: 200, right: 240, width: 40, height: 20, x: 200, y: 100, toJSON: () => ({}),
        } as DOMRect);
        const menu = openMenu(el, 'c1');
        spy.mockRestore();
        expect(menu.style.top).toBe('124px');
        // End-aligned with the button: left = button.right - menu.width (both 40 here).
        expect(menu.style.left).toBe('200px');
    });
});
