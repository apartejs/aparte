// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { AparteSelect } from '../aparte-select.js';

// Keyboard navigation (APG combobox/listbox): once open, ArrowUp/Down move a
// roving highlight, Home/End jump to the ends, Enter selects, Escape cancels.
// Regression guard for the audit finding "aria roles present but no arrow
// navigation once open".

const mounted: HTMLElement[] = [];

function mountSelect(values: Array<{ value: string; disabled?: boolean }>): AparteSelect {
    const el = document.createElement('aparte-select');
    el.setAttribute('placeholder', 'Pick');
    for (const v of values) {
        const opt = document.createElement('aparte-option');
        opt.setAttribute('value', v.value);
        if (v.disabled) opt.setAttribute('disabled', '');
        opt.textContent = v.value;
        el.appendChild(opt);
    }
    document.body.appendChild(el);
    mounted.push(el);
    // jsdom upgrades custom elements lazily; touching the prototype chain forces
    // the upgrade + connectedCallback so the trigger is rendered before we query
    // it (querySelector/outerHTML alone don't trigger the flush).
    if (!(el instanceof AparteSelect)) {
        throw new Error('aparte-select did not upgrade in the test environment');
    }
    return el as AparteSelect;
}

function openViaTrigger(el: AparteSelect): void {
    el.querySelector('.aparte-select-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function key(k: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

afterEach(() => {
    while (mounted.length) mounted.pop()!.remove();
});

describe('AparteSelect — keyboard navigation', () => {
    it('seeds the highlight on the first option when opened with no selection', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }, { value: 'three' }]);
        openViaTrigger(el);
        expect(el.open).toBe(true);
        const opts = el.querySelectorAll('aparte-option');
        expect(opts[0].hasAttribute('data-active')).toBe(true);
        expect(el.querySelector('.aparte-select-trigger')!.getAttribute('aria-activedescendant')).toBe(opts[0].id);
    });

    it('ArrowDown/ArrowUp move the active option and update aria-activedescendant', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }, { value: 'three' }]);
        openViaTrigger(el);
        const opts = el.querySelectorAll('aparte-option');
        const trigger = el.querySelector('.aparte-select-trigger')!;

        key('ArrowDown');
        expect(opts[1].hasAttribute('data-active')).toBe(true);
        expect(opts[0].hasAttribute('data-active')).toBe(false);
        expect(trigger.getAttribute('aria-activedescendant')).toBe(opts[1].id);

        key('ArrowDown');
        expect(opts[2].hasAttribute('data-active')).toBe(true);

        // Clamps at the last option (no wrap).
        key('ArrowDown');
        expect(opts[2].hasAttribute('data-active')).toBe(true);

        key('ArrowUp');
        expect(opts[1].hasAttribute('data-active')).toBe(true);
    });

    it('Enter selects the active option, closes, and fires aparte-select-change', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }, { value: 'three' }]);
        openViaTrigger(el);
        let detail: { value: string } | undefined;
        el.addEventListener('aparte-select-change', (e: Event) => { detail = (e as CustomEvent).detail; });

        key('ArrowDown');   // -> 'two'
        key('Enter');

        expect(el.value).toBe('two');
        expect(el.open).toBe(false);
        expect(detail?.value).toBe('two');
    });

    it('Home and End jump to the first and last option', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }, { value: 'three' }]);
        openViaTrigger(el);
        const opts = el.querySelectorAll('aparte-option');

        key('End');
        expect(opts[2].hasAttribute('data-active')).toBe(true);

        key('Home');
        expect(opts[0].hasAttribute('data-active')).toBe(true);
    });

    it('skips disabled options when navigating', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two', disabled: true }, { value: 'three' }]);
        openViaTrigger(el);
        const opts = el.querySelectorAll('aparte-option');

        key('ArrowDown');   // from 'one' -> skips disabled 'two' -> 'three'
        expect(opts[2].hasAttribute('data-active')).toBe(true);
        expect(opts[1].hasAttribute('data-active')).toBe(false);
    });

    it('Escape closes the dropdown without selecting', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }]);
        openViaTrigger(el);
        key('ArrowDown');
        key('Escape');
        expect(el.open).toBe(false);
        expect(el.value).toBe('');
    });

    it('clears the highlight and aria-activedescendant on close', async () => {
        const el = mountSelect([{ value: 'one' }, { value: 'two' }]);
        openViaTrigger(el);
        key('ArrowDown');
        key('Escape');
        const opts = el.querySelectorAll('aparte-option');
        expect(opts[0].hasAttribute('data-active')).toBe(false);
        expect(opts[1].hasAttribute('data-active')).toBe(false);
        expect(el.querySelector('.aparte-select-trigger')!.hasAttribute('aria-activedescendant')).toBe(false);
    });
});

