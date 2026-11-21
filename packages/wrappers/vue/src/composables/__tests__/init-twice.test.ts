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

function slowAdapter(): { adapter: AparteStorageAdapter; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    return { adapter: { async loadAll() { await gate; return []; }, async save() {}, async delete() {} }, release };
}

describe('useConversationManager().init, overtaken by a newer one', () => {
    // A slow store answers the first init after the second: its manager was registered on the
    // config last, so the chat persisted into the store of the account the person had left.
    it('registers nothing when it resolves after the newer init', async () => {
        const Probe = defineComponent({ setup(_, { expose }) { const cm = useConversationManager(); expose({ cm }); return () => null; } });
        const wrapper = mount(Probe);
        const cm = (wrapper.vm as unknown as { cm: ReturnType<typeof useConversationManager> }).cm;
        const config = new AparteConfig();
        const slow = slowAdapter();
        const first = cm.init(slow.adapter, config);
        await cm.init(memoryAdapter(), config);
        const newer = cm.manager;
        // An active conversation in the newer store: the stale init must not write its own over it.
        await newer!.createNew('fresh');
        slow.release();
        await first;
        expect(config.getConversationManager()).toBe(newer);
        expect(cm.manager).toBe(newer);
        expect(cm.activeId.value).not.toBeNull();
        expect(cm.activeId.value).toBe(newer!.activeId);
        wrapper.unmount();
    });
});

/** Two saved conversations: `a` started first and changed last, `b` started last and changed first. */
function twoConversations(): AparteStorageAdapter {
    const rows = [
        { id: 'a', title: 'A', createdAt: 1, updatedAt: 30, messages: [] },
        { id: 'b', title: 'B', createdAt: 2, updatedAt: 10, messages: [] },
    ] as unknown as AparteConversation[];
    return { async loadAll() { return rows; }, async save() {}, async delete() {} };
}

describe('useConversationManager() with orderBy', () => {
    // The helper sorted its own lists by the latest change again, whatever the manager was told.
    it('lists in the order the manager was given', async () => {
        const Probe = defineComponent({ setup(_, { expose }) { const cm = useConversationManager(); expose({ cm }); return () => null; } });
        const wrapper = mount(Probe);
        const cm = (wrapper.vm as unknown as { cm: ReturnType<typeof useConversationManager> }).cm;
        await cm.init(twoConversations(), new AparteConfig(), { orderBy: 'created' });
        expect(cm.activeConversations.value.map((c) => c.id)).toEqual(['b', 'a']);
        wrapper.unmount();
    });
});
