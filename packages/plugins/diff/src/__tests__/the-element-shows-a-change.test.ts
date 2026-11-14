/**
 * `<aparte-diff>` shows a change the way a reviewer reads one.
 *
 * Each file under a header with its path and its counts, which folds it; each line with its
 * old and new numbers and a `+` or `−` that a screen reader hears as a word; the unchanged
 * runs between hunks folded, and shown on a click when the whole text is known; several
 * files one after the other. The code stays left to right in a right-to-left page.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { parseUnifiedDiff } from '../parse.js';
import { click, flush, FORTY, mount, rows } from './harness.js';

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('dir');
    aparteGlobalConfig.reset();
    vi.restoreAllMocks();
});

const EDIT = { path: 'src/parse.ts', before: 'const a = 1;\nconst b = 2;\nconst c = 3;\n', after: 'const a = 1;\nconst b = 20;\nconst c = 3;\n' };

describe('<aparte-diff>', () => {
    it('numbers each line on both sides and marks what changed', () => {
        const el = mount(EDIT);
        expect(rows(el)).toEqual([
            'context 1 1 const a = 1;',
            'del 2 · const b = 2;',
            'add · 2 const b = 20;',
            'context 3 3 const c = 3;',
        ]);
        const markers = [...el.querySelectorAll('.aparte-diff-line__marker')].map((m) => m.textContent);
        expect(markers).toEqual([' ', '−', '+', ' ']);
        // The sign is drawn for the eye and said as a word.
        for (const marker of el.querySelectorAll('.aparte-diff-line__marker')) expect(marker.getAttribute('aria-hidden')).toBe('true');
        const said = [...el.querySelectorAll('.aparte-diff-line .aparte-sr-only')].map((s) => s.textContent);
        expect(said).toEqual(['removed', 'added']);
    });

    it('heads each file with its path and its counts, said in words too, and folds it', () => {
        const el = mount(EDIT);
        const toggle = el.querySelector<HTMLButtonElement>('.aparte-diff-file__toggle')!;
        expect(toggle.querySelector('.aparte-diff-file__path')!.textContent).toBe('src/parse.ts');
        expect(el.querySelector('.aparte-diff-file__added')!.textContent).toBe('+1');
        expect(el.querySelector('.aparte-diff-file__removed')!.textContent).toBe('−1');
        expect(el.querySelector('.aparte-diff-file__stat .aparte-sr-only')!.textContent).toBe('1 line added, 1 line removed');
        const lines = el.querySelector<HTMLElement>('.aparte-diff-file__lines')!;
        expect(toggle.getAttribute('aria-controls')).toBe(lines.id);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(lines.hidden).toBe(true);
        toggle.click();
        expect(lines.hidden).toBe(false);
    });

    it('folds the unchanged runs, and shows one on a click when the whole text is known', () => {
        const el = mount(FORTY);
        expect(rows(el)).toHaveLength(8);
        const folds = [...el.querySelectorAll<HTMLButtonElement>('button.aparte-diff-fold__show')];
        expect(folds.map((b) => b.textContent)).toEqual(['Show 16 unchanged lines', 'Show 17 unchanged lines']);
        folds[0]!.click();
        const after = rows(el);
        expect(after).toHaveLength(24);
        expect(after[0]).toBe('context 1 1 const line1 = 1;');
        expect(after[15]).toBe('context 16 16 const line16 = 16;');
        expect(el.querySelectorAll('button.aparte-diff-fold__show')).toHaveLength(1);
        // The reader carries on from the first line shown, not from the top of the page.
        expect(document.activeElement).toBe(el.querySelector('.aparte-diff-line'));
        el.querySelector<HTMLButtonElement>('button.aparte-diff-fold__show')!.click();
        // Every line of the file now, the changed one twice (removed, then added).
        expect(rows(el)).toHaveLength(41);
        expect(rows(el)[40]).toBe('context 40 40 const line40 = 40;');
    });

    it("says how many lines a unified diff's text leaves out, and the section a hunk is in, without a button", () => {
        const text = '--- a/f.ts\n+++ b/f.ts\n@@ -4,3 +4,3 @@ function one() {\n a\n-b\n+B\n c\n@@ -20,3 +20,3 @@ function two() {\n x\n-y\n+Y\n z\n';
        const el = mount(text);
        expect(el.querySelectorAll('button.aparte-diff-fold__show')).toHaveLength(0);
        const folds = [...el.querySelectorAll('.aparte-diff-fold')].map((f) => [
            f.querySelector('.aparte-diff-fold__count')?.textContent ?? '', f.querySelector('.aparte-diff-fold__section')?.textContent ?? '',
        ]);
        expect(folds).toEqual([['3 unchanged lines', 'function one() {'], ['13 unchanged lines', 'function two() {']]);
        expect(rows(el)[0]).toBe('context 4 4 a');
    });

    it('shows several files one after the other, each with what happened to it', () => {
        const text = 'diff --git a/new.md b/new.md\nnew file mode 100644\n--- /dev/null\n+++ b/new.md\n@@ -0,0 +1 @@\n+hello\n'
            + 'diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye\n'
            + 'diff --git a/a.ts b/b.ts\nsimilarity index 100%\nrename from a.ts\nrename to b.ts\n'
            + 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n';
        const el = mount(text);
        const files = [...el.querySelectorAll('.aparte-diff-file')];
        expect(files.map((f) => f.getAttribute('data-path'))).toEqual(['new.md', 'gone.txt', 'b.ts', 'logo.png']);
        expect(files.map((f) => f.querySelector('.aparte-diff-file__status')?.textContent ?? '')).toEqual(['Added', 'Deleted', 'Renamed', '']);
        expect(files[2]!.querySelector('.aparte-diff-file__path')!.textContent).toContain('a.ts');
        expect(files[2]!.querySelector('.aparte-diff-file__path')!.textContent).toContain('b.ts');
        expect(files[3]!.querySelector('.aparte-diff-binary')!.textContent).toBe('Binary file, no lines to show');
        // A list of files and texts reads the same.
        const list = mount([parseUnifiedDiff(text)[0]!, EDIT]);
        expect([...list.querySelectorAll('.aparte-diff-file')].map((f) => f.getAttribute('data-path'))).toEqual(['new.md', 'src/parse.ts']);
        // Two texts, a side of which is not there: created, deleted.
        const texts = mount([{ path: 'made.md', before: null, after: 'hi\n' }, { path: 'gone.md', before: 'bye\n', after: null }]);
        expect([...texts.querySelectorAll('.aparte-diff-file__status')].map((s) => s.textContent)).toEqual(['Added', 'Deleted']);
        expect(rows(texts)).toEqual(['add · 1 hi', 'del 1 · bye']);
    });

    it('says when there is no change, and when a file ends without a newline', () => {
        expect(mount({ path: 'same.txt', before: 'x\n', after: 'x\n' }).querySelector('.aparte-diff-file .aparte-diff-empty, .aparte-diff-empty')!.textContent).toBe('No changes');
        expect(mount([]).querySelector('.aparte-diff-empty')!.textContent).toBe('No changes');
        const el = mount({ path: 'f', before: 'a\nb', after: 'a\nc' });
        expect([...el.querySelectorAll('.aparte-diff-eof')].map((e) => e.textContent)).toEqual(['No newline at end of file', 'No newline at end of file']);
    });

    it("colours each side with the chat's highlighter, once, in the file's language", async () => {
        const asked: Array<[string, string]> = [];
        aparteGlobalConfig.setHighlightProvider((code, lang) => {
            asked.push([lang, code]);
            const lines = code.split('\n').map((line) => `<span class="line"><span class="tok">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></span>`);
            return `<pre class="shiki"><code>${lines.join('\n')}</code></pre>`;
        });
        const el = mount(EDIT);
        await flush();
        await flush();
        expect(asked.map(([lang]) => lang)).toEqual(['typescript', 'typescript']);
        expect(asked[0]![1]).toBe(EDIT.before.trimEnd());
        expect(asked[1]![1]).toBe(EDIT.after.trimEnd());
        const codes = [...el.querySelectorAll('.aparte-diff-line__code')];
        expect(codes.map((c) => c.querySelector('.tok')?.textContent)).toEqual(['const a = 1;', 'const b = 2;', 'const b = 20;', 'const c = 3;']);
        // Each line wears the classes of the highlighter's block: its stylesheet colours the tokens under them.
        for (const code of codes) expect(code.className).toBe('aparte-diff-line__code shiki');
        // A fold shown later is coloured too, from the same pass.
        const long = mount(FORTY);
        await flush();
        await flush();
        long.querySelector<HTMLButtonElement>('button.aparte-diff-fold__show')!.click();
        expect(long.querySelector('.aparte-diff-line__code .tok')?.textContent).toBe('const line1 = 1;');
    });

    it('colours the lines a unified diff holds, and stays plain text with no highlighter', async () => {
        const plain = mount(EDIT);
        await flush();
        for (const code of plain.querySelectorAll('.aparte-diff-line__code')) expect(code.children).toHaveLength(0);
        aparteGlobalConfig.setHighlightProvider((code) => `<pre><code>${code.split('\n').map((l) => `<span class="line"><b>${l}</b></span>`).join('\n')}</code></pre>`);
        // A highlighter installed later colours what is already on screen.
        await flush();
        await flush();
        expect(plain.querySelector('.aparte-diff-line__code b')?.textContent).toBe('const a = 1;');
        const text = mount('--- a/x.py\n+++ b/x.py\n@@ -1,2 +1,2 @@\n a = 1\n-b = 2\n+b = 3\n');
        await flush();
        await flush();
        expect([...text.querySelectorAll('.aparte-diff-line__code b')].map((b) => b.textContent)).toEqual(['a = 1', 'b = 2', 'b = 3']);
    });

    it('colours the lines once a highlighter that failed is replaced by one that works', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        aparteGlobalConfig.setHighlightProvider(() => Promise.reject(new Error('grammars still loading')));
        const el = mount(EDIT);
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code')!.children).toHaveLength(0);
        aparteGlobalConfig.setHighlightProvider((code) => `<pre><code>${code.split('\n').map((l) => `<span class="line"><b>${l}</b></span>`).join('\n')}</code></pre>`);
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code b')?.textContent).toBe('const a = 1;');
    });

    it('colours the lines again when the highlighter changes', async () => {
        const wrap = (tag: string) => (code: string) => `<pre><code>${code.split('\n').map((l) => `<span class="line"><${tag}>${l}</${tag}></span>`).join('\n')}</code></pre>`;
        aparteGlobalConfig.setHighlightProvider(wrap('i'));
        const el = mount(EDIT);
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code i')?.textContent).toBe('const a = 1;');
        aparteGlobalConfig.setHighlightProvider(wrap('b'));
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code i')).toBeNull();
        expect([...el.querySelectorAll('.aparte-diff-line__code b')].map((b) => b.textContent)).toEqual(['const a = 1;', 'const b = 2;', 'const b = 20;', 'const c = 3;']);
    });

    it('keeps a line plain when the highlighter cannot cut it line for line', async () => {
        aparteGlobalConfig.setHighlightProvider((code) => `<pre><code>${code}</code></pre>`);
        const el = mount(EDIT);
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code')!.children).toHaveLength(0);
        expect(el.querySelector('.aparte-diff-line__code')!.textContent).toBe('const a = 1;');
    });

    it('keeps the code left to right in a right-to-left page', () => {
        document.documentElement.setAttribute('dir', 'rtl');
        const el = mount(EDIT);
        expect(el.querySelector('.aparte-diff-file__lines')!.getAttribute('dir')).toBe('ltr');
        // The header is the page's: its words read in the page's direction.
        expect(el.querySelector('.aparte-diff-file__head')!.hasAttribute('dir')).toBe(false);
    });

    it("draws its words again in the chat's language", () => {
        const el = mount(FORTY);
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        expect(el.querySelector('button.aparte-diff-fold__show')!.textContent).toBe('Afficher 16 lignes inchangées');
        expect(el.querySelector('.aparte-diff-file__stat .aparte-sr-only')!.textContent).toBe('1 ligne ajoutée, 1 ligne supprimée');
    });

    it('draws again when it is given a new change, and nothing when it is given none', () => {
        const el = mount(EDIT);
        el.diff = { path: 'other.txt', before: 'x\n', after: 'y\n' };
        expect(rows(el)).toEqual(['del 1 · x', 'add · 1 y']);
        el.diff = null;
        expect(el.querySelector('.aparte-diff-file')).toBeNull();
        expect(el.diff).toBeNull();
    });

    it('puts its sheet on the page once', () => {
        mount(EDIT);
        mount(EDIT);
        expect(document.querySelectorAll('#aparte-diff-styles')).toHaveLength(1);
    });

    it('lets the reader fold a file with a click on its header only', () => {
        const el = mount(EDIT);
        click(el.querySelector('.aparte-diff-file__stat')!);
        expect(el.querySelector<HTMLElement>('.aparte-diff-file__lines')!.hidden).toBe(false);
    });
});
