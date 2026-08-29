// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { APARTE_DEFAULT_LOCALE } from '../../../config/locale.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[] };

function mount(items: AparteConversationListItem[], attrs: Record<string, string> = {}): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    el.conversations = items;
    return el;
}

const DAY = 864e5;
const now = Date.now();
/** Noon today, so "yesterday minus a few hours" never crosses a midnight. */
const noon = (() => { const d = new Date(now); d.setHours(12, 0, 0, 0); return d.getTime(); })();

const headings = (el: ListEl): string[] =>
    Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group__label')).map((h) => h.textContent!.trim());
const rowsUnder = (el: ListEl, heading: string): string[] => {
    const group = Array.from(el.querySelectorAll<HTMLElement>('.aparte-conv-group'))
        .find((g) => g.querySelector('.aparte-conv-group__label')?.textContent?.trim() === heading)!;
    return Array.from(group.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId']!);
};

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('aparte-conversation-list — date groups', () => {
    it('groups by updatedAt: pinned, today, yesterday, the week, the month, then months', () => {
        const old = new Date(noon - 100 * DAY);
        const el = mount([
            { id: 'today', title: 't', updatedAt: noon },
            { id: 'pinned', title: 'p', updatedAt: noon - 50 * DAY, pinnedAt: 1 },
            { id: 'yesterday', title: 'y', updatedAt: noon - DAY },
            { id: 'week', title: 'w', updatedAt: noon - 5 * DAY },
            { id: 'month', title: 'm', updatedAt: noon - 20 * DAY },
            { id: 'older', title: 'o', updatedAt: old.getTime() },
        ]);

        const sameYear = old.getFullYear() === new Date(now).getFullYear();
        const raw = new Intl.DateTimeFormat(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(old);
        const monthLabel = raw.charAt(0).toLocaleUpperCase() + raw.slice(1);

        expect(headings(el)).toEqual(['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', monthLabel]);
        expect(rowsUnder(el, 'Pinned')).toEqual(['pinned']);
        expect(rowsUnder(el, 'Today')).toEqual(['today']);
        expect(rowsUnder(el, monthLabel)).toEqual(['older']);
        // A heading is a group landmark for assistive technology, and hidden as text
        // so it is not read twice.
        const group = el.querySelector('.aparte-conv-group[role="group"]')!;
        expect(group.getAttribute('aria-label')).toBe('Pinned');
    });

    it('keeps the host\'s order inside a group', () => {
        const el = mount([
            { id: 'b', title: 'b', updatedAt: noon - 1000 },
            { id: 'a', title: 'a', updatedAt: noon },
        ]);
        expect(rowsUnder(el, 'Today')).toEqual(['b', 'a']);
    });

    it('renders flat when nothing carries updatedAt, and puts undated rows last otherwise', () => {
        const flat = mount([{ id: 'a', title: 'a' }, { id: 'b', title: 'b' }]);
        expect(headings(flat)).toEqual([]);
        expect(flat.querySelectorAll('[data-conv-id]').length).toBe(2);

        const mixed = mount([{ id: 'undated', title: 'u' }, { id: 'today', title: 't', updatedAt: noon }]);
        const ids = Array.from(mixed.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId']);
        expect(ids).toEqual(['today', 'undated']);
        expect(headings(mixed)).toEqual(['Today']);
    });

    it('no-groups renders flat in host order, and toggling it re-renders', () => {
        const el = mount([
            { id: 'old', title: 'o', updatedAt: noon - 40 * DAY },
            { id: 'today', title: 't', updatedAt: noon },
        ], { 'no-groups': '' });
        expect(headings(el)).toEqual([]);
        expect(Array.from(el.querySelectorAll<HTMLElement>('[data-conv-id]')).map((r) => r.dataset['convId'])).toEqual(['old', 'today']);

        el.removeAttribute('no-groups');
        expect(headings(el).length).toBeGreaterThan(0);
    });

    it('the headings follow the locale, month names included', () => {
        const old = new Date(noon - 100 * DAY);
        const el = mount([
            { id: 'today', title: 't', updatedAt: noon },
            { id: 'older', title: 'o', updatedAt: old.getTime() },
        ]);
        aparteGlobalConfig.setLocale({
            ...APARTE_DEFAULT_LOCALE,
            tag: 'fr-FR',
            conversationGroupToday: "Aujourd'hui",
        });

        const sameYear = old.getFullYear() === new Date(now).getFullYear();
        const raw = new Intl.DateTimeFormat('fr-FR', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(old);
        const monthLabel = raw.charAt(0).toLocaleUpperCase('fr-FR') + raw.slice(1);

        expect(headings(el)).toEqual(["Aujourd'hui", monthLabel]);
        expect(monthLabel.charAt(0), 'a French month name is lower-case; a heading is not').toBe(monthLabel.charAt(0).toUpperCase());
    });

    it('a pinned row is marked, and its selection still patches in place', () => {
        const el = mount([{ id: 'p', title: 'p', updatedAt: noon, pinnedAt: 1 }, { id: 'q', title: 'q', updatedAt: noon }]);
        expect(el.querySelector('[data-conv-id="p"]')!.classList.contains('aparte-conv-item--pinned')).toBe(true);

        el.setAttribute('active-id', 'q');
        expect(el.querySelector('[data-conv-id="q"]')!.classList.contains('aparte-conv-item--active')).toBe(true);
        expect(el.querySelector('[data-conv-id="q"] [data-select-id]')!.getAttribute('aria-current')).toBe('page');
        expect(el.querySelector('[data-conv-id="p"] [data-select-id]')!.getAttribute('aria-current')).toBe('false');
    });
});
