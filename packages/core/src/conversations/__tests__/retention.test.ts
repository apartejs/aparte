import { describe, it, expect } from 'vitest';
import { ConversationManager, applyRetention, type ConversationManagerOptions } from '../conversation-manager.js';
import type { AparteMessage } from '../../types/index.js';
import type { ExportedMessageRepository } from '../../runtime/message-repository.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';

const m = (id: string): AparteMessage => ({ id, role: 'user', content: id, timestamp: 1 });
const node = (id: string, parentId: string | null) => ({ message: m(id), parentId });

describe('applyRetention', () => {
    it('is a no-op under the cap', () => {
        const flat = [m('a'), m('b')];
        expect(applyRetention(flat, undefined, 5).messages).toBe(flat);
    });

    it('trims the flat active path to the last N', () => {
        const flat = ['a', 'b', 'c', 'd', 'e'].map(m);
        expect(applyRetention(flat, undefined, 3).messages.map((x) => x.id)).toEqual(['c', 'd', 'e']);
    });

    it('trims the tree to the subtree under the cutoff, reparenting it to root', () => {
        const flat = ['u1', 'a1', 'u2', 'a2', 'u3'].map(m);
        const tree: ExportedMessageRepository = {
            headId: 'u3',
            messages: [node('u1', null), node('a1', 'u1'), node('u2', 'a1'), node('a2', 'u2'), node('u3', 'a2')],
        };
        const r = applyRetention(flat, tree, 3);
        expect(r.messages.map((x) => x.id)).toEqual(['u2', 'a2', 'u3']);
        expect(r.tree!.messages.map((x) => x.message.id).sort()).toEqual(['a2', 'u2', 'u3']);
        expect(r.tree!.messages.find((x) => x.message.id === 'u2')!.parentId).toBeNull();
        expect(r.tree!.headId).toBe('u3');
    });

    it('keeps recent branches under the cutoff and drops old history', () => {
        const flat = ['u1', 'a1', 'u2', 'b1'].map(m);
        const tree: ExportedMessageRepository = {
            headId: 'b1',
            // u2 has TWO children (a branch): b1 (active) + b2.
            messages: [node('u1', null), node('a1', 'u1'), node('u2', 'a1'), node('b1', 'u2'), node('b2', 'u2')],
        };
        const ids = applyRetention(flat, tree, 2).tree!.messages.map((x) => x.message.id).sort();
        expect(ids).toEqual(['b1', 'b2', 'u2']); // both recent branches survive; u1/a1 dropped
    });

    it('leaves the tree untouched on a flat/tree id mismatch', () => {
        const flat = ['x', 'y', 'z'].map(m);
        const tree: ExportedMessageRepository = { headId: 'q', messages: [node('q', null)] };
        const r = applyRetention(flat, tree, 2);
        expect(r.messages.map((x) => x.id)).toEqual(['y', 'z']);
        expect(r.tree).toBe(tree);
    });
});

describe('ConversationManager retention (opt-in)', () => {
    function makeManager(opts?: ConversationManagerOptions) {
        const store = new Map<string, AparteConversation>();
        const adapter: AparteStorageAdapter = {
            loadAll: async () => [...store.values()],
            save: async (c) => { store.set(c.id, c); },
            delete: async (id) => { store.delete(id); },
        };
        return { mgr: new ConversationManager(adapter, opts), store };
    }

    it('bounds persisted messages when retention is configured', async () => {
        const { mgr, store } = makeManager({ retention: { maxMessages: 2 } });
        const conv = await mgr.createNew();
        await mgr.updateMessages(conv.id, ['a', 'b', 'c', 'd'].map(m));
        expect(store.get(conv.id)!.messages.map((x) => x.id)).toEqual(['c', 'd']);
    });

    it('keeps full history by default (no retention)', async () => {
        const { mgr, store } = makeManager();
        const conv = await mgr.createNew();
        await mgr.updateMessages(conv.id, ['a', 'b', 'c', 'd'].map(m));
        expect(store.get(conv.id)!.messages).toHaveLength(4);
    });
});
