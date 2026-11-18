// @vitest-environment jsdom
/**
 * The icon set, reachable from markup.
 *
 * Core shipped 25 glyphs and `setIconProvider` as the lever that swaps them, and the only
 * door in was `getIcon(name)` — JavaScript. So a consumer writing plain HTML could not
 * place one, and the provider they registered could not reach a single icon in their own
 * templates. `<aparte-composer-action>`'s documentation tells you to put an `<svg>` inside
 * it, which is that gap written as an instruction.
 *
 * These assert the two halves that make the element worth having: it draws the REAL glyph
 * (not a copy), and it follows the provider — including one registered after it mounted,
 * which is the case a naive implementation gets wrong.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import '../aparte-icon.js';
import { aparteGlobalConfig, AparteConfig } from '../../../config/index.js';
import { attachConfig } from '../../../config/config-context.js';

function icon(name?: string): HTMLElement {
    const el = document.createElement('aparte-icon');
    if (name !== undefined) el.setAttribute('name', name);
    document.body.appendChild(el);
    return el;
}

beforeAll(async () => {
    await customElements.whenDefined('aparte-icon');
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('<aparte-icon>', () => {
    it('draws the named glyph', () => {
        expect(icon('copy').querySelector('svg')).not.toBeNull();
    });

    it('draws a DIFFERENT glyph for a different name', () => {
        expect(icon('copy').innerHTML).not.toBe(icon('check').innerHTML);
    });

    it('follows the icon provider, which is the whole point', () => {
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="yes"></svg>' });
        expect(icon('copy').innerHTML).toContain('data-mine="yes"');
    });

    it('follows a provider registered AFTER it mounted', () => {
        const el = icon('copy');
        const before = el.innerHTML;
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-late="yes"></svg>' });
        expect(el.innerHTML).not.toBe(before);
        expect(el.innerHTML).toContain('data-late="yes"');
    });

    it('redraws when the name changes', () => {
        const el = icon('copy');
        const first = el.innerHTML;
        el.setAttribute('name', 'check');
        expect(el.innerHTML).not.toBe(first);
    });

    it('draws NOTHING for an unknown name, rather than the word undefined', () => {
        // A misspelling leaves a gap the author can see. Printing `undefined` inside a
        // button would read as a fault in the library instead of a typo in the markup.
        expect(icon('nosuchglyph').innerHTML).toBe('');
        expect(icon().innerHTML).toBe('');
    });

    it('marks the glyph decorative, because the control carries the name', () => {
        expect(icon('copy').querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('replaces its children rather than appending to them', () => {
        const el = icon('copy');
        el.setAttribute('name', 'check');
        expect(el.querySelectorAll('svg')).toHaveLength(1);
    });
});

/*
 * The gap alone went unnoticed: a host wrote `plus` and `panel`, names that exist only in
 * `@aparte/core/icons` until registered, and found the empty squares on screenshots. Each
 * case uses a name of its own, because a name is reported once per page.
 */
describe('<aparte-icon> with a name nothing draws', () => {
    let warn: MockInstance<typeof console.warn>;
    beforeEach(() => {
        vi.useFakeTimers();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        warn.mockRestore();
    });
    const warnings = () => warn.mock.calls.map((call) => String(call[0]));

    it('says so in the console, naming the name and how to register it', () => {
        icon('plus');
        vi.runAllTimers();
        expect(warnings()).toHaveLength(1);
        expect(warnings()[0]).toContain('name="plus"');
        expect(warnings()[0]).toContain('registerIcons');
    });

    it('says it once for a hundred rows', () => {
        for (let i = 0; i < 100; i++) icon('panel');
        vi.runAllTimers();
        expect(warnings()).toHaveLength(1);
    });

    it('says nothing for a name core draws', () => {
        icon('copy');
        icon('nextBranch');
        vi.runAllTimers();
        expect(warnings()).toEqual([]);
    });

    it('says nothing when the name is registered right after the element mounted', () => {
        const el = icon('folderLate');
        aparteGlobalConfig.registerIcons({ folderLate: () => '<svg data-late="yes"></svg>' });
        vi.runAllTimers();
        expect(el.innerHTML).toContain('data-late="yes"');
        expect(warnings()).toEqual([]);
    });

    it('says nothing for a name a chat\'s own config draws', () => {
        const chat = document.createElement('div');
        const config = new AparteConfig();
        config.registerIcons({ chatOnly: () => '<svg data-chat="yes"></svg>' });
        attachConfig(chat, config);
        document.body.appendChild(chat);
        const el = document.createElement('aparte-icon');
        el.setAttribute('name', 'chatOnly');
        chat.appendChild(el);
        vi.runAllTimers();
        expect(el.innerHTML).toContain('data-chat="yes"');
        expect(warnings()).toEqual([]);
    });
});
