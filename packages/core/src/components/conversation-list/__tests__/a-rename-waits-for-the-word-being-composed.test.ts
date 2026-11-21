// @vitest-environment jsdom
/**
 * A title being renamed with an input method (Japanese, Chinese, Korean) keeps the Enter and the
 * Escape that belong to the word being composed.
 *
 * Enter confirms a candidate ("かいぎ" to "会議") and Escape cancels a composition: neither is the
 * rename's. Firefox sends that Enter with `isComposing`, Safari after `compositionend` with
 * keyCode 229. The list took them for its own: Enter committed the title half converted, in the
 * middle of the word, and Escape threw the rename away. The composer already guards its Enter so.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

afterEach(() => { document.body.innerHTML = ''; });

function renaming(): { el: ListEl; input: HTMLInputElement; renamed: string[] } {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    el.conversations = [{ id: 'c1', title: 'One' }];
    const renamed: string[] = [];
    el.addEventListener('aparte-conversation-rename', (e) => renamed.push((e as CustomEvent<{ title: string }>).detail.title));
    el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
    el.querySelector<HTMLElement>('[data-menu-action="rename"]')!.click();
    const input = el.querySelector<HTMLInputElement>('[data-rename-id]')!;
    input.value = 'かいぎ';
    return { el, input, renamed };
}

const press = (target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};

describe('a rename typed with an input method', () => {
    it('the Enter that confirms a candidate (isComposing, as Firefox sends it) commits nothing', () => {
        const { el, input, renamed } = renaming();
        expect(press(input, 'Enter', { isComposing: true }).defaultPrevented).toBe(false);
        expect(el.querySelector('[data-rename-id]')).toBe(input);
        expect(renamed).toEqual([]);
    });

    it('nor the one Safari sends after the composition ends, with keyCode 229', () => {
        const { el, input, renamed } = renaming();
        press(input, 'Enter', { keyCode: 229 });
        expect(el.querySelector('[data-rename-id]')).toBe(input);
        expect(renamed).toEqual([]);
    });

    it('the Escape that cancels a composition keeps the rename going', () => {
        const { el, input } = renaming();
        press(input, 'Escape', { isComposing: true });
        expect(el.querySelector('[data-rename-id]')).toBe(input);
    });

    it('and the next Enter, the word done, commits the title', () => {
        const { input, renamed } = renaming();
        input.value = '会議';
        press(input, 'Enter');
        expect(renamed).toEqual(['会議']);
    });
});
