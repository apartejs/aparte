// @vitest-environment jsdom
/**
 * The row menu runs on `enhanceMenu` / `enhanceContextMenu`, the helpers the kit gives a host
 * for its own menus. What that brought the list: a right click, Shift+F10 or the Menu key on
 * a row opens the same menu there, and a letter moves to the item that starts with it. What
 * it kept: the delete question, its arrows, and the events the list fires.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[]; filter(query: string): number };

function mount(items: AparteConversationListItem[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

const selectOf = (el: ListEl, id: string): HTMLElement => el.querySelector<HTMLElement>(`[data-select-id="${id}"]`)!;
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};
const rightClick = (target: Element): MouseEvent => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: 40, clientY: 50, button: 2 });
    target.dispatchEvent(event);
    return event;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('the row menu, asked for on the row', () => {
    it('Shift+F10 on a row opens its menu there, named after it, and Escape gives the focus back', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        const row = selectOf(el, 'c2');
        row.focus();
        expect(key(row, 'F10', { shiftKey: true }).defaultPrevented).toBe(true);
        const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
        expect(menu.getAttribute('aria-label')).toBe('Two');
        expect(el.querySelector('[data-conv-id="c2"]')!.contains(menu), 'it sits in the row it is about').toBe(true);
        expect(document.activeElement).toBe(menu.querySelector('[data-menu-action="rename"]'));

        key(document.activeElement!, 'Escape');
        expect(el.querySelector('[role="menu"]'), 'and leaves the row when it closes').toBeNull();
        expect(document.activeElement).toBe(row);
    });

    it('a right click on a row opens it; off the rows the browser keeps its own menu', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        expect(rightClick(selectOf(el, 'c1')).defaultPrevented).toBe(true);
        expect(el.querySelector('[role="menu"]')!.getAttribute('aria-label')).toBe('One');

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        el.filter('nothing matches this');
        const line = el.querySelector('.aparte-conv-list-no-match')!;
        expect(rightClick(line).defaultPrevented).toBe(false);
        expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('a right click in a title being renamed leaves the browser its menu: copy, paste', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        el.querySelector<HTMLElement>('[data-menu-action="rename"]')!.click();
        const input = el.querySelector<HTMLElement>('[data-rename-id]')!;
        expect(rightClick(input).defaultPrevented).toBe(false);
        expect(el.querySelector('[role="menu"]')).toBeNull();
    });

    it('deletes from the menu a right click opened, after the same question', () => {
        const el = mount([{ id: 'c1', title: 'One' }, { id: 'c2', title: 'Two' }]);
        const deleted: unknown[] = [];
        el.addEventListener('aparte-conversation-delete', (e) => deleted.push(e.detail));
        rightClick(selectOf(el, 'c2'));
        el.querySelector<HTMLElement>('[data-menu-action="delete"]')!.click();
        expect(el.querySelector('[role="dialog"]'), 'it asks first').not.toBeNull();
        el.querySelector<HTMLElement>('[data-menu-action="confirm-delete"]')!.click();
        expect(deleted).toEqual([{ id: 'c2' }]);
        expect(el.querySelector('[role="dialog"], [role="menu"]')).toBeNull();
    });

    it('opens as a menu again after a question it was asking was cancelled', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const more = el.querySelector<HTMLElement>('.aparte-conv-item__more')!;
        more.click();
        el.querySelector<HTMLElement>('[data-menu-action="delete"]')!.click();
        el.querySelector<HTMLElement>('[data-menu-action="cancel"]')!.click();
        expect(document.activeElement).toBe(more);
        more.click();
        const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
        expect(menu.getAttribute('aria-label')).toBe('One');
        expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
    });
});

describe('the row menu, from the keyboard', () => {
    it('a letter moves to the item that starts with it', () => {
        vi.useFakeTimers();
        try {
            const el = mount([{ id: 'c1', title: 'One' }]);
            el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
            key(document.activeElement!, 'd');
            expect((document.activeElement as HTMLElement).dataset['menuAction']).toBe('delete');
            // A pause, or "da" is one word that no item starts with.
            vi.advanceTimersByTime(1000);
            key(document.activeElement!, 'a');
            expect((document.activeElement as HTMLElement).dataset['menuAction']).toBe('archive');
        } finally {
            vi.useRealTimers();
        }
    });

    it('ArrowDown on the ⋯ opens the menu on its first item', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const more = el.querySelector<HTMLElement>('.aparte-conv-item__more')!;
        more.focus();
        key(more, 'ArrowDown');
        expect(more.getAttribute('aria-expanded')).toBe('true');
        expect((document.activeElement as HTMLElement).dataset['menuAction']).toBe('rename');
    });

    it('the delete question keeps its arrows between its two answers', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        el.querySelector<HTMLElement>('[data-menu-action="delete"]')!.click();
        const answer = (): string | undefined => (document.activeElement as HTMLElement).dataset['menuAction'];
        expect(answer()).toBe('cancel');
        key(document.activeElement!, 'ArrowDown');
        expect(answer()).toBe('confirm-delete');
        key(document.activeElement!, 'ArrowDown');
        expect(answer(), 'and round').toBe('cancel');
        key(document.activeElement!, 'End');
        expect(answer()).toBe('confirm-delete');
    });

    it('keeps its menu\'s own event to itself: the page hears aparte-conversation-*', () => {
        const el = mount([{ id: 'c1', title: 'One' }]);
        const heard: string[] = [];
        document.addEventListener('aparte-menu-select', () => heard.push('menu'));
        el.addEventListener('aparte-conversation-pin', () => heard.push('pin'));
        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        el.querySelector<HTMLElement>('[data-menu-action="pin"]')!.click();
        expect(heard).toEqual(['pin']);
    });
});
