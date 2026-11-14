/**
 * A unified diff — what `git diff` prints, what an agent returns — reads as the same files.
 *
 * The fixture is the shape of a real multi-file `git diff`: a modified file with a section
 * name after its `@@`, a new file, a deleted one, a rename with changes, a pure rename, a
 * binary file, and an unchanged last line without a newline. The same text with Windows line
 * endings reads the same. And what `formatUnifiedDiff` writes reads back as what it was given.
 */
import { describe, it, expect } from 'vitest';
import { diffTexts, formatUnifiedDiff, parseUnifiedDiff } from '../index.node.js';
import { apply, linesOf } from './apply.js';

const GIT_DIFF = `diff --git a/src/parse.ts b/src/parse.ts
index 3b18e51..a9c4f2d 100644
--- a/src/parse.ts
+++ b/src/parse.ts
@@ -12,7 +12,7 @@ export function parse(input: string): number {
     let total = 0;
     const rest = text.replace(TOKEN, (_, amount: string, unit: Unit) => {
-        total += parseInt(amount, 10) * UNITS[unit];
+        total += Number(amount) * UNITS[unit];
         return '';
     });
     if (rest.trim()) throw new RangeError('Cannot parse');
diff --git a/docs/notes.md b/docs/notes.md
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/docs/notes.md
@@ -0,0 +1,2 @@
+# Notes
+Decimal amounts are read with Number.
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 9daeafb..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-gone
diff --git a/src/format.ts b/src/units.ts
similarity index 90%
rename from src/format.ts
rename to src/units.ts
index 1111111..2222222 100644
--- a/src/format.ts
+++ b/src/units.ts
@@ -1,3 +1,3 @@
 export const MS = 1;
-export const S = 1000
+export const S = 1000;
 export const M = 60000;
\\ No newline at end of file
diff --git a/img.png b/img.png
index 1234567..89abcde 100644
Binary files a/img.png and b/img.png differ
diff --git a/LICENSE b/LICENSE.md
similarity index 100%
rename from LICENSE
rename to LICENSE.md
`;

describe('parseUnifiedDiff', () => {
    it('reads every file of a multi-file git diff, in order', () => {
        const files = parseUnifiedDiff(GIT_DIFF);
        expect(files.map((f) => [f.path, f.oldPath, f.status, f.added, f.removed])).toEqual([
            ['src/parse.ts', undefined, 'modified', 1, 1],
            ['docs/notes.md', undefined, 'added', 2, 0],
            ['old.txt', undefined, 'deleted', 0, 1],
            ['src/units.ts', 'src/format.ts', 'renamed', 1, 1],
            ['img.png', undefined, 'modified', 0, 0],
            ['LICENSE.md', 'LICENSE', 'renamed', 0, 0],
        ]);
    });

    it('numbers each line from its hunk header, and keeps the section name', () => {
        const [parse] = parseUnifiedDiff(GIT_DIFF);
        const hunk = parse!.hunks[0]!;
        expect(hunk).toMatchObject({ oldStart: 12, oldCount: 7, newStart: 12, newCount: 7, section: 'export function parse(input: string): number {' });
        expect(hunk.lines.map((l) => [l.kind, l.oldLine, l.newLine])).toEqual([
            ['context', 12, 12], ['context', 13, 13], ['del', 14, undefined], ['add', undefined, 14],
            ['context', 15, 15], ['context', 16, 16], ['context', 17, 17],
        ]);
        expect(hunk.lines[2]!.text).toBe('        total += parseInt(amount, 10) * UNITS[unit];');
    });

    it('reads a new file, a deleted one and a one-line hunk with its count left out', () => {
        const [, added, deleted] = parseUnifiedDiff(GIT_DIFF);
        expect(added!.hunks[0]).toMatchObject({ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 });
        expect(deleted!.hunks).toEqual([{ oldStart: 1, oldCount: 1, newStart: 0, newCount: 0, lines: [{ kind: 'del', text: 'gone', oldLine: 1 }] }]);
    });

    it('marks the line a file ends on without a newline', () => {
        const renamed = parseUnifiedDiff(GIT_DIFF)[3]!;
        expect(renamed.hunks[0]!.lines.at(-1)).toEqual({ kind: 'context', text: 'export const M = 60000;', oldLine: 3, newLine: 3, noNewline: true });
        const one = parseUnifiedDiff('--- a/f\n+++ b/f\n@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n')[0]!;
        expect(one.hunks[0]!.lines.map((l) => [l.kind, l.text, l.noNewline ?? false])).toEqual([
            ['context', 'a', false], ['del', 'b', true], ['add', 'b', false], ['add', 'c', false],
        ]);
    });

    it('says a binary file changed, with no line', () => {
        expect(parseUnifiedDiff(GIT_DIFF)[4]).toEqual({ path: 'img.png', status: 'modified', added: 0, removed: 0, hunks: [], binary: true });
    });

    it('reads Windows line endings the same', () => {
        expect(parseUnifiedDiff(GIT_DIFF.replace(/\n/g, '\r\n'))).toEqual(parseUnifiedDiff(GIT_DIFF));
    });

    it('reads a removed line that starts with dashes as a line, not as a file header', () => {
        const files = parseUnifiedDiff('--- a/q.sql\n+++ b/q.sql\n@@ -1,2 +1,1 @@\n--- a comment\n SELECT 1;\n');
        expect(files).toHaveLength(1);
        expect(files[0]!.hunks[0]!.lines).toEqual([
            { kind: 'del', text: '-- a comment', oldLine: 1 },
            { kind: 'context', text: 'SELECT 1;', oldLine: 2, newLine: 1 },
        ]);
    });

    it("reads plain diff -u headers, their dates, and a diff with no git line", () => {
        const files = parseUnifiedDiff('--- notes.txt\t2026-11-13 10:00:00.000000000 +0100\n+++ notes.txt\t2026-11-14 09:12:00.000000000 +0100\n@@ -1 +1 @@\n-draft\n+final\n');
        expect(files).toEqual([{
            path: 'notes.txt', status: 'modified', added: 1, removed: 1,
            hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: [{ kind: 'del', text: 'draft', oldLine: 1 }, { kind: 'add', text: 'final', newLine: 1 }] }],
        }]);
    });

    it('skips what is not a diff around it: a commit message, a blank line between files', () => {
        const mail = `From 3b18e51 Mon Sep 17 00:00:00 2001\nSubject: [PATCH] Fix #42\n\n---\n src/parse.ts | 2 +-\n\n${GIT_DIFF}\n-- \n2.43.0\n`;
        expect(parseUnifiedDiff(mail).map((f) => f.path)).toEqual(parseUnifiedDiff(GIT_DIFF).map((f) => f.path));
    });

    it('keeps an empty unchanged line a tool trimmed to nothing', () => {
        const files = parseUnifiedDiff('--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n');
        expect(files[0]!.hunks[0]!.lines.map((l) => [l.kind, l.text])).toEqual([['context', 'a'], ['context', ''], ['del', 'b'], ['add', 'B']]);
    });

    it('reads nothing from a text that holds no diff', () => {
        expect(parseUnifiedDiff('')).toEqual([]);
        expect(parseUnifiedDiff('Just a sentence.\nAnd another.')).toEqual([]);
    });

    it('reads a quoted path, as git writes one with a space in it', () => {
        const [file] = parseUnifiedDiff('diff --git "a/my notes.md" "b/my notes.md"\n--- "a/my notes.md"\n+++ "b/my notes.md"\n@@ -1 +1 @@\n-a\n+b\n');
        expect(file!.path).toBe('my notes.md');
    });

    it('reads a path git wrote as escaped bytes, and one with a space and no quotes', () => {
        const [accented] = parseUnifiedDiff('diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"\nold mode 100644\nnew mode 100755\n');
        expect(accented).toEqual({ path: 'café.md', status: 'modified', added: 0, removed: 0, hunks: [] });
        const [spaced] = parseUnifiedDiff('diff --git a/my notes.md b/my notes.md\nold mode 100644\nnew mode 100755\n');
        expect(spaced!.path).toBe('my notes.md');
        const [moved] = parseUnifiedDiff('diff --git a/old name.md b/new.md\nold mode 100644\nnew mode 100755\n');
        expect([moved!.path, moved!.oldPath, moved!.status]).toEqual(['new.md', 'old name.md', 'renamed']);
    });
});

