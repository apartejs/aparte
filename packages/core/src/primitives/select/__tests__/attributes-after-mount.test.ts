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
