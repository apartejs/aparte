// @vitest-environment jsdom
/**
 * `aparte-select-change` says the person chose: a value set by code fires nothing, whichever way
 * it is set, as a native `<select>`.
 *
 * The attribute set the value silently and the property announced it. React's generated element
 * and Angular's directive write the attribute; Vue, Svelte 5 and a raw tag write the property. So
 * the same app echoed in two frameworks out of four: a value loaded from a saved conversation came
 * back as `aparte-select-change`, and a handler that saves the person's choice saved one nobody
 * made.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteSelect } from '../aparte-select.js';

afterEach(() => { document.body.innerHTML = ''; });

function mountSelect(): { el: AparteSelect; changes: string[] } {
    const el = document.createElement('aparte-select');
    for (const value of ['a', 'b', 'c']) {
        const opt = document.createElement('aparte-option');
        opt.setAttribute('value', value);
        opt.textContent = value.toUpperCase();
        el.appendChild(opt);
    }
    document.body.appendChild(el);
    if (!(el instanceof AparteSelect)) throw new Error('aparte-select did not upgrade');
    const changes: string[] = [];
    el.addEventListener('aparte-select-change', (e) => changes.push((e as CustomEvent<{ value: string }>).detail.value));
    return { el: el as AparteSelect, changes };
}

describe('a value set by code', () => {
    it('fires nothing through the attribute, nor through the property, and both show it', () => {
        const { el, changes } = mountSelect();
        el.setAttribute('value', 'b');
        expect(el.value).toBe('b');
        el.value = 'c';
        expect(el.getAttribute('value')).toBe('c');
        expect(changes).toEqual([]);
    });

    it('while a choice the person makes fires once, with the value chosen', () => {
        const { el, changes } = mountSelect();
        el.querySelector<HTMLElement>('.aparte-select-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        el.querySelector<HTMLElement>('aparte-option[value="b"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(changes).toEqual(['b']);
    });
});
