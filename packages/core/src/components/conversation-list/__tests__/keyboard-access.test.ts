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

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-conversation-list — archive/delete keyboard reachability (WCAG 2.1.1)', () => {
    it('renders the archive and delete actions with tabindex 0 (focusable)', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const archive = el.querySelector<HTMLElement>('.aparte-conv-item__archive');
        const del = el.querySelector<HTMLElement>('.aparte-conv-item__delete');
        expect(archive).not.toBeNull();
        expect(del).not.toBeNull();
        expect(archive!.tabIndex).toBe(0); // was -1 → unreachable by keyboard
        expect(del!.tabIndex).toBe(0);
    });
    /*
     * Focusable is not operable, and the test above only ever proved the first half.
     *
     * The row is a `role="button"` div, so the component supplies Enter/Space for it. That
     * handler climbed to `closest('[data-conv-id]')` from whatever was focused, so pressing
     * Enter on Archive or Delete found the ROW, cancelled the button's own activation with
     * preventDefault() and clicked the row. The keyboard could reach both controls and then
     * did the wrong thing with them: every press selected the conversation.
     *
     * jsdom does not implement a button's native Enter/Space activation, so what these can
     * prove is the half that was broken — the component no longer intercepts. That the
     * browser then activates the button is the browser's contract, not ours.
     */
    it('does not hijack Enter on the archive button', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const selected: string[] = [];
        el.addEventListener('aparte-select-conversation', (e) => selected.push((e as CustomEvent).detail.id));

        const archive = el.querySelector<HTMLElement>('.aparte-conv-item__archive')!;
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        archive.dispatchEvent(event);

        expect(selected, 'archiving must not select the conversation').toEqual([]);
        expect(event.defaultPrevented, 'the button keeps its own activation').toBe(false);
    });

    it('does not hijack Space on the delete button', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const selected: string[] = [];
        el.addEventListener('aparte-select-conversation', (e) => selected.push((e as CustomEvent).detail.id));

        const del = el.querySelector<HTMLElement>('.aparte-conv-item__delete')!;
        const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        del.dispatchEvent(event);

        expect(selected, 'deleting must not select the conversation').toEqual([]);
        expect(event.defaultPrevented, 'the button keeps its own activation').toBe(false);
    });

    it('still activates the ROW on Enter, which is the key it has no native handling for', () => {
        const el = mount([{ id: 'c1', title: 'Hello' }]);
        const selected: string[] = [];
        el.addEventListener('aparte-select-conversation', (e) => selected.push((e as CustomEvent).detail.id));

        const row = el.querySelector<HTMLElement>('[data-conv-id]')!;
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        row.dispatchEvent(event);

        expect(selected, 'the row is the element that needs synthetic activation').toEqual(['c1']);
        expect(event.defaultPrevented, 'and Space must not scroll the page').toBe(true);
    });
});