describe('formatUnifiedDiff', () => {
    it('writes what parseUnifiedDiff reads back', () => {
        const files = [
            diffTexts('a\nb\nc\n', 'a\nB\nc\n', { path: 'src/a.ts' }),
            diffTexts('one\ntwo', 'one\ntwo\nthree', { path: 'src/new.ts', oldPath: 'src/old.ts' }),
            parseUnifiedDiff(GIT_DIFF)[1]!,
            parseUnifiedDiff(GIT_DIFF)[2]!,
        ];
        expect(parseUnifiedDiff(formatUnifiedDiff(files))).toEqual(files);
    });

    it('writes git headers, /dev/null for a side that does not exist, and the counts git leaves out', () => {
        const text = formatUnifiedDiff(diffTexts('x\n', 'y\n', { path: 'f.txt' }));
        expect(text).toBe('diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-x\n+y\n');
        const created = formatUnifiedDiff(parseUnifiedDiff(GIT_DIFF)[1]!);
        expect(created).toContain('--- /dev/null\n+++ b/docs/notes.md\n@@ -0,0 +1,2 @@\n');
        const renamed = formatUnifiedDiff(parseUnifiedDiff(GIT_DIFF)[5]!);
        expect(renamed).toBe('diff --git a/LICENSE b/LICENSE.md\nrename from LICENSE\nrename to LICENSE.md\n');
    });

    it('writes a binary file as git does, and quotes a path git would quote', () => {
        expect(formatUnifiedDiff({ path: 'logo.png', added: 0, removed: 0, hunks: [], binary: true }))
            .toBe('diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n');
        expect(formatUnifiedDiff({ path: 'new.bin', status: 'added', added: 0, removed: 0, hunks: [], binary: true }))
            .toContain('Binary files /dev/null and b/new.bin differ');
        expect(formatUnifiedDiff({ path: 'old.bin', status: 'deleted', added: 0, removed: 0, hunks: [], binary: true }))
            .toContain('Binary files a/old.bin and /dev/null differ');
        const quoted = diffTexts('a\n', 'b\n', { path: 'say "hi"\\.txt' });
        const text = formatUnifiedDiff(quoted);
        expect(text.split('\n')[0]).toBe('diff --git "a/say \\"hi\\"\\\\.txt" "b/say \\"hi\\"\\\\.txt"');
        expect(parseUnifiedDiff(text)[0]!.path).toBe('say "hi"\\.txt');
        expect(formatUnifiedDiff([])).toBe('');
    });

    it('writes a patch that turns the old text into the new one', () => {
        const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
        const after = before.replace('line 3', 'line three').replace('line 30', 'line thirty');
        const [file] = parseUnifiedDiff(formatUnifiedDiff(diffTexts(before, after, { path: 'f' })));
        expect(apply(before, file!)).toEqual(linesOf(after));
    });
});
