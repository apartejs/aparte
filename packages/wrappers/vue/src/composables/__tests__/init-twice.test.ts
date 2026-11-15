/**
 * The conversation helper's `init()`, called a second time, replaces the manager. It used to
 * leave its subscription on the first one, whose notifications went on writing the helper's
 * lists and `activeId`.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { AparteConfig, type AparteConversation, type AparteConversationManager, type AparteStorageAdapter } from '@aparte/core';
import { useConversationManager } from '../useConversationManager.js';

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

describe('useConversationManager().init, called twice', () => {
    it('leaves no subscription on the manager it replaced', async () => {
        const Probe = defineComponent({
            setup(_, { expose }) {
                const cm = useConversationManager();
                expose({ cm });
                return () => null;
            },
        });
        const wrapper = mount(Probe);
        const cm = (wrapper.vm as unknown as { cm: ReturnType<typeof useConversationManager> }).cm;
        const config = new AparteConfig();
        await cm.init(memoryAdapter(), config);
        const firstManager = cm.manager as AparteConversationManager;
        await cm.init(memoryAdapter(), config);
        // The first manager's notifications reach the composable no more.
        await firstManager.createNew('stale');
        expect(cm.conversations.value).toHaveLength(0);
        wrapper.unmount();
    });
});
