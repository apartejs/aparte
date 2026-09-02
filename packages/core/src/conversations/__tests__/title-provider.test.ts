/**
 * The conversation's title comes from a provider, not from a rule frozen in the manager.
 *
 * Core titles a conversation from its first user message, and that default is the raw
 * text. A consumer who has a titler — `@aparte/titler`, an LLM call, a heuristic — had
 * no way to replace it short of racing `updateTitle` behind every send. The seam is on
 * the manager, which owns the one place the title is decided: `setTitleProvider`.
 *
 * The provider receives the message's text and may be async; an empty answer or a throw leaves the default, so a titler that fails can
 * never lose the user's message from the sidebar.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

function memoryAdapter(): AparteStorageAdapter {
    const rows = new Map<string, AparteConversation>();
    return {
        loadAll: async () => [...rows.values()],
        save: async (conv) => { rows.set(conv.id, conv); },
        delete: async (id) => { rows.delete(id); },
    };
}

const user = (content: AparteMessage['content']): AparteMessage =>
    ({ id: crypto.randomUUID(), role: 'user', content, timestamp: 1 });
const assistant = (content: string): AparteMessage =>
    ({ id: crypto.randomUUID(), role: 'assistant', content, timestamp: 2 });

async function fresh(provider?: ConstructorParameters<typeof AparteConversationManager>[1]) {
    const manager = new AparteConversationManager(memoryAdapter(), provider);
    await manager.init();
    const conv = await manager.createNew();
    return { manager, id: conv.id, title: () => manager.conversations.find((c) => c.id === conv.id)!.title };
}

describe('AparteConversationManager — the title provider', () => {
    it('titles the conversation with what the provider returns, trimmed, awaited', async () => {
        const { manager, id, title } = await fresh();
        const provider = vi.fn(async (text: string) => `  ${text.split(' ').slice(0, 2).join(' ')}  `);
        manager.setTitleProvider(provider);

        await manager.addMessage(id, user('explain photosynthesis in plants please'));

        expect(provider).toHaveBeenCalledWith('explain photosynthesis in plants please', expect.objectContaining({ role: 'user' }));
        expect(title()).toBe('explain photosynthesis');
    });

    it('asks once: the first user message only, never the assistant or a second turn', async () => {
        const { manager, id, title } = await fresh();
        const provider = vi.fn((text: string) => text.toUpperCase());
        manager.setTitleProvider(provider);

        await manager.addMessage(id, user('first'));
        await manager.addMessage(id, assistant('reply'));
        await manager.addMessage(id, user('second'));

        expect(provider).toHaveBeenCalledTimes(1);
        expect(title()).toBe('FIRST');
    });

    it('keeps the default when the provider answers nothing or throws — and says so once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { manager, id, title } = await fresh();

        manager.setTitleProvider(() => '   ');
        await manager.addMessage(id, user('a message the titler could not title'));
        expect(title()).toBe('a message the titler could not title');
        expect(warn).not.toHaveBeenCalled();

        const other = await fresh();
        other.manager.setTitleProvider(() => { throw new Error('model not loaded'); });
        await other.manager.addMessage(other.id, user('still titled by the default'));
        expect(other.title()).toBe('still titled by the default');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('is a constructor option too, readable back, and null restores the default', async () => {
        const provider = (text: string) => `${text}!`;
        const { manager, id, title } = await fresh({ titleProvider: provider });
        expect(manager.getTitleProvider()).toBe(provider);

        manager.setTitleProvider(null);
        expect(manager.getTitleProvider()).toBeNull();
        await manager.addMessage(id, user('plain'));
        expect(title()).toBe('plain');
    });
});

describe('AparteConversationManager — the default title', () => {
    it('is the first user message as typed, and "New Chat" when it has no text', async () => {
        const { manager, id, title } = await fresh();
        await manager.addMessage(id, user('  a photo of my cat  '));
        expect(title()).toBe('a photo of my cat');

        const empty = await fresh();
        await empty.manager.addMessage(empty.id, user(''));
        expect(empty.title()).toBe('New Chat');
    });
});
