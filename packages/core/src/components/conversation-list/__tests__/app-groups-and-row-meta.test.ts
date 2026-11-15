// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & {
    conversations: AparteConversationListItem[];
    renderMeta: ((item: AparteConversationListItem) => HTMLElement | string | null) | null;
    filter(query: string): number;
};

function mount(items: AparteConversationListItem[], attrs: Record<string, string> = {}): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

const headings = (el: ListEl): string[] =>
    Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group__label')).map((h) => h.textContent!.trim());
const rowsUnder = (el: ListEl, heading: string): string[] => {
    const group = Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group'))
        .find((g) => g.querySelector('.aparte-conv-group__label')?.textContent?.trim() === heading)!;
    return Array.from(group.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId']!);
};

describe('aparte-conversation-list — an item names its own group', () => {
    it('groups by `group`, in order of first appearance, with no date on any item', () => {
        const el = mount([
            { id: 'a', title: 'a', group: { key: 'proj-2', label: 'Beta project' } },
            { id: 'b', title: 'b', group: { key: 'proj-1', label: 'Alpha project' } },
            { id: 'c', title: 'c', group: { key: 'proj-2', label: 'Beta project' } },
        ]);
        expect(headings(el)).toEqual(['Beta project', 'Alpha project']);
        expect(rowsUnder(el, 'Beta project')).toEqual(['a', 'c']);
    });

    it('wins over the date and over pinning, which still sort the items without one', () => {
        const el = mount([
            { id: 'p', title: 'p', updatedAt: Date.now(), pinnedAt: 1, group: { key: 'g', label: 'Mine' } },
            { id: 'd', title: 'd', updatedAt: Date.now() },
        ]);
        expect(headings(el)).toEqual(['Mine', 'Today']);
        expect(rowsUnder(el, 'Mine')).toEqual(['p']);
    });

    it('stays flat under `flat`', () => {
        const el = mount([{ id: 'a', title: 'a', group: { key: 'g', label: 'Mine' } }], { flat: '' });
        expect(headings(el)).toEqual([]);
    });

    it('the search hides a group whose rows all miss, and shows it again', () => {
        const el = mount([
            { id: 'a', title: 'Alpha', group: { key: 'g1', label: 'One' } },
            { id: 'b', title: 'Beta', group: { key: 'g2', label: 'Two' } },
        ]);
        expect(el.filter('alp')).toBe(1);
        const groups = Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group'));
        expect(groups.map((g) => g.hidden)).toEqual([false, true]);
        el.filter('');
        expect(groups.map((g) => g.hidden)).toEqual([false, false]);
    });
});

describe('aparte-conversation-list — renderMeta', () => {
    it('draws the hook\'s element after the title button, as a sibling the row\'s own buttons do not hold', () => {
        const el = mount([{ id: 'a', title: 'Alpha' }]);
        el.renderMeta = () => {
            const b = document.createElement('button');
            b.setAttribute('aria-label', 'Shared with the team');
            return b;
        };
        const row = el.querySelector('[data-conv-id="a"]')!;
        const meta = row.querySelector('.aparte-conv-item__meta')!;
        expect(meta.querySelector('button')?.getAttribute('aria-label')).toBe('Shared with the team');
        const select = row.querySelector('.aparte-conv-item__select')!;
        expect(select.contains(meta), 'a button cannot hold another').toBe(false);
        expect(select.nextElementSibling).toBe(meta);
    });

    it('a string is text, never markup, and null draws nothing', () => {
        const el = mount([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
        el.renderMeta = (item) => (item.id === 'a' ? '<b>2</b>' : null);
        expect(el.querySelector('[data-conv-id="a"] .aparte-conv-item__meta')?.textContent).toBe('<b>2</b>');
        expect(el.querySelector('[data-conv-id="a"] .aparte-conv-item__meta b')).toBeNull();
        expect(el.querySelector('[data-conv-id="b"] .aparte-conv-item__meta')).toBeNull();
    });

    it('is drawn again on the next render and cleared when unset', () => {
        const el = mount([{ id: 'a', title: 'A' }]);
        el.renderMeta = () => 'x';
        el.conversations = [{ id: 'a', title: 'A' }, { id: 'c', title: 'C' }];
        expect(el.querySelectorAll('.aparte-conv-item__meta').length).toBe(2);
        el.renderMeta = null;
        expect(el.querySelectorAll('.aparte-conv-item__meta').length).toBe(0);
    });

    it('the meta does not count in the title the search reads', () => {
        const el = mount([{ id: 'a', title: 'Alpha' }]);
        el.renderMeta = () => 'zebra';
        expect(el.filter('zebra')).toBe(0);
    });
});
