import { describe, it, expect, afterEach, expectTypeOf } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { registerAllComponents, type AparteChatImperativeApi } from '@aparte/core';
import { useAparteChat, type UseAparteChat } from '../../composables/useAparteChat';
import GenericPathHost from './GenericPathHost.vue';

/*
 * The generic path: an event core has no emit for — a plugin's, or the app's own — is
 * written `@aparte-some-event` on `<AparteChat>` and arrives through attribute fallthrough on
 * the root element, which `getElement()` also returns. Nothing in the component (an
 * `inheritAttrs: false`, a declared emit of that name) may stop it.
 */

registerAllComponents();

const MESSAGES = [{ id: 'm1', role: 'assistant' as const, content: 'hi', timestamp: 1 }];
const mounted: VueWrapper[] = [];
afterEach(() => { for (const w of mounted.splice(0)) w.unmount(); });

function mountHost() {
    const wrapper = mount(GenericPathHost, { props: { messages: MESSAGES }, attachTo: document.body });
    mounted.push(wrapper);
    return wrapper;
}

describe('<AparteChat> and an event core does not know', () => {
    it('hears a plugin-shaped event sent from inside the chat, once, with its detail', async () => {
        const wrapper = mountHost();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bubble = wrapper.element.querySelector('aparte-chat-bubble')!;
        bubble.dispatchEvent(new CustomEvent('aparte-test-plugin-event', { bubbles: true, detail: { x: 1 } }));
        const heard = (wrapper.vm as unknown as { heard: CustomEvent[] }).heard;
        expect(heard).toHaveLength(1);
        expect(heard[0].detail).toEqual({ x: 1 });
    });

    it('exposes the root as getElement() and the composer as getComposer()', async () => {
        const wrapper = mountHost();
        const chat = (wrapper.vm as unknown as { chat: AparteChatImperativeApi }).chat;
        const root = wrapper.element as HTMLElement;
        expect(root.matches('[data-aparte-chat]')).toBe(true);
        expect(chat.getElement()).toBe(root);
        expect(chat.getComposer()).toBe(root.querySelector('aparte-composer'));
    });
});

describe('useAparteChat', () => {
    it('is the imperative API, and more', () => {
        expectTypeOf<UseAparteChat>().toMatchTypeOf<AparteChatImperativeApi>();
        const chat = useAparteChat();
        expect(chat.getElement()).toBeNull();
        expect(chat.getComposer()).toBeNull();
    });
});
