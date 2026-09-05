/**
 * Truncating one branch does not move the reader out of another.
 *
 * `resetHead(id)` is the edit/truncate operation: drop that message and everything under
 * it, and land the head on its parent so the next reply regenerates from there. It set
 * `_head = node.prev` unconditionally — including when the head was in a SIBLING branch
 * the call had not touched, which silently jumped the active path out of the version the
 * reader was on.
 */
import { describe, it, expect } from 'vitest';
import { AparteMessageRepository } from '../message-repository.js';
import type { AparteMessage } from '../../types/index.js';

const message = (id: string, role: AparteMessage['role'] = 'assistant'): AparteMessage =>
    ({ id, role, content: id, timestamp: 1 });

describe('resetHead', () => {
    it('leaves the head where it is when it lives in another branch', () => {
        const repo = new AparteMessageRepository();
        repo.addOrUpdateMessage(null, message('u1', 'user'));
        repo.addOrUpdateMessage('u1', message('a1'));
        repo.addOrUpdateMessage('u1', message('b1'));
        repo.addOrUpdateMessage('b1', message('u2', 'user'));
        repo.switchToBranch('u2');
        expect(repo.headId).toBe('u2');

        repo.resetHead('a1');

        expect(repo.headId, 'the branch the reader is on is untouched').toBe('u2');
        expect(repo.getMessages().map((m) => m.id)).toEqual(['u1', 'b1', 'u2']);
        expect(repo.getMessageById('a1')).toBeUndefined();
    });

    it('still lands on the parent when the head was in what it removed', () => {
        const repo = new AparteMessageRepository();
        repo.addOrUpdateMessage(null, message('u1', 'user'));
        repo.addOrUpdateMessage('u1', message('a1'));
        repo.addOrUpdateMessage('a1', message('u2', 'user'));
        expect(repo.headId).toBe('u2');

        repo.resetHead('a1');

        expect(repo.headId).toBe('u1');
        expect(repo.getMessages().map((m) => m.id)).toEqual(['u1']);
    });

    it('empties the transcript when the root itself is removed', () => {
        const repo = new AparteMessageRepository();
        repo.addOrUpdateMessage(null, message('u1', 'user'));
        repo.addOrUpdateMessage('u1', message('a1'));

        repo.resetHead('u1');

        expect(repo.headId).toBeNull();
        expect(repo.getMessages()).toEqual([]);
    });
});
