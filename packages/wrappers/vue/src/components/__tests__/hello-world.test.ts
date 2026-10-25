/**
 * The hello world the Vue page starts with: a bare `<AparteChat />`, the client started, a
 * provider registered — no `messages`, no listener, no state of yours. A send streams a reply.
 */
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { aparteGlobalConfig, registerAllComponents } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { AparteChat, useAparteClient } from '../../index';

registerAllComponents();
aparteGlobalConfig.registerAIProvider(createScenarioProvider({ turns: ['Hello from the scripted model, streamed.'] }));

const Hello = defineComponent({
    setup() {
        useAparteClient();
        return () => h(AparteChat);
    },
});

describe('the Vue hello world', () => {
    it('a bare AparteChat streams with only the client started', async () => {
        const wrapper = mount(Hello, { attachTo: document.body });
        await flushPromises();
        wrapper.element.querySelector('aparte-composer')!.dispatchEvent(
            new CustomEvent('aparte-send', { detail: { content: 'Hi', timestamp: 1 }, bubbles: true, composed: true }),
        );
        await vi.waitFor(() => {
            const reply = document.querySelector('aparte-chat-bubble[data-role="assistant"]');
            expect(reply?.textContent).toContain('Hello from the scripted model, streamed.');
        }, { timeout: 5000 });
        wrapper.unmount();
    });
});
