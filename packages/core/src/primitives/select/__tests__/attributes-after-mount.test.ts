// @vitest-environment jsdom
/**
 * The select honours its attributes AFTER mount, not only on the first render (UI
 * audit LOT 5).
 *
 * `placeholder` and `disabled` were both in `observedAttributes` and neither had a
 * branch in `attributeChangedCallback`: the callback fired and did nothing. So a
 * placeholder rewritten by a locale switch — the exact path `@aparte/plugin-model-selector`
 * takes, `setAttribute('placeholder', …)` on every re-render — left the visible label
 * AND the combobox's `aria-label` in the old language (the plugin's test asserted the
 * attribute alone, which is how it passed). And a select disabled after mount kept a
 * trigger with `tabindex="0"` and no `aria-disabled`: still in the tab order, still
 * announced as operable, only paler.
 *
 * `grouped` was observed and never read anywhere — `<aparte-optgroup>` children render
 * as groups without it — so it leaves `observedAttributes` and the documentation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteSelect } from '../aparte-select.js';
import '../aparte-option.js';
import '../aparte-optgroup.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { APARTE_DEFAULT_LOCALE } from '../../../config/locale.js';

const mounted: HTMLElement[] = [];

function mountSelect(attrs: Record<string, string>, options: string[] = ['a', 'b']): AparteSelect {
    const el = document.createElement('aparte-select') as AparteSelect;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    for (const value of options) {
        const opt = document.createElement('aparte-option');
        opt.setAttribute('value', value);
        opt.textContent = `Option ${value}`;
        el.appendChild(opt);
    }
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

const label = (el: HTMLElement) => el.querySelector('.aparte-select-label-text')?.textContent;
const trigger = (el: HTMLElement) => el.querySelector('.aparte-select-trigger') as HTMLElement;
const listbox = (el: HTMLElement) => el.querySelector('.aparte-select-options') as HTMLElement;

afterEach(() => { while (mounted.length) mounted.pop()!.remove(); });

describe('placeholder written after mount', () => {
    it('re-renders the visible label and the combobox name while nothing is selected', () => {
        const el = mountSelect({ placeholder: 'Pick a model' });
        expect(label(el)).toBe('Pick a model');

        el.setAttribute('placeholder', 'Choisir un modèle');

        expect(label(el)).toBe('Choisir un modèle');
        expect(trigger(el).getAttribute('aria-label')).toBe('Choisir un modèle');
        expect(listbox(el).getAttribute('aria-label')).toBe('Choisir un modèle');
    });

    it('renames the combobox but leaves a selected option label alone', () => {
        const el = mountSelect({ placeholder: 'Pick a model', value: 'b' });
        expect(label(el)).toBe('Option b');

        el.setAttribute('placeholder', 'Choisir un modèle');

        expect(label(el)).toBe('Option b');
        expect(trigger(el).getAttribute('aria-label')).toBe('Choisir un modèle');
    });

    it("yields to the host's own aria-label", () => {
        const el = mountSelect({ placeholder: 'Pick a model', 'aria-label': 'Model' });
        el.setAttribute('placeholder', 'Choisir un modèle');
        expect(trigger(el).getAttribute('aria-label')).toBe('Model');
    });
});

describe('disabled', () => {
    it('at mount: the trigger is out of the tab order and announced disabled', () => {
        const el = mountSelect({ placeholder: 'Pick', disabled: '' });
        expect(trigger(el).getAttribute('aria-disabled')).toBe('true');
        expect(trigger(el).getAttribute('tabindex')).toBe('-1');
    });

    it('toggled after mount: the trigger follows, both ways', () => {
        const el = mountSelect({ placeholder: 'Pick' });
        expect(trigger(el).getAttribute('tabindex')).toBe('0');
        expect(trigger(el).getAttribute('aria-disabled')).toBeNull();

        el.setAttribute('disabled', '');
        expect(trigger(el).getAttribute('aria-disabled')).toBe('true');
        expect(trigger(el).getAttribute('tabindex')).toBe('-1');

        el.removeAttribute('disabled');
        expect(trigger(el).getAttribute('aria-disabled')).toBeNull();
        expect(trigger(el).getAttribute('tabindex')).toBe('0');
    });
});

describe('grouped', () => {
    it('is not an attribute of the select: nothing read it', () => {
        expect(AparteSelect.observedAttributes).not.toContain('grouped');
    });
});

describe('an optgroup that is loading', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('says so in the locale — not "Fetching models...", which was English and the product\'s word', () => {
        const group = document.createElement('aparte-optgroup');
        group.setAttribute('label', 'Providers');
        group.setAttribute('loading', '');
        document.body.appendChild(group);
        mounted.push(group);
        expect(group.querySelector('.aparte-optgroup-loader')?.textContent?.trim()).toBe(APARTE_DEFAULT_LOCALE.loading);
        expect(APARTE_DEFAULT_LOCALE.loading).toBeTruthy();
    });

    it('reads the key from the active locale', () => {
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, loading: 'Chargement…' });
        const group = document.createElement('aparte-optgroup');
        group.setAttribute('loading', '');
        document.body.appendChild(group);
        mounted.push(group);
        expect(group.querySelector('.aparte-optgroup-loader')?.textContent?.trim()).toBe('Chargement…');
    });
});

/**
 * `open` is documented as reflecting AND controlling the dropdown, and it was the one
 * observed attribute with a branch of its own — a branch that showed the panel and
 * stopped there. It set `_isOpen` and unhid the dropdown, so the list appeared while
 * the combobox still announced `aria-expanded="false"`, no option was highlighted, the
 * arrow keys started from nowhere, and neither `aparte-select-open` nor
 * `aparte-select-close` fired. Closing the same way left the highlight behind.
 *
 * There is one open path and one close path; the attribute goes through them.
 */
