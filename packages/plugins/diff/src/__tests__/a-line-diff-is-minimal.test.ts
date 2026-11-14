/**
 * The line diff is a true account of the change, and the shortest one.
 *
 * A diff that is right but long — a block deleted and added again around one changed line —
 * shows a reviewer forty changed lines for one. Myers' algorithm finds the fewest added and
 * removed lines; this checks it against the textbook longest common subsequence on every small
 * input, and checks on known cases that a removal is shown before its addition, as `git diff`
 * shows it.
 */
import { describe, it, expect } from 'vitest';
import { diffLines } from '../compute.js';
import { diffTexts } from '../index.node.js';
import { apply, linesOf } from './apply.js';

/** The length of the longest common subsequence, by the textbook table. */
function lcs(a: string[], b: string[]): number {
    const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            t[i]![j] = a[i - 1] === b[j - 1] ? t[i - 1]![j - 1]! + 1 : Math.max(t[i - 1]![j]!, t[i]![j - 1]!);
        }
    }
    return t[a.length]![b.length]!;
}

/** A deterministic generator, so a failure names an input that can be replayed. */
function random(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
}

describe('the line diff', () => {
    it('finds the fewest added and removed lines, on every small input', () => {
        const next = random(42);
        for (let run = 0; run < 400; run++) {
            const a = Array.from({ length: Math.floor(next() * 9) }, () => 'abc'[Math.floor(next() * 3)]!);
            const b = Array.from({ length: Math.floor(next() * 9) }, () => 'abc'[Math.floor(next() * 3)]!);
            const edits = diffLines(a, b);
            const changed = edits.filter((e) => e !== 'eq').length;
            expect(changed, `${a.join('')} → ${b.join('')}`).toBe(a.length + b.length - 2 * lcs(a, b));
            // And it is the change: the old lines it keeps and removes are the old text, in order.
            expect(edits.filter((e) => e !== 'add').length).toBe(a.length);
            expect(edits.filter((e) => e !== 'del').length).toBe(b.length);
        }
    });

    it('turns the old text into the new one, through its hunks', () => {
        const next = random(7);
        for (let run = 0; run < 200; run++) {
            const words = ['let a = 1;', 'let b = 2;', 'return a + b;', '}', ''];
            const before = Array.from({ length: Math.floor(next() * 30) }, () => words[Math.floor(next() * words.length)]!).join('\n');
            const after = Array.from({ length: Math.floor(next() * 30) }, () => words[Math.floor(next() * words.length)]!).join('\n');
            const file = diffTexts(`${before}\n`, `${after}\n`, { path: 'x.ts', context: Math.floor(next() * 4) });
            expect(apply(`${before}\n`, file)).toEqual(linesOf(`${after}\n`));
        }
    });

    it('shows one changed line as one removal then one addition', () => {
        const file = diffTexts('a\nb\nc\n', 'a\nB\nc\n', { path: 'f.txt' });
        expect(file).toMatchObject({ path: 'f.txt', status: 'modified', added: 1, removed: 1 });
        expect(file.hunks).toEqual([{
            oldStart: 1, oldCount: 3, newStart: 1, newCount: 3,
            lines: [
                { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
                { kind: 'del', text: 'b', oldLine: 2 },
                { kind: 'add', text: 'B', newLine: 2 },
                { kind: 'context', text: 'c', oldLine: 3, newLine: 3 },
            ],
        }]);
    });

    it('puts every removal of a block before its additions', () => {
        const file = diffTexts('x\na\nb\ny\n', 'x\nA\nB\nC\ny\n');
        expect(file.hunks[0]!.lines.map((l) => `${l.kind}:${l.text}`)).toEqual([
            'context:x', 'del:a', 'del:b', 'add:A', 'add:B', 'add:C', 'context:y',
        ]);
    });

    it('says nothing changed for two equal texts', () => {
        expect(diffTexts('same\n', 'same\n')).toEqual({ path: '', status: 'modified', added: 0, removed: 0, hunks: [] });
    });

    it('numbers a file that starts empty from the line before it', () => {
        const file = diffTexts('', 'one\ntwo\n', { path: 'new.md' });
        expect(file.hunks).toEqual([{
            oldStart: 0, oldCount: 0, newStart: 1, newCount: 2,
            lines: [{ kind: 'add', text: 'one', newLine: 1 }, { kind: 'add', text: 'two', newLine: 2 }],
        }]);
        expect(diffTexts('gone\n', '').hunks).toEqual([{
            oldStart: 1, oldCount: 1, newStart: 0, newCount: 0, lines: [{ kind: 'del', text: 'gone', oldLine: 1 }],
        }]);
    });

    it('reads Windows line endings as line endings, not as text', () => {
        expect(diffTexts('a\r\nb\r\n', 'a\nb\n').hunks).toEqual([]);
        const file = diffTexts('a\r\nb\r\n', 'a\r\nc\r\n');
        expect(file.hunks[0]!.lines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
    });

    it('shows a newline added at the end of a file as the last line changed', () => {
        const file = diffTexts('a\nb', 'a\nb\n');
        expect(file.hunks[0]!.lines).toEqual([
            { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
            { kind: 'del', text: 'b', oldLine: 2, noNewline: true },
            { kind: 'add', text: 'b', newLine: 2 },
        ]);
        // Both sides without one: an unchanged last line that says so.
        const both = diffTexts('a\nb', 'A\nb');
        expect(both.hunks[0]!.lines.at(-1)).toEqual({ kind: 'context', text: 'b', oldLine: 2, newLine: 2, noNewline: true });
    });

    it('stays a true account on two large texts with nothing in common, and returns in time', () => {
        const before = Array.from({ length: 4000 }, (_, i) => `old line ${i}`).join('\n');
        const after = Array.from({ length: 4000 }, (_, i) => `new line ${i}`).join('\n');
        const start = Date.now();
        const file = diffTexts(before, after);
        expect(Date.now() - start).toBeLessThan(3000);
        expect(file).toMatchObject({ added: 4000, removed: 4000 });
        expect(apply(before, file)).toEqual(linesOf(after));
    });

    it('stays minimal on a large file with a few edits', () => {
        const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
        const edited = [...lines];
        edited.splice(1500, 1, 'changed');
        edited.splice(10, 0, 'inserted');
        edited.splice(2800, 2);
        const file = diffTexts(lines.join('\n'), edited.join('\n'));
        expect(file).toMatchObject({ added: 2, removed: 3 });
        expect(apply(lines.join('\n'), file)).toEqual(edited);
    });
});
