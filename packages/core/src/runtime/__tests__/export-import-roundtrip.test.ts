/**
 * A tree the repository exports always imports.
 *
 * `export()` iterated the node map in insertion order and called that topological,
 * which held until `_relink` re-parented an existing node under one inserted AFTER
 * it. The snapshot then listed the child before its parent, and `import()` threw
 * "parent not found" — halfway through, leaving a half-built repository and a
 * conversation that no longer loaded. Nothing in the library triggers that relink
 * today; a consumer calling `addOrUpdateMessage` with a known id can, and the shape
 * of the failure is data loss.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteMessageRepository } from '../message-repository.js';
import type { AparteMessage } from '../../types/index.js';

const m = (id: string): AparteMessage => ({ id, role: 'assistant', content: id, timestamp: 1 });

describe('AparteMessageRepository — export/import round trip', () => {
    it('writes a parent before its children even after a node moved under a newer one', () => {
        const repo = new AparteMessageRepository();
        repo.addOrUpdateMessage(null, m('A'));
        repo.addOrUpdateMessage('A', m('C'));   // C inserted second…
        repo.addOrUpdateMessage('A', m('D'));   // …D third…
        repo.addOrUpdateMessage('D', m('C'));   // …then C re-parented under D.

        const snapshot = repo.export();
        const order = snapshot.messages.map(e => e.message.id);
        expect(order.indexOf('D')).toBeLessThan(order.indexOf('C'));
        expect(snapshot.messages.find(e => e.message.id === 'C')?.parentId).toBe('D');

        const again = new AparteMessageRepository();
        expect(() => again.import(snapshot)).not.toThrow();
        expect(again.getMessage('C')?.parentId).toBe('D');
        expect(again.getMessages().map(x => x.id)).toEqual(['A', 'D', 'C']);
    });

    it('skips an orphan in an older snapshot instead of throwing halfway', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const repo = new AparteMessageRepository();
        // A child listed before its parent — what the old export() could produce.
        repo.import({
            headId: 'B',
            messages: [
                { message: m('C'), parentId: 'B' },
                { message: m('A'), parentId: null },
                { message: m('B'), parentId: 'A' },
            ],
        });
        expect(repo.getMessages().map(x => x.id)).toEqual(['A', 'B']);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
