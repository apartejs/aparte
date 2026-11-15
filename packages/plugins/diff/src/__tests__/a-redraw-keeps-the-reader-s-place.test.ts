/**
 * What the reader was doing survives a redraw.
 *
 * The view draws its words again when the chat's language changes, and its comments when the
 * app hands back a new list. The reader's focus, the field they were writing in and the lines
 * they picked stay where they were.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { click, flush, FORTY, gutter, mount } from './harness.js';

afterEach(() => {
    document.body.replaceChildren();
    aparteGlobalConfig.reset();
});

const switchLanguage = () => aparteGlobalConfig.extendLocale({ tag: 'fr' });

describe('a redraw', () => {
    it('keeps the focus on the line number it was on', () => {
        const el = mount(FORTY, { commentable: '' });
        gutter(el, 'add', 20).focus();
        switchLanguage();
        expect(document.activeElement).toBe(gutter(el, 'add', 20));
        expect(gutter(el, 'add', 20).getAttribute('aria-label')).toBe('Ligne ajoutée 20');
    });

    it('keeps the field, its text and its lines, and the focus in it', () => {
        const el = mount(FORTY, { commentable: '' });
        click(gutter(el, 'context', 18));
        click(gutter(el, 'add', 20), { shiftKey: true });
        const input = el.querySelector('textarea')!;
        input.value = 'half written';
        el.comments = [{ path: 'src/long.ts', side: 'new', startLine: 17, endLine: 17, text: 'Earlier', state: 'sent' }];
        switchLanguage();
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe('half written');
        expect(el.querySelector('form label')!.textContent).toBe('Commenter les lignes 18 à 20');
        expect(el.querySelectorAll('.aparte-diff-line[data-selected]')).toHaveLength(4);
        expect(el.querySelector('.aparte-diff-comment__state')!.textContent).toBe('Envoyé');
    });

    it('keeps the focus on a fold button and on a file header', () => {
        const el = mount(FORTY);
        const fold = el.querySelector<HTMLButtonElement>('.aparte-diff-fold__show[data-gap="1"]')!;
        fold.focus();
        switchLanguage();
        expect(document.activeElement).toBe(el.querySelector('.aparte-diff-fold__show[data-gap="1"]'));
        el.querySelector<HTMLButtonElement>('.aparte-diff-file__toggle')!.focus();
        aparteGlobalConfig.extendLocale({ tag: 'de' });
        expect(document.activeElement).toBe(el.querySelector('.aparte-diff-file__toggle'));
        expect(el.querySelector('.aparte-diff-fold__show')!.textContent).toBe('16 unveränderte Zeilen anzeigen');
    });

    it('keeps a folded file folded', () => {
        const el = mount(FORTY);
        el.querySelector<HTMLButtonElement>('.aparte-diff-file__toggle')!.click();
        switchLanguage();
        expect(el.querySelector<HTMLElement>('.aparte-diff-file__lines')!.hidden).toBe(true);
        expect(el.querySelector('.aparte-diff-file__toggle')!.getAttribute('aria-expanded')).toBe('false');
    });

    // A wrapper hands the change again on every render of the app around it: the same text, or
    // the same object, perhaps mutated in place. It is drawn again from it, the reader kept.
    it('keeps the field, the selection, the folds and the focus when handed the change it shows', () => {
        const change = { ...FORTY };
        const el = mount(change, { commentable: '' });
        el.querySelector<HTMLButtonElement>('.aparte-diff-fold__show[data-gap="1"]')!.click();
        click(gutter(el, 'context', 18));
        click(gutter(el, 'add', 20), { shiftKey: true });
        const input = el.querySelector('textarea')!;
        input.value = 'half written';
        const folds = el.querySelectorAll('.aparte-diff-fold__show').length;

        el.diff = change;
        expect(el.querySelector('textarea')).toBe(input);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe('half written');
        expect(el.querySelectorAll('.aparte-diff-line[data-selected]')).toHaveLength(4);
        expect(el.querySelectorAll('.aparte-diff-fold__show')).toHaveLength(folds);

        // An inline `{ path, before, after }` is a new object on every render: equal is the same.
        el.diff = { ...change };
        expect(el.querySelector('textarea')).toBe(input);
        expect(el.querySelectorAll('.aparte-diff-line[data-selected]')).toHaveLength(4);

        el.diff = { ...change, after: change.after.replace('2000', '3000') };
        expect(el.querySelector('textarea'), 'another change lets go of the field').toBeNull();
    });

    it('draws a change mutated in place, the field kept', () => {
        const change = { ...FORTY };
        const el = mount(change, { commentable: '' });
        click(gutter(el, 'add', 20));
        const input = el.querySelector('textarea')!;
        change.after = change.after.replace('const line21 = 21;', 'const line21 = 21000;');
        el.diff = change;
        expect(el.querySelector('textarea')).toBe(input);
        expect(el.textContent).toContain('21000');
    });

    it('colours a change mutated in place from its new text, never with the old colours', async () => {
        // A highlighter that colours only the first change it is given: the second pass yields nothing.
        let calls = 0;
        aparteGlobalConfig.setHighlightProvider((code) => (++calls <= 2
            ? `<pre><code>${code.split('\n').map((l) => `<span class="line"><b>${l}</b></span>`).join('\n')}</code></pre>`
            : ''));
        const change = { path: 'a.ts', before: 'one\ntwo\n', after: 'one\nTWO\n' };
        const el = mount(change);
        await flush();
        await flush();
        expect(el.querySelector('.aparte-diff-line__code b')?.textContent).toBe('one');
        change.before = 'uno\ntwo\n';
        change.after = 'uno\nTWO\n';
        el.diff = change;
        await flush();
        await flush();
        const codes = [...el.querySelectorAll('.aparte-diff-line__code')].map((c) => c.textContent);
        expect(codes).toContain('uno');
        expect(codes).not.toContain('one');
    });

    it('clamps the lines picked to what a change mutated in place still holds, and lets go when none is left', () => {
        const change = { ...FORTY };
        const el = mount(change, { commentable: '' });
        click(gutter(el, 'del', 20));
        click(gutter(el, 'add', 20), { shiftKey: true });
        expect(el.querySelectorAll('[data-selected]')).toHaveLength(2);
        // Line 20 is no longer changed: the removed line goes, the added one stays as context.
        change.before = change.before.replace('const line20 = 20;', 'const line20 = 2000;');
        change.after = change.after.replace('const line20 = 2000;', 'const line20 = 2000;\nconst extra = 0;');
        el.diff = change;
        expect(el.querySelectorAll('[data-selected]')).toHaveLength(1);
        expect(el.querySelector('textarea')).not.toBeNull();

        change.before = 'a\n';
        change.after = 'b\n';
        el.diff = change;
        expect(el.querySelectorAll('[data-selected]')).toHaveLength(0);
        expect(el.querySelector('textarea')).toBeNull();
    });

    it('keeps the field when handed the same diff text again', () => {
        const text = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n';
        const el = mount(text, { commentable: '' });
        click(gutter(el, 'add', 2));
        const input = el.querySelector('textarea')!;
        el.diff = text;
        expect(el.querySelector('textarea')).toBe(input);
        expect(document.activeElement).toBe(input);
    });

    it('draws again when moved, and draws nothing until it is given a change', () => {
        const el = document.createElement('aparte-diff');
        document.body.append(el);
        expect(el.childElementCount).toBe(0);
        const other = document.createElement('div');
        document.body.append(other);
        el.diff = FORTY;
        other.append(el);
        expect(el.querySelectorAll('.aparte-diff-line')).toHaveLength(8);
    });
});
