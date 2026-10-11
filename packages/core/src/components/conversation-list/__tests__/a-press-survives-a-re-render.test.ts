// @vitest-environment jsdom
/**
 * A press survives the list re-rendering under it.
 *
 * The host re-assigns `conversations` whenever the manager changes — a save moves a row,
 * a select marks one active. The list used to rebuild every row with `innerHTML`, so a
 * row replaced between `mousedown` and `mouseup` had its `click` retargeted by the
 * browser to the list itself, where the delegated handler found no row and dropped it.
 * WebKit showed it: a conversation clicked while the list settled did not open. Rows are
 * reconciled by id now — the pressed button stays the same node, moved if its row moved.
 *
 * A synthetic `.click()` cannot show this; the press is dispatched the way a pointer does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

const day = 24 * 60 * 60 * 1000;
function mount(items: AparteConversationListItem[]): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}
afterEach(() => { document.body.innerHTML = ''; });

const button = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-select-id="${id}"]`)!;

describe('the conversation list under a press', () => {
    it('keeps the pressed row the same node through a re-render, so its click lands', async () => {
        const now = Date.now();
        const a = { id: 'a', title: 'Weather', updatedAt: now - 2 * day };
        const b = { id: 'b', title: 'Lille', updatedAt: now - 3 * day };
        const el = mount([a, b]);
        const selected: string[] = [];
        el.addEventListener('aparte-conversation-select', (e) => selected.push((e as CustomEvent).detail.id));

        const pressed = button(el, 'b');
        pressed.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        // The manager saved `b`: it moves to the top, into another date group.
        el.conversations = [{ ...b, updatedAt: now }, a];
        pressed.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        pressed.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(pressed.isConnected).toBe(true);
        expect(button(el, 'b')).toBe(pressed);
        expect(selected).toEqual(['b']);
    });

    it('still draws what changed: the order, the title, the active mark', () => {
        const el = mount([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]);
        const rowA = el.querySelector('[data-conv-id="a"]');
        el.setAttribute('active-id', 'a');
        el.conversations = [{ id: 'b', title: 'Two' }, { id: 'a', title: 'One, renamed' }, { id: 'c', title: 'Three' }];
        const ids = Array.from(el.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId']);
        expect(ids).toEqual(['b', 'a', 'c']);
        expect(el.querySelector('[data-conv-id="a"]')).toBe(rowA);
        expect(el.querySelector('[data-conv-id="a"] .aparte-conv-item__title')!.textContent).toBe('One, renamed');
        expect(button(el, 'a').getAttribute('aria-current')).toBe('page');
        expect(el.querySelector('[data-conv-id="a"]')!.classList.contains('aparte-conv-item--active')).toBe(true);

        el.conversations = [{ id: 'c', title: 'Three' }];
        expect(Array.from(el.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId'])).toEqual(['c']);
    });
});