describe('open written after mount, and at mount', () => {
    const dropdown = (el: HTMLElement) => el.querySelector('.aparte-select-dropdown') as HTMLElement;
    const active = (el: HTMLElement) => el.querySelectorAll('aparte-option[data-active]');

    it('takes the same path as a click', () => {
        const el = mountSelect({ placeholder: 'Pick' });
        let opens = 0;
        el.addEventListener('aparte-select-open', () => { opens++; });

        el.open = true;

        expect(el.open).toBe(true);
        expect(dropdown(el).hasAttribute('hidden')).toBe(false);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
        expect(active(el), 'the keyboard highlight is seeded on open').toHaveLength(1);
        expect(opens).toBe(1);
    });

    it('closes for real, highlight and announcement included', () => {
        const el = mountSelect({ placeholder: 'Pick' });
        trigger(el).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');

        let closes = 0;
        el.addEventListener('aparte-select-close', () => { closes++; });

        el.open = false;

        expect(el.open).toBe(false);
        expect(dropdown(el).hasAttribute('hidden')).toBe(true);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('false');
        expect(active(el)).toHaveLength(0);
        expect(trigger(el).hasAttribute('aria-activedescendant')).toBe(false);
        expect(closes).toBe(1);
    });

    it('mounts expanded when the attribute is there from the start', () => {
        const el = mountSelect({ placeholder: 'Pick', open: '' });
        expect(el.open).toBe(true);
        expect(dropdown(el).hasAttribute('hidden')).toBe(false);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
        expect(active(el)).toHaveLength(1);
    });

    it('fires open and close once per transition, whichever way it is driven', () => {
        const el = mountSelect({ placeholder: 'Pick' });
        let opens = 0;
        let closes = 0;
        el.addEventListener('aparte-select-open', () => { opens++; });
        el.addEventListener('aparte-select-close', () => { closes++; });

        el.open = true;
        el.setAttribute('open', '');       // already open: nothing happens
        trigger(el).dispatchEvent(new MouseEvent('click', { bubbles: true })); // closes
        el.removeAttribute('open');        // already closed: nothing happens

        expect([opens, closes]).toEqual([1, 1]);
    });

    /**
     * `connectedCallback` runs again on EVERY re-connect — a portal, a Vue teleport,
     * any framework re-parent, the bug class this file's own listeners document at
     * length. An element that never closed has no transition to replay: replaying it
     * fired a second `aparte-select-open` and re-seeded the highlight on the selected
     * option, throwing away where the arrow keys had got to.
     */
    it('a re-connect of an open select is not a new transition', () => {
        const el = mountSelect({ placeholder: 'Pick', open: '' });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        const wasActive = el.querySelector('aparte-option[data-active]');
        expect(wasActive?.getAttribute('value'), 'the arrow moved off the first option').toBe('b');

        let opens = 0;
        el.addEventListener('aparte-select-open', () => { opens++; });

        el.remove();
        document.body.appendChild(el);

        expect(opens, 'the dropdown never closed, so it never re-opened').toBe(0);
        expect(el.open).toBe(true);
        expect(dropdown(el).hasAttribute('hidden')).toBe(false);
        expect(el.querySelector('aparte-option[data-active]')?.getAttribute('value'),
            'the keyboard position survives the move').toBe('b');
    });

    it('a disabled select does not open', () => {
        const el = mountSelect({ placeholder: 'Pick', disabled: '' });
        el.open = true;
        expect(el.open).toBe(false);
        expect(dropdown(el).hasAttribute('hidden')).toBe(true);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('false');
    });

    /**
     * ...and it leaves the attribute alone. `open` is the CONSUMER's: a one-way
     * binding writes it once and never again, so an element that takes it back leaves
     * the template saying open and itself saying closed, with no write left to
     * reconcile them — `<aparte-select [disabled]="true" [open]="true">` in the
     * Angular wrapper's own spec was exactly that. The attribute stands, and the
     * dropdown honours it the moment the select becomes operable.
     */
    it('keeps the `open` its caller wrote, and honours it once enabled', () => {
        const el = mountSelect({ placeholder: 'Pick', disabled: '', open: '' });
        expect(el.open).toBe(false);
        expect(el.hasAttribute('open'), "the caller's attribute is not ours to remove").toBe(true);
        expect(dropdown(el).hasAttribute('hidden')).toBe(true);

        let opens = 0;
        el.addEventListener('aparte-select-open', () => { opens++; });

        el.removeAttribute('disabled');

        expect(el.open).toBe(true);
        expect(dropdown(el).hasAttribute('hidden')).toBe(false);
        expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
        expect(active(el), 'the keyboard highlight is seeded, as on any other open').toHaveLength(1);
        expect(opens).toBe(1);
    });

    it('enabling a select that was never asked to open leaves it closed', () => {
        const el = mountSelect({ placeholder: 'Pick', disabled: '' });
        el.removeAttribute('disabled');
        expect(el.open).toBe(false);
        expect(dropdown(el).hasAttribute('hidden')).toBe(true);
    });
});
