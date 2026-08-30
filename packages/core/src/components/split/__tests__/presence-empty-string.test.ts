// @vitest-environment jsdom
/**
 * A presence setter treats `''` as ON (#62).
 *
 * The generated attribute types map a presence attribute to `'' | null | undefined`,
 * because React and Vue stringify what they set on a custom element. Svelte 5 does
 * not take the attribute path: it assigns the PROPERTY whenever the element has one,
 * so every accessor-backed presence attribute received `''`, `toggleAttribute` read
 * the empty string as falsy, and the attribute was REMOVED — the opposite of what the
 * template asked for, with nothing logged (measured on `aparte-split single` in
 * Svelte 5.57).
 *
 * The fix keeps one spelling across both paths: on a presence property, an empty
 * string means ON, exactly as an empty attribute does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-split.js';
import type { AparteSplit } from '../aparte-split.js';
import '../../sidebar/aparte-sidebar.js';
import type { AparteSidebar } from '../../sidebar/aparte-sidebar.js';

beforeEach(() => {
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => { document.body.innerHTML = ''; });

async function mountSplit(): Promise<AparteSplit> {
    const el = document.createElement('aparte-split') as AparteSplit;
    el.innerHTML = '<div slot="start">a</div><div slot="end">b</div>';
    document.body.appendChild(el);
    await Promise.resolve();
    return el;
}

// What Svelte 5 actually assigns for `single={''}` — typed as the attr value on purpose.
const EMPTY = '' as unknown as boolean;

describe('presence setters accept the attribute spelling (#62)', () => {
    it('split: single/collapsed/disabled — the empty string is ON', async () => {
        const el = await mountSplit();
        for (const name of ['single', 'collapsed', 'disabled'] as const) {
            el[name] = EMPTY;
            expect(el.hasAttribute(name), `${name} = '' must SET the attribute`).toBe(true);
            el[name] = false;
            expect(el.hasAttribute(name), `${name} = false must remove it`).toBe(false);
            el[name] = true;
            expect(el.hasAttribute(name), `${name} = true must set it`).toBe(true);
            el[name] = undefined as unknown as boolean;
            expect(el.hasAttribute(name), `${name} = undefined must remove it`).toBe(false);
        }
    });

    it('sidebar: collapsed — the empty string is ON', async () => {
        const el = document.createElement('aparte-sidebar') as AparteSidebar;
        document.body.appendChild(el);
        await Promise.resolve();
        el.collapsed = EMPTY;
        expect(el.hasAttribute('collapsed')).toBe(true);
        el.collapsed = false;
        expect(el.hasAttribute('collapsed')).toBe(false);
    });
});
