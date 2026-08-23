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
});
