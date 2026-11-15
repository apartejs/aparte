// @vitest-environment jsdom
/**
 * A host assigns `conversations` on every manager change, and a wrapper on every render of the
 * app around it — often the very array the list holds, mutated in place. A row's open menu and a
 * title being renamed are the reader's: the rows are drawn again once they end, not under them.
 */
import { describe, it, expect, afterEach } from 'vitest';
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
const openMenu = (el: ListEl, id: string): HTMLElement => {
    el.querySelector<HTMLElement>(`[data-more-id="${id}"]`)!.click();
    return el.querySelector<HTMLElement>('[role="menu"]')!;
};
const choose = (el: ListEl, action: string): void => {
    el.querySelector<HTMLElement>(`[data-menu-action="${action}"]`)!.click();
};

afterEach(() => { document.body.innerHTML = ''; });

describe('rows handed again', () => {
    it('keep a row menu open, with the focus in it, and draw once it closes', () => {
        const items = [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }];
        const el = mount(items);
        const menu = openMenu(el, 'b');
        const focused = document.activeElement;
        expect(menu.contains(focused)).toBe(true);

        items[0]!.title = 'One, renamed';
        el.conversations = items;
        expect(el.querySelector('[role="menu"]')).toBe(menu);
        expect(document.activeElement).toBe(focused);

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(el.querySelector('[role="menu"]')).toBeNull();
        expect(rowOf(el, 'a').textContent).toContain('One, renamed');
    });

    it('keep a title being renamed, with what was typed, and draw when the rename ends', () => {
        const items = [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }];
        const el = mount(items);
        openMenu(el, 'a');
        choose(el, 'rename');
        const input = rowOf(el, 'a').querySelector<HTMLInputElement>('input.aparte-conv-item__input')!;
        input.value = 'Half typed';

        items.push({ id: 'c', title: 'Three' });
        el.conversations = items;
        expect(rowOf(el, 'a').querySelector('input')).toBe(input);
        expect(input.value).toBe('Half typed');
        expect(document.activeElement).toBe(input);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(rowOf(el, 'c')).not.toBeNull();
    });
});
