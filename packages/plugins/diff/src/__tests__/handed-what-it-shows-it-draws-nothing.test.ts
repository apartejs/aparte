/**
 * Handed what it already shows, the view draws nothing.
 *
 * A wrapper hands the element its comments and its change on every render of the app around
 * it: a new array of the same comments (filtered from the app's store), a new
 * `{ path, before, after }` with the same texts. Each used to draw every row again. The
 * reader's state was carried over, but the rows were new elements: a text selection in the
 * code was lost, the field being written in left the page and came back (a blur, an input
 * method's composition cut), and anything holding a row held one no longer on the page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteDiffComment } from '../types.js';
import { click, FORTY, gutter, mount } from './harness.js';

afterEach(() => {
    document.body.replaceChildren();
    aparteGlobalConfig.reset();
});

const earlier = (): AparteDiffComment => ({ id: 'c1', path: 'src/long.ts', side: 'new', startLine: 17, endLine: 17, text: 'Earlier', state: 'pending' });

/** A view with a fold opened and a comment half written on line 20, focus in the field. */
function inUse(change = { ...FORTY }) {
    const el = mount(change, { commentable: '' });
    el.comments = [earlier()];
    el.querySelector<HTMLButtonElement>('.aparte-diff-fold__show[data-gap="1"]')!.click();
    click(gutter(el, 'add', 20));
    const input = el.querySelector('textarea')!;
    input.value = 'half written';
    input.focus();
    const row = gutter(el, 'context', 30).closest('.aparte-diff-line')!;
    let blurs = 0;
    input.addEventListener('blur', () => blurs++);
    return { el, input, row, change, blurs: () => blurs };
}

describe('handed what it shows', () => {
    it('as a new array of the same comments, it keeps every row and the field where they are', () => {
        const { el, input, row, blurs } = inUse();
        el.comments = [earlier()];
        expect(gutter(el, 'context', 30).closest('.aparte-diff-line')).toBe(row);
        expect(input.isConnected).toBe(true);
        expect(blurs()).toBe(0);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe('half written');
    });

    it('as comments that differ only in what the element does not read, it draws nothing', () => {
        const { el, row } = inUse();
        el.comments = [{ ...earlier(), id: 'c1-saved', updatedAt: 2 } as AparteDiffComment];
        expect(gutter(el, 'context', 30).closest('.aparte-diff-line')).toBe(row);
    });

    it('as an equal change, a new object or the same text, it keeps every row and the field where they are', () => {
        const { el, input, row, change, blurs } = inUse();
        el.diff = { ...change };
        expect(gutter(el, 'context', 30).closest('.aparte-diff-line')).toBe(row);
        expect(blurs()).toBe(0);
        expect(document.activeElement).toBe(input);

        const text = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n';
        el.diff = text;
        const line = gutter(el, 'add', 2).closest('.aparte-diff-line');
        el.diff = text;
        expect(gutter(el, 'add', 2).closest('.aparte-diff-line')).toBe(line);
    });
});

describe('handed something else', () => {
    it('draws a comment whose state changed, even on the same objects mutated in place', () => {
        const { el } = inUse();
        const list = [earlier()];
        el.comments = list;
        list[0]!.state = 'sent';
        el.comments = list;
        expect(el.querySelector('.aparte-diff-comment__state')!.textContent).toBe('Sent');

        list.push({ path: 'src/long.ts', side: 'new', startLine: 25, endLine: 25, text: 'Later' });
        el.comments = list;
        expect([...el.querySelectorAll('.aparte-diff-comment')].map((c) => c.textContent)).toEqual(
            expect.arrayContaining([expect.stringContaining('Earlier'), expect.stringContaining('Later')]),
        );
    });

    it('draws a change mutated in place', () => {
        const { el, change, input } = inUse();
        change.after = change.after.replace('const line21 = 21;', 'const line21 = 21000;');
        el.diff = change;
        expect(el.textContent).toContain('21000');
        expect(el.querySelector('textarea')).toBe(input);
    });

    it('draws its words again when the language changes', () => {
        const { el } = inUse();
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        expect(el.querySelector('.aparte-diff-comment__state')!.textContent).toBe('En attente');
    });
});
