// @vitest-environment jsdom
/**
 * Every presence setter core exposes treats `''` as ON (#62, generalised in the UI
 * audit's LOT 5).
 *
 * The generated attribute types map a presence attribute to `'' | null | undefined`,
 * because React and Vue stringify what they set on a custom element. Svelte 5 does
 * not take the attribute path: it assigns the PROPERTY whenever the element has one,
 * so every accessor-backed presence attribute received `''`, and a setter written as
 * `if (val) setAttribute … else removeAttribute` read the empty string as falsy and
 * REMOVED the attribute — the opposite of what the template asked for, with nothing
 * logged (measured on `aparte-split single` in Svelte 5.57).
 *
 * The fix landed on the split and the sidebar, and the same spelling was still in the
 * select primitives — five more setters, one of them (`selected`) the very thing a
 * Svelte template writes on an option. So this test enumerates ALL of them: one
 * spelling across both paths, on a presence property an empty string means ON,
 * exactly as an empty attribute does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../components/split/aparte-split.js';
import '../components/sidebar/aparte-sidebar.js';
import '../primitives/select/aparte-select.js';
import '../primitives/select/aparte-option.js';
import '../primitives/select/aparte-optgroup.js';

beforeEach(() => {
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => { document.body.innerHTML = ''; });

// What Svelte 5 actually assigns for `single={''}` — typed as the attr value on purpose.
const EMPTY = '' as unknown as boolean;

/** Every accessor-backed presence attribute in core: element → setter names. */
const PRESENCE_SETTERS: Array<[tag: string, setters: string[], setup?: (el: HTMLElement) => void]> = [
    ['aparte-split', ['single', 'collapsed', 'disabled'], (el) => { el.innerHTML = '<div slot="start">a</div><div slot="end">b</div>'; }],
    ['aparte-sidebar', ['collapsed']],
    ['aparte-select', ['open']],
    ['aparte-option', ['disabled', 'selected']],
    ['aparte-optgroup', ['collapsed', 'loading']],
];

async function mount(tag: string, setup?: (el: HTMLElement) => void): Promise<HTMLElement> {
    const el = document.createElement(tag);
    setup?.(el);
    document.body.appendChild(el);
    await Promise.resolve();
    return el;
}

describe('presence setters accept the attribute spelling (#62)', () => {
    it('covers every presence setter core exposes', () => {
        expect(PRESENCE_SETTERS.flatMap(([, s]) => s).length).toBe(9);
    });

    for (const [tag, setters, setup] of PRESENCE_SETTERS) {
        for (const name of setters) {
            it(`${tag}.${name}: '' sets the attribute, false/undefined remove it, true sets it`, async () => {
                const el = await mount(tag, setup) as HTMLElement & Record<string, boolean>;
                el[name] = EMPTY;
                expect(el.hasAttribute(name), `${tag}.${name} = '' must SET the attribute`).toBe(true);
                el[name] = false;
                expect(el.hasAttribute(name), `${tag}.${name} = false must remove it`).toBe(false);
                el[name] = true;
                expect(el.hasAttribute(name), `${tag}.${name} = true must set it`).toBe(true);
                el[name] = undefined as unknown as boolean;
                expect(el.hasAttribute(name), `${tag}.${name} = undefined must remove it`).toBe(false);
            });
        }
    }
});
