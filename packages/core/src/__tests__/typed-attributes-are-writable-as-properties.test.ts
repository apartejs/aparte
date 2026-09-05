// @vitest-environment jsdom
/**
 * A DECLARED attribute that the element also exposes as a property must be writable
 * through both channels.
 *
 * React 19 and Svelte assign the PROPERTY whenever the element has one of that name
 * (`key in element` / `get_setters(node).includes(prop)`), and only fall back to the
 * attribute when it does not. So a getter-only accessor whose name is also a typed
 * attribute is not a read-only nicety — it is a `TypeError: Cannot set property x of
 * #<El> which has only a getter` that takes the render down, on a spelling the
 * wrappers' own JSX / `SvelteHTMLElements` augmentations declare valid.
 *
 * The same channel split explains the second half: `<aparte-suggestions>` declares its
 * `suggestions` attribute as the JSON string form, and its docblock says the PROPERTY
 * "takes the same shape without the JSON" — so the property has to accept both, or a
 * React/Svelte template writing the documented JSON string silently renders nothing
 * (`Array.isArray('…')` is false → `[]`, and `attributeChangedCallback` never runs
 * because the attribute was never written).
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../components/composer/aparte-composer.js';
import '../components/context/aparte-context.js';
import '../components/suggestions/aparte-suggestions.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';
import type { AparteContext } from '../components/context/aparte-context.js';
import type { AparteSuggestions } from '../components/suggestions/aparte-suggestions.js';

afterEach(() => { document.body.innerHTML = ''; });

const mount = <T extends HTMLElement>(tag: string): T => {
    const el = document.createElement(tag) as T;
    document.body.appendChild(el);
    return el;
};

// What React 19 / Svelte actually assign for `disabled={''}` — the documented spelling.
const EMPTY = '' as unknown as boolean;

describe('a declared attribute that is also a property is writable as one', () => {
    it('<aparte-composer>.placeholder writes the attribute the input reads', () => {
        const composer = mount<AparteComposer>('aparte-composer');
        expect(() => { composer.placeholder = 'Ask anything…'; }).not.toThrow();
        expect(composer.getAttribute('placeholder')).toBe('Ask anything…');
        expect(composer.placeholder).toBe('Ask anything…');
        composer.placeholder = '';
        expect(composer.hasAttribute('placeholder'), 'an empty placeholder is a placeholder').toBe(true);
        composer.placeholder = null as unknown as string;
        expect(composer.hasAttribute('placeholder'), 'null clears it').toBe(false);
    });

    it('<aparte-composer>.disabled follows the presence rule (#62)', () => {
        const composer = mount<AparteComposer>('aparte-composer');
        expect(() => { composer.disabled = EMPTY; }).not.toThrow();
        expect(composer.hasAttribute('disabled'), `disabled = '' must SET the attribute`).toBe(true);
        expect(composer.disabled).toBe(true);
        composer.disabled = false;
        expect(composer.hasAttribute('disabled')).toBe(false);
        composer.disabled = true;
        expect(composer.hasAttribute('disabled')).toBe(true);
        composer.disabled = undefined as unknown as boolean;
        expect(composer.hasAttribute('disabled')).toBe(false);
    });

    it('<aparte-context>.window writes the attribute the gauge reads', () => {
        const el = mount<AparteContext>('aparte-context');
        expect(() => { el.window = 8000; }).not.toThrow();
        expect(el.getAttribute('window')).toBe('8000');
        expect(el.window).toBe(8000);
        el.window = null;
        expect(el.hasAttribute('window'), 'null falls back to the model window').toBe(false);
    });

    it('<aparte-suggestions>.suggestions takes the JSON string the attribute documents', () => {
        const el = mount<AparteSuggestions>('aparte-suggestions');
        el.suggestions = '[{"label":"Hi","prompt":"Say hi"},"What is aparté?"]' as unknown as never;
        expect(el.suggestions).toHaveLength(2);
        expect(el.querySelectorAll('button')).toHaveLength(2);
        expect(el.hasAttribute('data-empty')).toBe(false);
    });

    it('<aparte-suggestions>.suggestions still takes an array, and rejects the rest', () => {
        const el = mount<AparteSuggestions>('aparte-suggestions');
        el.suggestions = [{ label: 'Hi', prompt: 'Say hi' }];
        expect(el.suggestions).toHaveLength(1);
        el.suggestions = 'not json' as unknown as never;
        expect(el.suggestions).toEqual([]);
        expect(el.hasAttribute('data-empty')).toBe(true);
    });
});
