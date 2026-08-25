import { describe, it, expect } from 'vitest';
import { applyElementProps } from '../element-props.js';

/**
 * `applyElementProps` is what the React and Angular wrappers use to spread a
 * consumer's prop bag onto a custom element. The keys are not necessarily
 * authored by the app — a bag can be forwarded from data — so this is a sink.
 */
describe('applyElementProps — `on*` never becomes an inline handler', () => {
    it('drops an on* STRING instead of writing it as an attribute', () => {
        // The original guard was `key.startsWith('on') && typeof value === 'function'`,
        // so a string fell through to setAttribute and became live inline script.
        const el = document.createElement('div');
        applyElementProps(el, { onclick: 'window.__pwned = 1' });
        expect(el.getAttribute('onclick')).toBeNull();
        expect(el.outerHTML).not.toContain('__pwned');
    });

    it('drops an on* function too (event forwarding owns those)', () => {
        const el = document.createElement('div');
        let called = false;
        applyElementProps(el, { onclick: () => { called = true; } });
        expect(el.getAttribute('onclick')).toBeNull();
        el.dispatchEvent(new MouseEvent('click'));
        expect(called, 'the wrapper forwards events; this must not attach one').toBe(false);
    });

    it('is not fooled by casing or by a non-event `on`-prefixed name', () => {
        const el = document.createElement('div');
        applyElementProps(el, { onerror: 'x=1', ondblclick: 'x=2' });
        expect(el.getAttribute('onerror')).toBeNull();
        expect(el.getAttribute('ondblclick')).toBeNull();
    });
});

describe('applyElementProps — the rest of the chain still behaves', () => {
    it('null / undefined / false remove the attribute', () => {
        const el = document.createElement('div');
        el.setAttribute('title', 'before');
        applyElementProps(el, { title: null });
        expect(el.hasAttribute('title')).toBe(false);

        el.setAttribute('hidden', '');
        applyElementProps(el, { hidden: false });
        expect(el.hasAttribute('hidden')).toBe(false);
    });

    it('true becomes a bare attribute, and scalars are stringified', () => {
        const el = document.createElement('div');
        applyElementProps(el, { disabled: true, tabindex: 0, title: 'hi' });
        expect(el.getAttribute('disabled')).toBe('');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('title')).toBe('hi');
    });

    it('custom properties go through style, objects go through the property', () => {
        const el = document.createElement('div');
        applyElementProps(el, { '--aparte-primary': 'red' });
        expect(el.style.getPropertyValue('--aparte-primary')).toBe('red');

        const segments = [{ id: 's1' }];
        applyElementProps(el, { segments });
        expect((el as unknown as { segments: unknown }).segments).toBe(segments);
    });

    /*
     * A custom property with no value must be REMOVED, not stringified.
     *
     * Setting it to the token `undefined` is strictly worse than leaving it alone:
     * because the property is then SET, every `var(--x, <default>)` in core's stylesheet
     * skips its fallback and becomes invalid at computed-value time, so the whole
     * declaration is dropped and the control renders unstyled rather than with the theme
     * default. `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field is
     * exactly how a consumer reaches it.
     */
    it('a custom property with no value is removed, not set to "undefined"', () => {
        const el = document.createElement('div');
        applyElementProps(el, { '--aparte-primary': 'red' });
        expect(el.style.getPropertyValue('--aparte-primary')).toBe('red');

        applyElementProps(el, { '--aparte-primary': undefined });
        expect(el.style.getPropertyValue('--aparte-primary')).toBe('');

        applyElementProps(el, { '--aparte-primary': 'red' });
        applyElementProps(el, { '--aparte-primary': null });
        expect(el.style.getPropertyValue('--aparte-primary')).toBe('');
    });

    it('a custom property never receives "[object Object]"', () => {
        const el = document.createElement('div');
        applyElementProps(el, { '--aparte-primary': { r: 1 } });
        expect(el.style.getPropertyValue('--aparte-primary')).toBe('');
    });

    /*
     * `NaN` removes the attribute rather than writing the string "NaN".
     *
     * Angular's `numberAttribute` returns `NaN` for undefined, null, '' and any
     * non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field
     * wrote `scroll-threshold="NaN"`. Core's fallbacks could not recover — `'NaN'` is
     * truthy, so `parseInt('NaN' || '50', 10)` is NaN — and the transcript stopped
     * following a streaming reply for the rest of the session.
     */
    it('NaN removes the attribute instead of writing the string', () => {
        const el = document.createElement('div');
        applyElementProps(el, { 'scroll-threshold': 64 });
        expect(el.getAttribute('scroll-threshold')).toBe('64');

        applyElementProps(el, { 'scroll-threshold': Number.NaN });
        expect(
            el.hasAttribute('scroll-threshold'),
            'a "NaN" string defeats every parseInt fallback downstream',
        ).toBe(false);
    });

    it('still writes 0, which is a real value and not a missing one', () => {
        // The guard above must not swallow falsy numbers: `[value]="0"` on the progress
        // spinner means 0%, and removing it would mean "indeterminate".
        const el = document.createElement('div');
        applyElementProps(el, { value: 0 });
        expect(el.getAttribute('value')).toBe('0');
    });
});
