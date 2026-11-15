import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { toRaw } from 'vue';
import { registerAllComponents } from '@aparte/core';
import ElementsHost from './ElementsHost.vue';

/*
 * The raw `<aparte-conversation-list>` in a Vue template, mounted: the rows are bound as a
 * PROPERTY, the active conversation as an attribute, the events as listeners — which is what
 * the issue asks of React, and what Vue already does, because it sets a property the element
 * has and listens by the event's own name. The types of the same template are checked in
 * `ElementsTypeChecks.vue`, by `typecheck:tests`.
 */

registerAllComponents();

const mounted: VueWrapper[] = [];
afterEach(() => { for (const w of mounted.splice(0)) w.unmount(); });

function mountHost() {
    const wrapper = mount(ElementsHost, { attachTo: document.body });
    mounted.push(wrapper);
    const list = wrapper.element as HTMLElement & { conversations: Array<{ id: string; title: string }> };
    return { wrapper, list, vm: wrapper.vm as unknown as { rows: Array<{ id: string; title: string }>; activeId: string | null; picked: unknown[]; deleted: string[] } };
}

describe('the raw tag in a Vue template', () => {
    it('sets `:conversations` as the element\'s property: the rows are drawn, and no attribute carries them', () => {
        const { list } = mountHost();
        expect(list.localName).toBe('aparte-conversation-list');
        expect(list.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
        expect(list.querySelectorAll('[data-select-id]')).toHaveLength(2);
        expect(list.hasAttribute('conversations')).toBe(false);
    });

    it('writes `:active-id` as an attribute, and removes it for `null`', async () => {
        const { wrapper, list, vm } = mountHost();
        expect(list.hasAttribute('active-id')).toBe(false);
        vm.activeId = 'c2';
        await wrapper.vm.$nextTick();
        expect(list.getAttribute('active-id')).toBe('c2');
        vm.activeId = null;
        await wrapper.vm.$nextTick();
        expect(list.hasAttribute('active-id')).toBe(false);
    });

    it('calls `@aparte-conversation-select` once with the event, whose detail is the row', () => {
        const { list, vm } = mountHost();
        list.querySelector<HTMLElement>('[data-select-id="c2"]')!.click();
        expect(vm.picked).toHaveLength(1);
        expect(toRaw(vm.picked[0])).toEqual({ id: 'c2' });
    });

    it('calls `@aparte-conversation-delete` with an inline handler', () => {
        const { list, vm } = mountHost();
        list.dispatchEvent(new CustomEvent('aparte-conversation-delete', { detail: { id: 'c1' }, bubbles: true, composed: true, cancelable: true }));
        expect(vm.deleted).toEqual(['c1']);
    });
});
