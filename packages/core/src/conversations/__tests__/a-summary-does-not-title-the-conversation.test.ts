/**
 * A compaction summary is not what the conversation is about.
 *
 * The title follows the first user message, and after a compaction the first user
 * message in the list is the summary notice: the sidebar read
 * "Conversation summary The user requested…". The three places that look for "the first
 * user message" skip a `compaction: true` message.
 */
import { describe, it, expect } from 'vitest';
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

const msg = (role: 'user' | 'assistant', content: string, extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: crypto.randomUUID(), role, content, timestamp: 1, ...extra });
const summary = (): AparteMessage => msg('user', '**Conversation summary** The user requested a recipe.', { compaction: true });

async function fresh() {
    const manager = new AparteConversationManager(memoryAdapter());
    await manager.init();
    const conv = await manager.createNew();
    return { manager, id: conv.id, title: () => manager.conversations.find((c) => c.id === conv.id)!.title };
}

describe('the title skips a compaction summary', () => {
    it('addMessage: a summary appended first does not title the conversation, the next user message does', async () => {
        const { manager, id, title } = await fresh();
        await manager.addMessage(id, summary());
        expect(title()).not.toContain('Conversation summary');

        await manager.addMessage(id, msg('user', 'what about dessert'));
        expect(title()).toBe('what about dessert');
    });

    it('addMessage: a user message after a summary is still the first one a person wrote', async () => {
        const { manager, id, title } = await fresh();
        await manager.addMessage(id, summary());
        await manager.addMessage(id, msg('user', 'tell me more'));
        await manager.addMessage(id, msg('user', 'and then'));
        expect(title()).toBe('tell me more');
    });

    it('updateMessages: a transcript that now opens on a summary keeps the title of the real first message', async () => {
        const { manager, id, title } = await fresh();
        await manager.addMessage(id, msg('user', 'the real question'));
        // What a compaction leaves: the summary in front, the kept turns after it.
        const kept = manager.conversations.find((c) => c.id === id)!.messages;
        await manager.updateMessages(id, [summary(), ...kept]);
        expect(title()).toBe('the real question');
    });

    it('updateMessages: editing the first real message re-titles, the summary never being the one compared', async () => {
        const { manager, id, title } = await fresh();
        await manager.addMessage(id, msg('user', 'the real question'));
        const kept = manager.conversations.find((c) => c.id === id)!.messages;
        await manager.updateMessages(id, [summary(), ...kept]);
        const stored = manager.conversations.find((c) => c.id === id)!.messages;
        await manager.updateMessages(id, stored.map((m) => (m.compaction ? m : { ...m, content: 'a reworded question' })));
        expect(title()).toBe('a reworded question');
    });
});
