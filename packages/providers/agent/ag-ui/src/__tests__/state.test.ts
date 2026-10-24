/**
 * The agent's state as the runner keeps it: a snapshot replaces it, a delta is an
 * RFC 6902 JSON Patch applied whole or not at all. The conformance corpus pins the
 * edges the protocol names; this pins the operations it does not exercise.
 */
import { describe, it, expect } from 'vitest';
import { applyStateDelta } from '../state.js';

const apply = (state: unknown, delta: unknown[]) => {
    const warnings: string[] = [];
    return { state: applyStateDelta(state, delta, (w) => warnings.push(w)), warnings };
};

describe('applyStateDelta', () => {
    it('adds, removes and replaces, in objects and arrays', () => {
        expect(apply({ a: 1, list: ['x', 'z'] }, [
            { op: 'add', path: '/b', value: 2 },
            { op: 'add', path: '/list/1', value: 'y' },
            { op: 'add', path: '/list/-', value: 'end' },
            { op: 'remove', path: '/a' },
            { op: 'replace', path: '/list/0', value: 'X' },
        ]).state).toEqual({ b: 2, list: ['X', 'y', 'z', 'end'] });
    });

    it('moves and copies by pointer, and tests a value', () => {
        expect(apply({ from: { v: 1 }, to: {} }, [
            { op: 'copy', from: '/from/v', path: '/to/copied' },
            { op: 'move', from: '/from/v', path: '/to/moved' },
            { op: 'test', path: '/to/moved', value: 1 },
        ]).state).toEqual({ from: {}, to: { copied: 1, moved: 1 } });
    });

    it('reads ~1 as "/" and ~0 as "~" in a pointer', () => {
        expect(apply({ 'a/b': { 'c~d': 1 } }, [{ op: 'replace', path: '/a~1b/c~0d', value: 2 }]).state)
            .toEqual({ 'a/b': { 'c~d': 2 } });
    });

    it('replaces the whole state through the empty pointer', () => {
        expect(apply({ a: 1 }, [{ op: 'replace', path: '', value: ['whole'] }]).state).toEqual(['whole']);
    });

    it('applies nothing when one operation fails, and says so', () => {
        const before = { n: 1 };
        const r = apply(before, [{ op: 'replace', path: '/n', value: 2 }, { op: 'test', path: '/n', value: 99 }]);
        expect(r.state).toEqual({ n: 1 });
        expect(r.warnings.join(' ')).toContain('Failed to apply state patch');
        expect(before).toEqual({ n: 1 });   // never mutated in place
    });

    it('refuses a move into its own child, and an add or replace with no value (RFC 6902 §4.4, §4.1)', () => {
        const state = { arr: [{ n: 1 }, { n: 2 }] };
        const moved = apply(state, [{ op: 'move', from: '/arr/0', path: '/arr/0/child' }]);
        expect(moved.state).toEqual(state);
        expect(moved.warnings.join(' ')).toContain('Failed to apply state patch');
        expect(apply({ a: 1 }, [{ op: 'add', path: '/b' }]).state).toEqual({ a: 1 });
        expect(apply({ a: 1 }, [{ op: 'replace', path: '/a' }]).state).toEqual({ a: 1 });
    });

    it('drops an operation RFC 6902 does not define, and applies the rest', () => {
        const r = apply({ n: 1 }, [{ op: 'increment', path: '/n' }, { op: 'replace', path: '/n', value: 5 }]);
        expect(r.state).toEqual({ n: 5 });
        expect(r.warnings.join(' ')).toContain('/delta/0');
    });
});
