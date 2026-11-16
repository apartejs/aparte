// @vitest-environment jsdom
/**
 * A change of the config keeps what the reader has open in the list, and redraws it only for
 * what the list draws from the config: its words and its glyphs.
 *
 * Every mutation of the config sends `aparte-config-change` (a provider registered, a model
 * selected, a tool display), and the list drew itself again on each of them, unheld: a row menu
 * open under the pointer was detached, and a title being renamed was lost, when an app
 * registered its models a second after launch or again when a model loaded.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

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
const provider = (id: string) => ({ id, getMetadata: () => ({ id, name: id }), getModels: () => [{ id: 'm', name: 'M' }] }) as never;

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('a config change', () => {
    it('that the list does not draw from (a provider, a model) redraws nothing', () => {
        const el = mount([{ id: 'a', title: 'One' }]);
        const row = rowOf(el, 'a');
        aparteGlobalConfig.registerAIProvider(provider('local'));
        aparteGlobalConfig.setModelConfig({ defaultProvider: 'local', defaultModel: 'm' });
        expect(rowOf(el, 'a')).toBe(row);
    });

    it('keeps a row menu open, with the focus in it', () => {
        const el = mount([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]);
        const menu = openMenu(el, 'b');
        const focused = document.activeElement;

        aparteGlobalConfig.unregisterAIProvider('local');
        aparteGlobalConfig.registerAIProvider(provider('local'));

        expect(el.querySelector('[role="menu"]')).toBe(menu);
        expect(document.activeElement).toBe(focused);
    });

    it('in its words waits for the open menu, then draws them', () => {
        const el = mount([{ id: 'a', title: '' }, { id: 'b', title: 'Two' }]);
        const menu = openMenu(el, 'b');

        aparteGlobalConfig.extendLocale({ newChat: 'Sans titre' });
        expect(el.querySelector('[role="menu"]'), 'still open').toBe(menu);

        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(rowOf(el, 'a').textContent).toContain('Sans titre');
    });

    it('keeps a title being renamed, and what was typed', () => {
        const el = mount([{ id: 'a', title: 'One' }]);
        openMenu(el, 'a');
        el.querySelector<HTMLElement>('[data-menu-action="rename"]')!.click();
        const input = rowOf(el, 'a').querySelector<HTMLInputElement>('input.aparte-conv-item__input')!;
        input.value = 'Half typed';

        aparteGlobalConfig.extendLocale({ newChat: 'Sans titre' });

        expect(rowOf(el, 'a').querySelector('input')).toBe(input);
        expect(input.value).toBe('Half typed');
    });
});
