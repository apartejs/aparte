// @vitest-environment jsdom
/**
 * A boolean that is ON by default is turned off by the string `"false"`, so a prop bag's
 * `false` must write that string: removing the attribute is what ON looks like. Every
 * wrapper's `AparteUi` spreads its props through `applyElementProps`, and the Angular
 * directives are generated from the bindings config — the two lists are one list.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- the generator's plain ESM config is untyped; the test reads one field.
import bindings from '../../../element-bindings.config.mjs';
import { APARTE_DEFAULT_ON_ATTRIBUTES } from '../default-on-attributes.js';
import { applyElementProps } from '../element-props.js';

describe('booleans that are ON by default', () => {
    it('are the same list the Angular directives are generated from', () => {
        expect(APARTE_DEFAULT_ON_ATTRIBUTES).toEqual(bindings.threeStateBooleans);
    });

    it('turn OFF on false with the string, and back ON with the presence value', () => {
        for (const [tag, names] of Object.entries(APARTE_DEFAULT_ON_ATTRIBUTES)) {
            for (const name of names) {
                const el = document.createElement(tag);
                applyElementProps(el, { [name]: false });
                expect(el.getAttribute(name), `${tag} ${name}=false must stay present, as "false"`).toBe('false');
                applyElementProps(el, { [name]: true });
                expect(el.getAttribute(name)).toBe('');
                applyElementProps(el, { [name]: undefined });
                expect(el.hasAttribute(name)).toBe(false);
            }
        }
    });

    it('leaves a presence boolean as it was: false removes it', () => {
        const el = document.createElement('aparte-launcher');
        applyElementProps(el, { maximized: true });
        applyElementProps(el, { maximized: false });
        expect(el.hasAttribute('maximized')).toBe(false);
        // The same name on another element is that element's presence boolean.
        const other = document.createElement('aparte-sidebar');
        applyElementProps(other, { header: false });
        expect(other.hasAttribute('header')).toBe(false);
    });
});
