// @vitest-environment jsdom
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

const key = (el: Element, k: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-conversation-list — keyboard reachability (WCAG 2.1.1)', () => {
    /*
     * The row used to be a `role="button"` div wrapping two more buttons — interactive
     * content nested in interactive content, which no assistive technology models, and
     * a synthetic Enter/Space handler to make the div act. It is now two REAL buttons:
     * the title, which selects, and the `⋯`, which opens the menu. Native activation,
     * nothing to hijack, and the tab order is the reading order.
     */
    it('a row is two native buttons, and no div pretends to be one', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        expect(el.querySelector('[role="button"]')).toBeNull();
        const select = el.querySelector<HTMLButtonElement>('.aparte-conv-item__select')!;
        const more = el.querySelector<HTMLButtonElement>('.aparte-conv-item__more')!;
        expect(select.tagName).toBe('BUTTON');
        expect(more.tagName).toBe('BUTTON');
        expect(more.getAttribute('aria-haspopup')).toBe('menu');
        expect(more.getAttribute('aria-expanded')).toBe('false');
    });

    it('the title button selects; the ⋯ button never does', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const selected: string[] = [];
        el.addEventListener('aparte-select-conversation', (e) => selected.push((e as CustomEvent).detail.id));

        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        expect(selected, 'opening the menu is not a selection').toEqual([]);

        el.querySelector<HTMLElement>('.aparte-conv-item__select')!.click();
        expect(selected).toEqual(['c1']);
    });

    it('Escape closes the menu and returns focus to the ⋯ button', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const more = el.querySelector<HTMLElement>('.aparte-conv-item__more')!;
        more.click();
        const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
        expect(document.activeElement, 'focus moved into the menu').toBe(menu.querySelector('[role="menuitem"]'));

        const event = key(document.activeElement!, 'Escape');

        expect(event.defaultPrevented).toBe(true);
        expect(el.querySelector('[role="menu"]')).toBeNull();
        expect(more.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(more);
    });

    it('ArrowDown / ArrowUp move through the items and wrap; Home and End jump', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        const items = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        expect(items.length).toBe(4);

        key(document.activeElement!, 'ArrowDown');
        expect(document.activeElement).toBe(items[1]);
        key(document.activeElement!, 'ArrowUp');
        key(document.activeElement!, 'ArrowUp');
        expect(document.activeElement, 'wraps from the first to the last').toBe(items[3]);
        key(document.activeElement!, 'Home');
        expect(document.activeElement).toBe(items[0]);
        key(document.activeElement!, 'End');
        expect(document.activeElement).toBe(items[3]);
    });

    it('Tab leaves the menu: it closes and the ⋯ button takes the focus back', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const more = el.querySelector<HTMLElement>('.aparte-conv-item__more')!;
        more.click();

        key(document.activeElement!, 'Tab');

        expect(el.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(more);
    });

    it('the delete confirmation lands the focus on Cancel, the safe answer', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        el.querySelector<HTMLElement>('[data-menu-action="delete"]')!.click();

        expect(document.activeElement).toBe(el.querySelector('[data-menu-action="cancel"]'));
    });
});
