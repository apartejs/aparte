/**
 * A change is shown with the lines around it, and two changes close together share a hunk.
 *
 * `git diff` keeps three unchanged lines on each side of a change and joins two hunks whose
 * context would touch; a reviewer reads the same blocks here as in their terminal. The line
 * numbers in the `@@` header are the ones a reviewer looks up in the file.
 */
import { describe, it, expect } from 'vitest';
import { diffTexts } from '../index.node.js';

const twenty = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
const text = (lines: string[]) => `${lines.join('\n')}\n`;
const edit = (at: number[]) => text(twenty.map((line, i) => (at.includes(i + 1) ? `${line}!` : line)));

describe('the hunks', () => {
    it('keep three unchanged lines on each side of a change', () => {
        const [hunk, ...rest] = diffTexts(text(twenty), edit([10])).hunks;
        expect(rest).toEqual([]);
        expect(hunk).toMatchObject({ oldStart: 7, oldCount: 7, newStart: 7, newCount: 7 });
        expect(hunk!.lines.map((l) => l.text)).toEqual(['l7', 'l8', 'l9', 'l10', 'l10!', 'l11', 'l12', 'l13']);
    });

    it('join two changes whose context touches, and split two that do not', () => {
        // Six unchanged lines between them: three after the first, three before the second.
        expect(diffTexts(text(twenty), edit([5, 12])).hunks).toHaveLength(1);
        const split = diffTexts(text(twenty), edit([5, 13])).hunks;
        expect(split.map((h) => [h.oldStart, h.oldCount])).toEqual([[2, 7], [10, 7]]);
    });

    it('take the context they are asked for, none included', () => {
        const none = diffTexts(text(twenty), edit([10]), { context: 0 }).hunks;
        expect(none).toEqual([{
            oldStart: 10, oldCount: 1, newStart: 10, newCount: 1,
            lines: [{ kind: 'del', text: 'l10', oldLine: 10 }, { kind: 'add', text: 'l10!', newLine: 10 }],
        }]);
        expect(diffTexts(text(twenty), edit([10]), { context: 1 }).hunks[0]).toMatchObject({ oldStart: 9, oldCount: 3 });
    });

    it('stop at the edges of the file', () => {
        const [first] = diffTexts(text(twenty), edit([1])).hunks;
        expect(first).toMatchObject({ oldStart: 1, oldCount: 4 });
        const [last] = diffTexts(text(twenty), edit([20])).hunks;
        expect(last).toMatchObject({ oldStart: 17, oldCount: 4, newStart: 17, newCount: 4 });
    });

    it('number the new side after what was added above', () => {
        const added = text([...twenty.slice(0, 2), 'new a', 'new b', ...twenty.slice(2)]);
        const changed = text([...twenty.slice(0, 2), 'new a', 'new b', ...twenty.slice(2, 14), 'l15!', ...twenty.slice(15)]);
        const hunks = diffTexts(added, changed).hunks;
        expect(hunks).toHaveLength(1);
        const removed = hunks[0]!.lines.find((l) => l.kind === 'del')!;
        const put = hunks[0]!.lines.find((l) => l.kind === 'add')!;
        expect([removed.oldLine, put.newLine]).toEqual([17, 17]);
        const shifted = diffTexts(text(twenty), changed).hunks;
        expect(shifted.map((h) => [h.oldStart, h.oldCount, h.newStart, h.newCount])).toEqual([[1, 5, 1, 7], [12, 7, 14, 7]]);
    });

    it('name a renamed file with both paths', () => {
        expect(diffTexts('a\n', 'b\n', { path: 'src/new.ts', oldPath: 'src/old.ts' })).toMatchObject({
            path: 'src/new.ts', oldPath: 'src/old.ts', status: 'renamed',
        });
        // The same path twice is no rename.
        expect(diffTexts('a\n', 'b\n', { path: 'same.ts', oldPath: 'same.ts' })).toMatchObject({ status: 'modified' });
        expect(diffTexts('a\n', 'b\n', { path: 'same.ts', oldPath: 'same.ts' })).not.toHaveProperty('oldPath');
    });
});
