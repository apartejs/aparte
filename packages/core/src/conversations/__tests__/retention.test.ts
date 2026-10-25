import { describe, it, expect } from 'vitest';
import { AparteConversationManager, applyRetention, type ConversationManagerOptions } from '../conversation-manager.js';
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

describe('AparteConversationManager retention (opt-in)', () => {
    function makeManager(opts?: ConversationManagerOptions) {
        const store = new Map<string, AparteConversation>();
        const adapter: AparteStorageAdapter = {
            loadAll: async () => [...store.values()],
            save: async (c) => { store.set(c.id, c); },
            delete: async (id) => { store.delete(id); },
        };
        return { mgr: new AparteConversationManager(adapter, opts), store };
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

describe('applyRetention and a checkpoint', () => {
    const summary = { summary: 'What came before.', count: 4, createdAt: 99 };
    const withSummary = (id: string): AparteMessage => ({ ...m(id), contextSummary: summary });

    it('gives the new first message the summary when the cut falls after the checkpoint', () => {
        // u2 carries the checkpoint at index 2; keeping 2 messages cuts u1 a1 u2 a2 (indexes 0-3).
        const flat = [m('u1'), m('a1'), withSummary('u2'), m('a2'), m('u3'), m('a3')];
        const r = applyRetention(flat, undefined, 2);
        expect(r.messages.map((x) => x.id)).toEqual(['u3', 'a3']);
        // Same summary, same date; the count grows by the 2 messages cut from the
        // checkpoint's own position on (u2 and a2), which the summary now stands behind.
        expect(r.messages[0]!.contextSummary).toEqual({ summary: 'What came before.', count: 6, createdAt: 99 });
        expect(r.messages[1]!.contextSummary).toBeUndefined();
    });

    it('does the same in the tree, on the node the subtree is re-rooted at', () => {
        const flat = [m('u1'), m('a1'), withSummary('u2'), m('a2'), m('u3')];
        const tree: ExportedMessageRepository = {
            headId: 'u3',
            messages: [node('u1', null), node('a1', 'u1'), { message: withSummary('u2'), parentId: 'a1' },
                node('a2', 'u2'), node('u3', 'a2')],
        };
        const r = applyRetention(flat, tree, 2);
        const root = r.tree!.messages.find((x) => x.message.id === 'a2')!;
        expect(root.parentId).toBeNull();
        expect(root.message.contextSummary).toEqual({ summary: 'What came before.', count: 5, createdAt: 99 });
        expect(r.messages[0]!.contextSummary).toEqual(root.message.contextSummary);
    });

    it('does not touch the messages it received', () => {
        const flat = [m('u1'), withSummary('u2'), m('a2'), m('u3')];
        applyRetention(flat, undefined, 2);
        expect(flat[2]!.contextSummary).toBeUndefined();
        expect(flat[1]!.contextSummary).toBe(summary);
    });

    it('adds nothing when the checkpoint is among the kept messages', () => {
        const flat = [m('u1'), m('a1'), withSummary('u2'), m('a2')];
        const r = applyRetention(flat, undefined, 2);
        expect(r.messages[0]!.contextSummary).toBe(summary);
        expect(r.messages[1]!.contextSummary).toBeUndefined();
    });

    it('adds nothing when the path has no checkpoint', () => {
        const r = applyRetention(['a', 'b', 'c', 'd'].map(m), undefined, 2);
        expect('contextSummary' in r.messages[0]!).toBe(false);
    });

    it('inherits only the LATEST checkpoint when several were cut', () => {
        const older = { summary: 'older', count: 1, createdAt: 1 };
        const newer = { summary: 'newer', count: 3, createdAt: 2 };
        const flat = [{ ...m('u1'), contextSummary: older }, m('a1'), { ...m('u2'), contextSummary: newer }, m('a2'), m('u3')];
        const r = applyRetention(flat, undefined, 1);
        expect(r.messages[0]!.contextSummary).toEqual({ summary: 'newer', count: 3 + 2, createdAt: 2 });
    });
});