describe('AparteSelect — listbox wiring (axe aria-required-attr / -children / -input-field-name)', () => {
    // The dropdown used to BE the listbox while also containing the search input,
    // which makes a listbox with invalid children; and the combobox trigger
    // declared no `aria-controls`. axe reports both as critical.
    it('puts the listbox on the options container, not on the dropdown shell', () => {
        const el = mountSelect([{ value: 'one' }]);
        const dropdown = el.querySelector('.aparte-select-dropdown')!;
        const list = el.querySelector('.aparte-select-options')!;

        expect(dropdown.getAttribute('role')).toBeNull();
        expect(list.getAttribute('role')).toBe('listbox');
        // The listbox needs its own accessible name.
        expect(list.getAttribute('aria-label')).toBe('Pick');
    });

    it('points the combobox at the listbox with aria-controls', () => {
        const el = mountSelect([{ value: 'one' }]);
        const trigger = el.querySelector('.aparte-select-trigger')!;
        const list = el.querySelector('.aparte-select-options')!;

        expect(list.id, 'the listbox needs an id to be referenced').toBeTruthy();
        expect(trigger.getAttribute('aria-controls')).toBe(list.id);
    });

    it('keeps the search field OUT of the listbox', () => {
        const el = document.createElement('aparte-select');
        el.setAttribute('placeholder', 'Pick');
        el.setAttribute('searchable', '');
        document.body.appendChild(el);
        mounted.push(el);

        const search = el.querySelector('.aparte-select-search')!;
        const list = el.querySelector('.aparte-select-options')!;
        expect(search).not.toBeNull();
        expect(list.contains(search), 'a listbox may only contain options/groups').toBe(false);
    });
});

describe('AparteOptgroup — group naming inside a listbox', () => {
    // The header used to carry `aria-label`, which turned a generic div into a
    // named node — and a named non-option node is an invalid child of a listbox
    // (axe: aria-required-children, critical). The GROUP must be named instead.
    it('names the group via aria-labelledby and leaves the header generic', async () => {
        const group = document.createElement('aparte-optgroup');
        group.setAttribute('label', 'Ollama');
        group.setAttribute('collapsible', '');
        const option = document.createElement('aparte-option');
        option.setAttribute('value', 'o1');
        group.appendChild(option);
        document.body.appendChild(group);
        mounted.push(group);

        const header = group.querySelector('.aparte-optgroup-header')!;
        const labelSpan = group.querySelector('.aparte-optgroup-label')!;

        expect(group.getAttribute('role')).toBe('group');
        expect(header.hasAttribute('aria-label'), 'the header must stay a generic node').toBe(false);
        expect(labelSpan.id, 'the label needs an id to be referenced').toBeTruthy();
        expect(group.getAttribute('aria-labelledby')).toBe(labelSpan.id);
        expect(labelSpan.textContent).toBe('Ollama');
    });
});

describe('AparteSelect — accessible name (axe aria-input-field-name)', () => {
    it('names the combobox trigger after the placeholder by default', () => {
        const el = mountSelect([{ value: 'one' }]);
        expect(el.querySelector('.aparte-select-trigger')!.getAttribute('aria-label')).toBe('Pick');
    });

    it('a host aria-label overrides the placeholder as the accessible name', () => {
        const el = document.createElement('aparte-select');
        el.setAttribute('placeholder', 'Pick');
        el.setAttribute('aria-label', 'Choose a model');
        document.body.appendChild(el);
        mounted.push(el);
        expect(el.querySelector('.aparte-select-trigger')!.getAttribute('aria-label')).toBe('Choose a model');
    });
});
