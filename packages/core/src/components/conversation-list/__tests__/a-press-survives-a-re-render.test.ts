// @vitest-environment jsdom
/**
 * A press survives the list re-rendering under it.
 *
 * The host re-assigns `conversations` whenever the manager changes — a save moves a row,
 * a select marks one active. A row replaced between `mousedown` and `mouseup` lost its
 * click: Chromium sent it to the list, where the delegated handler found no row, and
 * WebKit sent none. A conversation clicked while the list settled did not open. The list
 * now holds its render while a pointer is down on it, and draws once the click has landed.
 *
 * A synthetic `.click()` cannot show this; the press is dispatched the way a pointer does.
 * The browser half (that a real press lands) is `chat-site.spec.ts` in the e2e suite.
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
const ids = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId']);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const press = (target: HTMLElement, type: string) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));

describe('the conversation list under a press', () => {
    it('draws nothing under a pointer that is down, then draws once the click has landed', async () => {
        const now = Date.now();
        const a = { id: 'a', title: 'Weather', updatedAt: now - 2 * day };
        const b = { id: 'b', title: 'Lille', updatedAt: now - 3 * day };
        const el = mount([a, b]);
        const selected: string[] = [];
        el.addEventListener('aparte-conversation-select', (e) => selected.push((e as CustomEvent).detail.id));

        const pressed = button(el, 'b');
        press(pressed, 'pointerdown');
        press(pressed, 'mousedown');
        // The manager saved `b`: it moves to the top, into another date group.
        el.conversations = [{ ...b, updatedAt: now }, a];
        expect(pressed.isConnected, 'the pressed row was redrawn under the pointer').toBe(true);
        press(pressed, 'pointerup');
        press(pressed, 'mouseup');
        press(pressed, 'click');
        expect(selected).toEqual(['b']);

        await tick();
        expect(ids(el)).toEqual(['b', 'a']);
    });

    it('lets the render through when the press is cancelled', async () => {
        const el = mount([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]);
        press(button(el, 'a'), 'pointerdown');
        el.conversations = [{ id: 'b', title: 'Two' }];
        expect(ids(el)).toEqual(['a', 'b']);
        window.dispatchEvent(new Event('pointercancel'));
        await tick();
        expect(ids(el)).toEqual(['b']);
    });

    it('draws at once when nothing is pressed: the order, the title, the active mark', () => {
        const el = mount([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]);
        el.setAttribute('active-id', 'a');
        el.conversations = [{ id: 'b', title: 'Two' }, { id: 'a', title: 'One, renamed' }, { id: 'c', title: 'Three' }];
        expect(ids(el)).toEqual(['b', 'a', 'c']);
        expect(el.querySelector('[data-conv-id="a"] .aparte-conv-item__title')!.textContent).toBe('One, renamed');
        expect(button(el, 'a').getAttribute('aria-current')).toBe('page');
        expect(el.querySelector('[data-conv-id="a"]')!.classList.contains('aparte-conv-item--active')).toBe(true);
    });
});
