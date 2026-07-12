import { describe, it, expect, beforeEach } from 'vitest';
import { MessageRepository } from '../message-repository.js';
import type { AparteMessage } from '../../types/index.js';

function makeMsg(overrides: Partial<AparteMessage> = {}): AparteMessage {
    return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'hello',
        timestamp: Date.now(),
        status: 'completed',
        ...overrides,
    };
}

describe('MessageRepository', () => {
    let repo: MessageRepository;

    beforeEach(() => {
        repo = new MessageRepository();
    });

    // ─── basic add + get ───────────────────────────────────────────────────

    describe('addOrUpdateMessage() + getMessages()', () => {
        it('starts empty', () => {
            expect(repo.getMessages()).toHaveLength(0);
            expect(repo.headId).toBeNull();
        });

        it('adds a root message and sets head', () => {
            const msg = makeMsg();
            repo.addOrUpdateMessage(null, msg);
            expect(repo.getMessages()).toHaveLength(1);
            expect(repo.getMessages()[0].id).toBe(msg.id);
            expect(repo.headId).toBe(msg.id);
        });

        it('builds a linear chain root → head', () => {
            const a = makeMsg({ content: 'A' });
            const b = makeMsg({ content: 'B' });
            const c = makeMsg({ content: 'C' });
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(b.id, c);
            const msgs = repo.getMessages();
            expect(msgs).toHaveLength(3);
            expect(msgs.map(m => m.content)).toEqual(['A', 'B', 'C']);
            expect(repo.headId).toBe(c.id);
        });

        it('throws when adding to an unknown parent', () => {
            expect(() => repo.addOrUpdateMessage('ghost', makeMsg())).toThrow();
        });

        it('updates an existing message in place', () => {
            const msg = makeMsg({ content: 'old' });
            repo.addOrUpdateMessage(null, msg);
            repo.addOrUpdateMessage(null, { ...msg, content: 'new' });
            expect(repo.getMessages()[0].content).toBe('new');
            expect(repo.getMessages()).toHaveLength(1);
        });
    });

    // ─── getMessageById ────────────────────────────────────────────────────

    describe('getMessageById()', () => {
        it('returns undefined for unknown id', () => {
            expect(repo.getMessageById('ghost')).toBeUndefined();
        });

        it('returns the mutable message reference', () => {
            const msg = makeMsg({ content: 'original' });
            repo.addOrUpdateMessage(null, msg);
            const ref = repo.getMessageById(msg.id)!;
            ref.content = 'mutated';
            // Same reference → mutation reflected in getMessages()
            expect(repo.getMessages()[0].content).toBe('mutated');
        });
    });

    // ─── getMessage ────────────────────────────────────────────────────────

    describe('getMessage()', () => {
        it('returns undefined for unknown id', () => {
            expect(repo.getMessage('ghost')).toBeUndefined();
        });

        it('returns parentId = null for root message', () => {
            const msg = makeMsg();
            repo.addOrUpdateMessage(null, msg);
            expect(repo.getMessage(msg.id)?.parentId).toBeNull();
        });

        it('returns correct parentId for child', () => {
            const a = makeMsg();
            const b = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            expect(repo.getMessage(b.id)?.parentId).toBe(a.id);
        });

        it('returns correct level (depth)', () => {
            const a = makeMsg();
            const b = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            expect(repo.getMessage(a.id)?.index).toBe(0);
            expect(repo.getMessage(b.id)?.index).toBe(1);
        });
    });

    // ─── getBranches + switchToBranch ──────────────────────────────────────

    describe('getBranches() + switchToBranch()', () => {
        it('returns empty array for unknown message', () => {
            expect(repo.getBranches('ghost')).toEqual([]);
        });

        it('returns single sibling for non-branched message', () => {
            const msg = makeMsg();
            repo.addOrUpdateMessage(null, msg);
            expect(repo.getBranches(msg.id)).toEqual([msg.id]);
        });

        it('returns all siblings in insertion order after adding a sibling', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            // Add sibling of b under a
            repo.addOrUpdateMessage(a.id, c);
            // Order matters for the branch picker — b was added first.
            expect(repo.getBranches(b.id)).toEqual([b.id, c.id]);
        });

        it('switchToBranch changes the active path', () => {
            const a = makeMsg({ content: 'A' });
            const b = makeMsg({ content: 'B' });
            const c = makeMsg({ content: 'C' }); // sibling of b
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(a.id, c);
            // Currently active: a → b (b was added first so it's the active child)
            expect(repo.headId).toBe(b.id);
            expect(repo.getMessages().map(m => m.content)).toEqual(['A', 'B']);

            repo.switchToBranch(c.id);
            expect(repo.headId).toBe(c.id);
            expect(repo.getMessages().map(m => m.content)).toEqual(['A', 'C']);
        });

        it('switchToBranch is a no-op for unknown branch', () => {
            const msg = makeMsg();
            repo.addOrUpdateMessage(null, msg);
            expect(() => repo.switchToBranch('ghost')).not.toThrow();
            expect(repo.headId).toBe(msg.id);
        });

        it('switchToBranch follows chain to leaf', () => {
            const a = makeMsg({ content: 'A' });
            const b = makeMsg({ content: 'B' });
            const d = makeMsg({ content: 'D' }); // child of b
            const c = makeMsg({ content: 'C' }); // sibling of b
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(b.id, d);
            repo.addOrUpdateMessage(a.id, c);
            // Switch back to b: head should follow b → d (leaf)
            repo.switchToBranch(b.id);
            expect(repo.headId).toBe(d.id);
            expect(repo.getMessages().map(m => m.content)).toEqual(['A', 'B', 'D']);
        });
    });

    // ─── resetHead ────────────────────────────────────────────────────────

    describe('resetHead()', () => {
        it('removes the message and its descendants', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(b.id, c);
            repo.resetHead(b.id);
            expect(repo.getMessages()).toHaveLength(1);
            expect(repo.getMessages()[0].id).toBe(a.id);
            expect(repo.getMessageById(b.id)).toBeUndefined();
            expect(repo.getMessageById(c.id)).toBeUndefined();
        });

        it('sets head to parent of removed message', () => {
            const a = makeMsg();
            const b = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.resetHead(b.id);
            expect(repo.headId).toBe(a.id);
        });

        it('removes all messages when called on root', () => {
            const a = makeMsg();
            const b = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.resetHead(a.id);
            expect(repo.getMessages()).toHaveLength(0);
            expect(repo.headId).toBeNull();
        });

        it('is a no-op for unknown id', () => {
            const msg = makeMsg();
            repo.addOrUpdateMessage(null, msg);
            repo.resetHead('ghost');
            expect(repo.getMessages()).toHaveLength(1);
        });
    });

    // ─── updateMessage ────────────────────────────────────────────────────

    describe('updateMessage()', () => {
        it('updates fields in place', () => {
            const msg = makeMsg({ content: 'old', status: 'pending' });
            repo.addOrUpdateMessage(null, msg);
            repo.updateMessage(msg.id, { content: 'new', status: 'completed' });
            const stored = repo.getMessageById(msg.id)!;
            expect(stored.content).toBe('new');
            expect(stored.status).toBe('completed');
        });

        it('is a no-op for unknown id', () => {
            expect(() => repo.updateMessage('ghost', { content: 'x' })).not.toThrow();
        });
    });

    // ─── clear ────────────────────────────────────────────────────────────

    describe('clear()', () => {
        it('removes all messages and resets head', () => {
            repo.addOrUpdateMessage(null, makeMsg());
            repo.addOrUpdateMessage(repo.headId!, makeMsg());
            repo.clear();
            expect(repo.getMessages()).toHaveLength(0);
            expect(repo.headId).toBeNull();
        });
    });

    // ─── _relink (re-parent via addOrUpdateMessage with same id) ──────────
    //
    // Internal helper, exercised through addOrUpdateMessage when the message
    // already exists but is supplied with a different parentId.

    describe('addOrUpdateMessage() — re-parenting an existing message', () => {
        it('moves the node out of old parent.children[] and into new parent.children[]', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(a.id, c);
            // Sanity: before relink, b and c are siblings under a.
            expect(repo.getBranches(b.id)).toEqual([b.id, c.id]);

            // Re-parent c under b.
            repo.addOrUpdateMessage(b.id, c);

            // After relink: a.children = [b], b.children = [c].
            // getBranches(b.id) returns siblings of b (children of a) → c removed.
            expect(repo.getBranches(b.id)).toEqual([b.id]);
            // getBranches(c.id) returns siblings of c (children of b) → c added.
            expect(repo.getBranches(c.id)).toEqual([c.id]);
        });

        it('updates getMessage().parentId to reflect the new parent', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(a.id, c);
            repo.addOrUpdateMessage(b.id, c);
            expect(repo.getMessage(c.id)?.parentId).toBe(b.id);
        });

        it('recalculates depth (level) of the relinked subtree', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            const d = makeMsg();
            repo.addOrUpdateMessage(null, a);   // level 0
            repo.addOrUpdateMessage(a.id, b);   // level 1
            repo.addOrUpdateMessage(a.id, c);   // level 1 (sibling of b)
            repo.addOrUpdateMessage(c.id, d);   // level 2 (child of c)
            // Re-parent c (and its descendant d) under b → c becomes level 2, d level 3
            repo.addOrUpdateMessage(b.id, c);
            expect(repo.getMessage(c.id)?.index).toBe(2);
            expect(repo.getMessage(d.id)?.index).toBe(3);
        });

        it('does not duplicate the child id in the new parent.children[]', () => {
            const a = makeMsg();
            const b = makeMsg();
            const c = makeMsg();
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            repo.addOrUpdateMessage(b.id, c);
            // Re-applying the SAME parent must be idempotent: still one entry.
            repo.addOrUpdateMessage(b.id, c);
            expect(repo.getBranches(c.id)).toEqual([c.id]);
        });
    });

    // ─── export ───────────────────────────────────────────────────────────

    describe('export()', () => {
        it('exports all messages with parentId relationships', () => {
            const a = makeMsg({ content: 'A' });
            const b = makeMsg({ content: 'B' });
            repo.addOrUpdateMessage(null, a);
            repo.addOrUpdateMessage(a.id, b);
            const exported = repo.export();
            expect(exported.headId).toBe(b.id);
            expect(exported.messages).toHaveLength(2);
            const aExport = exported.messages.find(m => m.message.id === a.id)!;
            const bExport = exported.messages.find(m => m.message.id === b.id)!;
            expect(aExport.parentId).toBeNull();
            expect(bExport.parentId).toBe(a.id);
        });
    });
});
