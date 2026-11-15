// @vitest-environment jsdom
/**
 * `collapsed="rail"` folds the column to an icon rail instead of nothing: the sidebar
 * stays in the flow and stays usable, so it must NOT take the `inert` / `aria-hidden`
 * a fully folded column takes. jsdom has no layout; the width itself is CSS.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-sidebar.js';
import type { AparteSidebar, AparteSidebarToggleDetail } from '../aparte-sidebar.js';

let narrow = false;
beforeEach(() => {
    narrow = false;
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        get matches() { return narrow; },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    });
});
afterEach(() => { document.body.innerHTML = ''; });

function mount(attr?: string): AparteSidebar {
    const el = document.createElement('aparte-sidebar') as AparteSidebar;
    if (attr !== undefined) el.setAttribute('collapsed', attr);
    el.innerHTML = '<button data-rail class="in">in</button>';
    document.body.appendChild(el);
    return el;
}

describe('aparte-sidebar — collapsed="rail"', () => {
    it('is collapsed but stays reachable: no inert, no aria-hidden', () => {
        const el = mount('rail');
        expect(el.collapsed).toBe(true);
        expect(el.hasAttribute('inert')).toBe(false);
        expect(el.hasAttribute('aria-hidden')).toBe(false);
    });

    it('a plain collapsed still folds to nothing and goes inert', () => {
        const el = mount('');
        expect(el.hasAttribute('inert')).toBe(true);
        expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('goes from a rail to fully folded, and back, taking and leaving inert with it', () => {
        const el = mount('rail');
        el.setAttribute('collapsed', '');
        expect(el.hasAttribute('inert')).toBe(true);
        el.setAttribute('collapsed', 'rail');
        expect(el.hasAttribute('inert')).toBe(false);
        expect(el.hasAttribute('aria-hidden')).toBe(false);
    });

    it('opening a rail removes the attribute and says so once', () => {
        const el = mount('rail');
        const events: AparteSidebarToggleDetail[] = [];
        el.addEventListener('aparte-sidebar-toggle', (e) => events.push((e as CustomEvent<AparteSidebarToggleDetail>).detail));
        el.open();
        expect(el.hasAttribute('collapsed')).toBe(false);
        expect(events).toEqual([{ collapsed: false, drawer: false }]);
    });

    it('as a drawer, a rail has no meaning: closed is closed, so it is inert', () => {
        narrow = true;
        const el = mount('rail');
        expect(el.hasAttribute('inert')).toBe(true);
    });
});
