import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../json-repair';

describe('safeJsonParse', () => {
    it('parses valid JSON unchanged', () => {
        expect(safeJsonParse('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
        expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('repairs a trailing comma before a closer', () => {
        expect(safeJsonParse('[1, 2, 3,]')).toEqual([1, 2, 3]);
        expect(safeJsonParse('{"a": 1,}')).toEqual({ a: 1 });
        expect(safeJsonParse('{"a": [1, 2,], }')).toEqual({ a: [1, 2] });
    });

    it('collapses duplicate closing brackets (small-LLM noise)', () => {
        expect(safeJsonParse('{"a": [1, 2]]}')).toEqual({ a: [1, 2] });
        expect(safeJsonParse('{"a": 1}}')).toEqual({ a: 1 });
    });

    it('repairs both trailing commas AND duplicate closers together', () => {
        expect(safeJsonParse('{"items": [1, 2,]]}')).toEqual({ items: [1, 2] });
    });

    it('never touches commas or brackets inside string values', () => {
        expect(safeJsonParse('{"s": "a, b]}"}')).toEqual({ s: 'a, b]}' });
        expect(safeJsonParse('{"s": "trailing,"}')).toEqual({ s: 'trailing,' });
    });

    it('respects escaped quotes inside strings', () => {
        expect(safeJsonParse('{"s": "he said \\"hi\\","}')).toEqual({ s: 'he said "hi",' });
    });

    it('returns null when no repair yields valid JSON', () => {
        expect(safeJsonParse('not json at all')).toBeNull();
        expect(safeJsonParse('{"a": }')).toBeNull();
        expect(safeJsonParse('')).toBeNull();
    });

    it('handles nested structures with mixed noise', () => {
        expect(safeJsonParse('{"a": {"b": [1,]}, "c": [{"d": 2,},]}'))
            .toEqual({ a: { b: [1] }, c: [{ d: 2 }] });
    });
});
