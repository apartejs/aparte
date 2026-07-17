import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AparteUi from '../AparteUi.vue';
import { registerAllComponents } from '@aparte/core';

// Real aparté elements — the whole point is that they are attribute-driven.
registerAllComponents();

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

    it('maps true to a bare attribute and false/null to removal', async () => {
        const wrapper = mount(AparteUi, { props: { name: 'aparte-composer', props: { disabled: true } } });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        expect(el.hasAttribute('disabled')).toBe(true);

        await wrapper.setProps({ name: 'aparte-composer', props: { disabled: false } });
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('hands objects over as properties (an attribute cannot carry them)', () => {
        const payload = { a: 1 };
        const wrapper = mount(AparteUi, { props: { name: 'aparte-chat-bubble', props: { someData: payload } } });
        const el = wrapper.element.querySelector('aparte-chat-bubble') as HTMLElement;
        expect((el as unknown as { someData: unknown }).someData).toBe(payload);
        expect(el.hasAttribute('someData')).toBe(false);
    });

    it('forwards a DEFAULT_EVENTS event through elementEvent', () => {
        const wrapper = mount(AparteUi, { props: { name: 'aparte-composer' } });
        const el = wrapper.element.querySelector('aparte-composer') as HTMLElement;
        el.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hi' } }));
        expect(wrapper.emitted('elementEvent')).toBeTruthy();
    });
});
