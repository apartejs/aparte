/**
 * `new AparteConversationManager(adapter, { orderBy })`: the order of its lists, as the app chooses.
 *
 * The lists were by `updatedAt`, the last change of content, a reply ending included: the market's
 * order (ChatGPT, Claude). An app that orders by when a conversation was started, or by the
 * person's last message, sorted the manager's lists again itself, and a "previous / next
 * conversation" key built on one order met the other.
 */
import { describe, it, expect } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';

function adapter(convs: AparteConversation[]): AparteStorageAdapter {
    const store = new Map(convs.map((c) => [c.id, c]));
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

// Started a, b, c in that order; changed last: a, then c, then b.
const CONVS: AparteConversation[] = [
    { id: 'a', title: 'A', createdAt: 1, updatedAt: 30, messages: [] },
    { id: 'b', title: 'B', createdAt: 2, updatedAt: 10, messages: [] },
    { id: 'c', title: 'C', createdAt: 3, updatedAt: 20, messages: [] },
    { id: 'z', title: 'Z', createdAt: 4, updatedAt: 5, messages: [], archivedAt: 6 } as AparteConversation,
    { id: 'y', title: 'Y', createdAt: 5, updatedAt: 1, messages: [], archivedAt: 7 } as AparteConversation,
];
const ids = (convs: AparteConversation[]) => convs.map((c) => c.id);

describe('the order of the manager\'s lists', () => {
    it('is by last change, newest first, by default', async () => {
        const m = new AparteConversationManager(adapter(CONVS));
        await m.init();
        expect(ids(m.activeConversations)).toEqual(['a', 'c', 'b']);
        expect(ids(m.archivedConversations)).toEqual(['z', 'y']);
    });

    it('is by start, newest first, with orderBy: \'created\'', async () => {
        const m = new AparteConversationManager(adapter(CONVS), { orderBy: 'created' });
        await m.init();
        expect(ids(m.activeConversations)).toEqual(['c', 'b', 'a']);
        expect(ids(m.archivedConversations)).toEqual(['y', 'z']);
    });

    it('is the app\'s own, with a function', async () => {
        const m = new AparteConversationManager(adapter(CONVS), { orderBy: (x, y) => x.title.localeCompare(y.title) });
        await m.init();
        expect(ids(m.activeConversations)).toEqual(['a', 'b', 'c']);
    });

    // What a framework helper sorts its own reactive list with.
    it('is the same through compare, for a list sorted elsewhere', async () => {
        const m = new AparteConversationManager(adapter(CONVS), { orderBy: 'created' });
        await m.init();
        const elsewhere = [...m.activeConversations].reverse().sort((a, b) => m.compare(a, b));
        expect(ids(elsewhere)).toEqual(ids(m.activeConversations));
    });
});
