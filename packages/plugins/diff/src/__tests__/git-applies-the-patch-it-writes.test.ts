/**
 * What `formatUnifiedDiff` writes, `git apply` takes — checked against git itself.
 *
 * Its JSDoc says so, and a patch a server sends is only worth sending if it applies. git refuses
 * a created file whose header does not say `new file mode`, and a file `diffTexts` creates must
 * say it is created: a side that does not exist (`null`) is not an empty file (`''`). Each case
 * is checked with `git apply --check` in a repository of its own, then the whole patch is applied
 * and the files read back; and git's own rename reads back as one. Skipped where there is no git.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffTexts, formatUnifiedDiff, parseUnifiedDiff } from '../index.node.js';
import type { AparteDiffFile } from '../types.js';

const hasGit = (() => {
    try {
        execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
        return true;
    } catch {
        return false;
    }
})();

const TEN = Array.from({ length: 10 }, (_, i) => `row ${i + 1}`).join('\n') + '\n';
const FILES: Record<string, string> = {
    'keep.txt': 'a\nb\nc\n',
    'gone.txt': 'bye\n',
    'empty.txt': '',
    'blank.txt': '',
    'old.txt': TEN,
    'same.txt': 'unchanged\n',
};

describe.skipIf(!hasGit)('a patch formatUnifiedDiff writes', () => {
    let repo = '';
    // The user's global hooks and signing stay out of a scratch repository.
    const git = (args: string[], input?: string): string => execFileSync('git', ['-c', `core.hooksPath=${join(repo, '.no-hooks')}`, '-c', 'commit.gpgsign=false', ...args], {
        cwd: repo, encoding: 'utf8', windowsHide: true, input, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const check = (files: AparteDiffFile | AparteDiffFile[]): void => {
        git(['apply', '--check', '-'], formatUnifiedDiff(files));
    };

    beforeAll(() => {
        repo = mkdtempSync(join(tmpdir(), 'aparte-diff-'));
        mkdirSync(join(repo, '.no-hooks'));
        git(['init', '-q']);
        git(['config', 'core.autocrlf', 'false']);
        git(['config', 'user.email', 'test@example.invalid']);
        git(['config', 'user.name', 'test']);
        for (const [name, text] of Object.entries(FILES)) writeFileSync(join(repo, name), text);
        git(['add', ...Object.keys(FILES)]);
        git(['commit', '-q', '-m', 'start']);
    });
    afterAll(() => {
        if (repo) rmSync(repo, { recursive: true, force: true });
    });

    const MODIFIED = diffTexts('a\nb\nc\n', 'a\nB\nc\n', { path: 'keep.txt' });
    const ADDED = diffTexts(null, 'one\ntwo\n', { path: 'new.txt' });
    const DELETED = diffTexts('bye\n', null, { path: 'gone.txt' });
    const RENAMED = diffTexts(TEN, TEN.replace('row 5', 'row five'), { path: 'moved.txt', oldPath: 'old.txt' });
    const FILLED = diffTexts('', 'now something\n', { path: 'empty.txt' });

    it('says a side that does not exist is a file created or deleted, and an empty one is a file', () => {
        expect(ADDED).toMatchObject({ path: 'new.txt', status: 'added', added: 2, removed: 0 });
        expect(DELETED).toMatchObject({ path: 'gone.txt', status: 'deleted', added: 0, removed: 1 });
        expect(FILLED).toMatchObject({ path: 'empty.txt', status: 'modified', added: 1, removed: 0 });
        expect(diffTexts(null, '', { path: 'nothing.txt' })).toEqual({ path: 'nothing.txt', status: 'added', added: 0, removed: 0, hunks: [] });
    });

    it.each([
        ['a modified file', MODIFIED],
        ['a created file', ADDED],
        ['a deleted file', DELETED],
        ['a renamed file with a change', RENAMED],
        ['a pure rename', diffTexts('unchanged\n', 'unchanged\n', { path: 'renamed.txt', oldPath: 'same.txt' })],
        ['an empty file that gains a line', FILLED],
        ['an empty file created', diffTexts(null, '', { path: 'also-empty.txt' })],
        ['an empty file deleted', diffTexts('', null, { path: 'blank.txt' })],
        ['a created file read back from git diff', parseUnifiedDiff('diff --git a/n.md b/n.md\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/n.md\n@@ -0,0 +1 @@\n+hi\n')[0]!],
    ])('is one git applies: %s', (_name, file) => {
        expect(() => check(file)).not.toThrow();
    });

    it('applied, gives the new texts, and git reads its own rename back as one', () => {
        git(['apply', '-'], formatUnifiedDiff([MODIFIED, ADDED, DELETED, RENAMED, FILLED]));
        const read = (name: string) => readFileSync(join(repo, name), 'utf8');
        expect(read('keep.txt')).toBe('a\nB\nc\n');
        expect(read('new.txt')).toBe('one\ntwo\n');
        expect(existsSync(join(repo, 'gone.txt'))).toBe(false);
        expect(existsSync(join(repo, 'old.txt'))).toBe(false);
        expect(read('moved.txt')).toBe(TEN.replace('row 5', 'row five'));
        expect(read('empty.txt')).toBe('now something\n');

        git(['add', '-A']);
        const files = parseUnifiedDiff(git(['diff', '--cached', '-M']));
        const byPath = Object.fromEntries(files.map((f) => [f.path, [f.status, f.oldPath]]));
        expect(byPath).toEqual({
            'empty.txt': ['modified', undefined],
            'gone.txt': ['deleted', undefined],
            'keep.txt': ['modified', undefined],
            'moved.txt': ['renamed', 'old.txt'],
            'new.txt': ['added', undefined],
        });
    });
});
