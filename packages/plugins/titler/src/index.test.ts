/**
 * `@aparte/plugin-titler` binds an aparte-titler model to the conversation manager's
 * title provider: the first user message of a conversation is titled by the model,
 * the model is loaded once and only when a title is first needed, and tearing the
 * plugin down gives the manager back the provider it had.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager, type AparteMessage, type AparteStorageAdapter } from '@aparte/core';
import { setupTitler, createTitleProvider } from './index.js';

function memoryAdapter(): AparteStorageAdapter {
    const rows = new Map();
    return {
        loadAll: async () => [...rows.values()],
        save: async (conv) => { rows.set(conv.id, conv); },
        delete: async (id) => { rows.delete(id); },
    };
}

/** What the plugin sees of `@aparte/titler`: `title(message, budget?)`. */
const fakeTitler = () => ({
    title: vi.fn((message: string, budget = 6) => message.split(' ').filter((w) => w.length > 3).slice(0, budget).join(' ')),
});

const user = (content: string): AparteMessage => ({ id: crypto.randomUUID(), role: 'user', content, timestamp: 1 });

async function manager() {
    const m = new AparteConversationManager(memoryAdapter());
    await m.init();
    return m;
}
const titleOf = (m: AparteConversationManager, id: string) => m.conversations.find((c) => c.id === id)!.title;

describe('setupTitler', () => {
    it('titles the first user message with the model, and forwards the word budget', async () => {
        const m = await manager();
        const titler = fakeTitler();
        setupTitler(m, { titler, budget: 3 });

        const conv = await m.createNew();
        await m.addMessage(conv.id, user('Can you explain how photosynthesis works in plants?'));

        expect(titler.title).toHaveBeenCalledWith('Can you explain how photosynthesis works in plants?', 3);
        expect(titleOf(m, conv.id)).toBe('explain photosynthesis works');
    });

    it('loads the model once, on the first title, not at setup', async () => {
        const m = await manager();
        const titler = fakeTitler();
        const load = vi.fn(async () => titler);
        setupTitler(m, { titler: load });
        expect(load).not.toHaveBeenCalled();

        const a = await m.createNew();
        await m.addMessage(a.id, user('first conversation about gardening tools'));
        const b = await m.createNew();
        await m.addMessage(b.id, user('second conversation about bread baking'));

        expect(load).toHaveBeenCalledTimes(1);
        expect(titleOf(m, a.id)).toBe('first conversation about gardening tools');
        expect(titleOf(m, b.id)).toBe('second conversation about bread baking');
    });

    it('accepts the model as a promise — what loadTitler() returns', async () => {
        const m = await manager();
        setupTitler(m, { titler: Promise.resolve(fakeTitler()) });
        const conv = await m.createNew();
        await m.addMessage(conv.id, user('a promise of a titler still titles'));
        expect(titleOf(m, conv.id)).toBe('promise titler still titles');
    });

    it('tears down: the manager gets its previous provider back, and a provider set since is left alone', async () => {
        const m = await manager();
        const before = () => 'before';
        m.setTitleProvider(before);
        const stop = setupTitler(m, { titler: fakeTitler() });
        expect(m.getTitleProvider()).not.toBe(before);
        stop();
        expect(m.getTitleProvider()).toBe(before);

        const later = () => 'later';
        const stopAgain = setupTitler(m, { titler: fakeTitler() });
        m.setTitleProvider(later);
        stopAgain();
        expect(m.getTitleProvider(), 'someone else’s provider is not clobbered').toBe(later);
    });
});

describe('createTitleProvider', () => {
    it('is the provider alone, for a manager built with the option', async () => {
        const provider = createTitleProvider({ titler: fakeTitler(), budget: 2 });
        const m = new AparteConversationManager(memoryAdapter(), { titleProvider: provider });
        await m.init();
        const conv = await m.createNew();
        await m.addMessage(conv.id, user('standalone provider titles conversations too'));
        expect(titleOf(m, conv.id)).toBe('standalone provider');
    });

    it('lets an empty answer fall through to the default title', async () => {
        const provider = createTitleProvider({ titler: { title: () => '' } });
        const m = new AparteConversationManager(memoryAdapter(), { titleProvider: provider });
        await m.init();
        const conv = await m.createNew();
        await m.addMessage(conv.id, user('ok'));
        expect(titleOf(m, conv.id)).toBe('ok');
    });
});
