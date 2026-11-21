import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AparteUi from '../AparteUi.vue';
import { registerAllComponents } from '@aparte/core';

// Real aparté elements — the whole point is that they are attribute-driven.
registerAllComponents();

/** Records what it is told: each attribute change it hears, and each assignment of `items`. */
class FxProbe extends HTMLElement {
    static get observedAttributes(): string[] { return ['mode']; }
    heard: string[] = [];
    sets = 0;
    private _items: unknown = null;
    get items(): unknown { return this._items; }
    set items(value: unknown) { this._items = value; this.sets++; }
    attributeChangedCallback(name: string): void { this.heard.push(name); }
}
if (!customElements.get('fx-probe')) customElements.define('fx-probe', FxProbe);

describe('AparteUi.vue', () => {
    it('mounts the named element and applies props as ATTRIBUTES', () => {
        // Regression: applyProps used to assign DOM *properties*. aparté elements are
        // attribute-driven (observedAttributes), so that was a silent no-op — and on
        // <aparte-composer>, whose `placeholder`/`disabled` are getter-only accessors,
        // it threw outright.
        const wrapper = mount(AparteUi, {
            props: { name: 'aparte-composer', props: { placeholder: 'Ask…', '--glow-speed': '4s' } },
        });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.getAttribute('placeholder')).toBe('Ask…');
        // The element's own getter reads the attribute back — i.e. it really took effect.
        expect((el as unknown as { placeholder: string }).placeholder).toBe('Ask…');
        expect(el.style.getPropertyValue('--glow-speed')).toBe('4s');
    });

    it("turns <aparte-launcher>'s header OFF with the string on false, and passes the rest of its props", () => {
        // `header` is ON by default: removing it on `false` would have drawn the header.
        const wrapper = mount(AparteUi, {
            props: { name: 'aparte-launcher', props: { open: true, header: false, heading: 'Help', maximizable: 'panel', maximized: true } },
        });
        const el = wrapper.element.querySelector('aparte-launcher') as HTMLElement & { covers: boolean };
        expect(el.getAttribute('header')).toBe('false');
        expect(el.querySelector('.aparte-launcher__header')).toBeNull();
        expect(el.getAttribute('heading')).toBe('Help');
        expect(el.getAttribute('maximizable')).toBe('panel');
        expect(el.hasAttribute('maximized')).toBe(true);
        expect(el.covers).toBe(false);
    });

    it('maps true to a bare attribute and false/null to removal', async () => {
        const wrapper = mount(AparteUi, { props: { name: 'aparte-composer', props: { disabled: true } } });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        expect(el.hasAttribute('disabled')).toBe(true);

        await wrapper.setProps({ name: 'aparte-composer', props: { disabled: false } });
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    // A key that leaves the bag (`{ ...(busy && { disabled: true }) }` once busy ends) is cleared:
    // the wrapper hands the WHOLE bag (`replace`). Written key by key, the attribute stayed.
    it('clears a key that leaves the props bag', async () => {
        const wrapper = mount(AparteUi, { props: { name: 'aparte-composer', props: { disabled: true } } });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        expect(el.hasAttribute('disabled')).toBe(true);
        await wrapper.setProps({ name: 'aparte-composer', props: {} });
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('hands objects over as properties (an attribute cannot carry them)', () => {
        const payload = { a: 1 };
        const wrapper = mount(AparteUi, { props: { name: 'aparte-chat-bubble', props: { someData: payload } } });
        const el = wrapper.element.querySelector('aparte-chat-bubble') as HTMLElement;
        expect((el as unknown as { someData: unknown }).someData).toBe(payload);
        expect(el.hasAttribute('someData')).toBe(false);
    });

    // A prop bag handed again — a new object with the same values, or the same array pushed to
    // behind the deep watch. The element hears an attribute only when its value changes, and gets
    // the object again every time (it was mutated), so its setter can keep its state.
    it('handed an equal prop bag, writes no attribute again and hands the object again', async () => {
        const items = ['a'];
        const wrapper = mount(AparteUi, { props: { name: 'fx-probe', props: { mode: 'ask', items } } });
        const el = wrapper.element.querySelector('fx-probe') as FxProbe;
        expect(el.heard).toEqual(['mode']);
        const sets = el.sets;
        await wrapper.setProps({ name: 'fx-probe', props: { mode: 'ask', items } });
        expect(el.heard).toEqual(['mode']);
        expect(el.sets).toBe(sets + 1);
        await wrapper.setProps({ name: 'fx-probe', props: { mode: 'auto', items } });
        expect(el.heard).toEqual(['mode', 'mode']);
    });

    it('forwards a DEFAULT_EVENTS event through elementEvent', () => {
        const wrapper = mount(AparteUi, { props: { name: 'aparte-composer' } });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        el.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        expect(wrapper.emitted('elementEvent')).toBeTruthy();
    });
});
