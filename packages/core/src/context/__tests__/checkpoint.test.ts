import { describe, it, expect } from 'vitest';
import { historyFromCheckpoint } from '../checkpoint.js';
import type { AparteMessage } from '../../types/index.js';

const msg = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: id, timestamp: 1, ...extra,
});
const checkpoint = (summary: string, count = 2) => ({ contextSummary: { summary, count, createdAt: 10 } });
const ids = (path: AparteMessage[]) => path.map((m) => m.id);

describe('historyFromCheckpoint', () => {
    it('returns the path as it is, with no summary, when nothing is a checkpoint', () => {
        const path = [msg('u1', 'user'), msg('a1', 'assistant')];
        const out = historyFromCheckpoint(path);
        expect(out.messages).toBe(path);
        expect(out.summary).toBeUndefined();
        expect('summary' in out).toBe(false);
    });

    it('starts at the checkpoint and hands back its summary', () => {
        const out = historyFromCheckpoint([
            msg('u1', 'user'), msg('a1', 'assistant'),
            msg('u2', 'user', checkpoint('S1')), msg('a2', 'assistant'), msg('u3', 'user'),
        ]);
        expect(out.summary).toBe('S1');
        expect(ids(out.messages)).toEqual(['u2', 'a2', 'u3']);
    });

    it('reads the LAST checkpoint when they are nested: the earlier summary is inside it', () => {
        const out = historyFromCheckpoint([
            msg('u1', 'user'), msg('a1', 'assistant'),
            msg('u2', 'user', checkpoint('S1')), msg('a2', 'assistant'),
            msg('u3', 'user', checkpoint('S2', 5)), msg('a3', 'assistant'),
        ]);
        expect(out.summary).toBe('S2');
        expect(ids(out.messages)).toEqual(['u3', 'a3']);
    });

    it('drops a legacy compaction message that came before the checkpoint', () => {
        const out = historyFromCheckpoint([
            msg('old', 'user', { compaction: true }),
            msg('u1', 'user'), msg('a1', 'assistant'),
            msg('u2', 'user', checkpoint('S')), msg('a2', 'assistant'),
        ]);
        expect(ids(out.messages)).toEqual(['u2', 'a2']);
    });

    it('keeps a legacy compaction message that comes after the checkpoint', () => {
        const out = historyFromCheckpoint([
            msg('u1', 'user', checkpoint('S')), msg('a1', 'assistant'),
            msg('old', 'user', { compaction: true }), msg('u2', 'user'),
        ]);
        expect(ids(out.messages)).toEqual(['u1', 'a1', 'old', 'u2']);
        expect(out.summary).toBe('S');
    });

    it('finds a checkpoint on the last message of the path', () => {
        const out = historyFromCheckpoint([msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user', checkpoint('S'))]);
        expect(ids(out.messages)).toEqual(['u2']);
        expect(out.summary).toBe('S');
    });

    it('reads a message whose contextSummary is explicitly undefined as no checkpoint', () => {
        const path = [msg('u1', 'user', { contextSummary: undefined }), msg('a1', 'assistant')];
        expect(historyFromCheckpoint(path).messages).toBe(path);
    });

    it('handles an empty path', () => {
        expect(historyFromCheckpoint([])).toEqual({ messages: [] });
    });
});
