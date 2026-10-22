/**
 * Opening a conversation, or moving between the versions of a reply, is not an edit.
 *
 * `updatedAt` sorts the list, so a conversation that is merely looked at must keep its place.
 * Two ways it did not: the viewport hands the messages back STAMPED (each segment with its
 * message id, index and `isStreaming: false`, an unanswerable call closed) and with keys in
 * another order, and the comparison was a raw `JSON.stringify` of the active path, so a branch
 * switch (‹1/2›) — a different path through the same messages — counted as new content.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { adoptMessageSegments } from '../../utils/segments.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

function memoryAdapter(seed: AparteConversation[]): AparteStorageAdapter & { save: ReturnType<typeof vi.fn> } {
    const rows = new Map(seed.map((c) => [c.id, c]));
    return {
        loadAll: vi.fn(async () => [...rows.values()]),
        save: vi.fn(async (conv: AparteConversation) => { rows.set(conv.id, conv); }),
        delete: vi.fn(async () => {}),
    };
}

const user: AparteMessage = { id: 'u1', role: 'user', content: 'Which file?', timestamp: 1 };
const reply = (id: string, text: string): AparteMessage => ({
    id, role: 'assistant', content: '', timestamp: 2, status: 'completed',
    // Written by the app (a server, an import): no stamps yet.
    segments: [{ id: `${id}-s`, type: 'text', content: text } as never],
});

async function managerWith(conv: AparteConversation) {
    const adapter = memoryAdapter([conv]);
    const manager = new AparteConversationManager(adapter);
    await manager.init();
    return { manager, adapter };
}

/** What a viewport hands back: the same messages, adopted, with their keys in another order. */
const asTheViewportReturnsIt = (messages: AparteMessage[]): AparteMessage[] =>
    messages.map((m) => {
        const adopted = adoptMessageSegments(m);
        return Object.fromEntries(Object.entries(adopted).reverse()) as unknown as AparteMessage;
    });

describe('viewing a conversation is not editing it', () => {
    it('a conversation opened and left keeps its date, stamps and key order notwithstanding', async () => {
        const messages = [user, reply('a1', 'This one.')];
        const { manager, adapter } = await managerWith({ id: 'c1', title: 't', createdAt: 1, updatedAt: 500, messages });
        await manager.updateMessages('c1', asTheViewportReturnsIt(messages));
        expect(adapter.save).not.toHaveBeenCalled();
        expect(manager.conversations[0]!.updatedAt).toBe(500);
    });

    it('a stored call nobody can answer, closed on load, is not a change either', async () => {
        const waiting: AparteMessage = {
            id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed',
            segments: [{ id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: {} } } as never],
        };
        const { manager, adapter } = await managerWith({ id: 'c1', title: 't', createdAt: 1, updatedAt: 500, messages: [user, waiting] });
        await manager.updateMessages('c1', asTheViewportReturnsIt([user, waiting]));
        expect(adapter.save).not.toHaveBeenCalled();
    });

    it('moving to the other version of a reply saves the choice but does not date the conversation', async () => {
        const v1 = reply('a1', 'First take.');
        const v2 = reply('a2', 'Second take.');
        const tree = (headId: string) => ({
            headId,
            messages: [
                { message: user, parentId: null },
                { message: v1, parentId: 'u1' },
                { message: v2, parentId: 'u1' },
            ],
        });
        const { manager, adapter } = await managerWith({
            id: 'c1', title: 't', createdAt: 1, updatedAt: 500, messages: [user, v2], tree: tree('a2'),
        });
        await manager.updateMessages('c1', asTheViewportReturnsIt([user, v1]), tree('a1'));
        expect(adapter.save, 'the branch shown is remembered').toHaveBeenCalledTimes(1);
        expect(manager.conversations[0]!.updatedAt, 'but it is not an edit').toBe(500);
    });

    it('an edit only the flat list carries is still saved, when the head did not move', async () => {
        // Under a framework the list and the viewport's tree can disagree: a field set through
        // `updateMessage`, or a message a controlled prop removed, is in the list only.
        const tree = { headId: 'a1', messages: [{ message: user, parentId: null }, { message: reply('a1', 'This one.'), parentId: 'u1' }] };
        const { manager, adapter } = await managerWith({
            id: 'c1', title: 't', createdAt: 1, updatedAt: 500, messages: [user, reply('a1', 'This one.')], tree,
        });
        await manager.updateMessages('c1', [user, { ...reply('a1', 'This one.'), meta: { pinned: true } } as AparteMessage], tree);
        expect(adapter.save).toHaveBeenCalledTimes(1);
        expect(manager.conversations[0]!.updatedAt).toBeGreaterThan(500);
    });

    it('a real edit still dates it', async () => {
        const { manager } = await managerWith({ id: 'c1', title: 't', createdAt: 1, updatedAt: 500, messages: [user, reply('a1', 'This one.')] });
        await manager.updateMessages('c1', [user, reply('a1', 'That one, actually.')]);
        expect(manager.conversations[0]!.updatedAt).toBeGreaterThan(500);
    });
});
