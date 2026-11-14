/**
 * With `commentable`, a reader comments on a line or a range, with the mouse or the keyboard.
 *
 * A line number is a button: a click opens a field under the line, Shift+click stretches the
 * selection to another line. From the keyboard the numbers of a file are one tab stop: the
 * arrows move between them, Shift+arrows stretch the selection, Enter or Space opens the field,
 * Escape lets go. Sending the field fires `aparte-diff-comment` with the path, the side, the
 * lines and the text; the element keeps nothing of it, and shows the comments the app hands
 * back, under their lines, with where each stands. Without `commentable`, nothing of this is
 * offered: no button, no tab stop, no pointer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteDiffCommentEventDetail } from '../types.js';
import { click, FORTY, gutter, key, mount } from './harness.js';

afterEach(() => {
    document.body.replaceChildren();
    aparteGlobalConfig.reset();
});

const EDIT = {
    path: 'src/parse.ts',
    before: 'one\ntwo\nthree\nfour\nfive\n',
    after: 'one\nTWO\nthree\nfour\nFIVE\nsix\n',
};

function comments(el: HTMLElement): AparteDiffCommentEventDetail[] {
    const got: AparteDiffCommentEventDetail[] = [];
    el.addEventListener('aparte-diff-comment', (e) => got.push(e.detail));
    return got;
}

function form(el: Element) {
    const node = el.querySelector<HTMLFormElement>('form.aparte-diff-form');
    return node && {
        node,
        input: node.querySelector<HTMLTextAreaElement>('textarea')!,
        submit: node.querySelector<HTMLButtonElement>('.aparte-diff-form__submit')!,
        cancel: node.querySelector<HTMLButtonElement>('.aparte-diff-form__cancel')!,
        label: node.querySelector('label')!.textContent,
        /** The line the form sits under. */
        under: node.previousElementSibling,
    };
}

function type(input: HTMLTextAreaElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('a comment on a line', () => {
    it('opens a field under the line a click picks, and sends what is written', () => {
        const el = mount(EDIT, { commentable: '' });
        const got = comments(el);
        click(gutter(el, 'add', 2));
        const f = form(el)!;
        expect(f.label).toBe('Comment on line 2');
        expect(f.under).toBe(gutter(el, 'add', 2).closest('.aparte-diff-line'));
        expect(document.activeElement).toBe(f.input);
        // A field of the kit, buttons of the kit.
        expect(f.input.classList.contains('aparte-field')).toBe(true);
        expect(f.submit.classList.contains('aparte-btn')).toBe(true);
        expect(f.submit.disabled).toBe(true);
        type(f.input, 'Why upper case?');
        expect(f.submit.disabled).toBe(false);
        f.submit.click();
        expect(got).toEqual([{ path: 'src/parse.ts', side: 'new', startLine: 2, endLine: 2, text: 'Why upper case?', code: 'TWO' }]);
        // Sent: the field closes and the focus goes back to the line.
        expect(form(el)).toBeNull();
        expect(document.activeElement).toBe(gutter(el, 'add', 2));
        // The element keeps nothing of it: the app hands it back to show it.
        expect(el.querySelector('.aparte-diff-comment')).toBeNull();
    });

    it('stretches the selection with Shift+click, and comments on a removed line on the old side', () => {
        const el = mount(EDIT, { commentable: '' });
        const got = comments(el);
        click(gutter(el, 'context', 3));
        click(gutter(el, 'add', 6), { shiftKey: true });
        const selected = [...el.querySelectorAll('.aparte-diff-line[data-selected]')].map((r) => r.querySelector('code')!.textContent);
        expect(selected).toEqual(['three', 'four', 'five', 'FIVE', 'six']);
        expect(form(el)!.label).toBe('Comment on lines 3–6');
        expect(form(el)!.under).toBe(gutter(el, 'add', 6).closest('.aparte-diff-line'));
        type(form(el)!.input, 'A range');
        form(el)!.node.requestSubmit();
        expect(got[0]).toEqual({ path: 'src/parse.ts', side: 'new', startLine: 3, endLine: 6, text: 'A range', code: 'three\nfour\nFIVE\nsix' });

        click(gutter(el, 'del', 2));
        type(form(el)!.input, 'Was fine');
        form(el)!.submit.click();
        expect(got[1]).toEqual({ path: 'src/parse.ts', side: 'old', startLine: 2, endLine: 2, text: 'Was fine', code: 'two' });
        expect(gutter(el, 'del', 2).getAttribute('aria-label')).toBe('Removed line 2');
    });

    it('keeps what was written when another line is picked while the field is open', () => {
        const el = mount(EDIT, { commentable: '' });
        click(gutter(el, 'context', 1));
        type(form(el)!.input, 'draft');
        click(gutter(el, 'context', 4));
        expect(form(el)!.input.value).toBe('draft');
        expect(form(el)!.label).toBe('Comment on line 4');
        expect(el.querySelectorAll('form.aparte-diff-form')).toHaveLength(1);
    });

    it('is driven from the keyboard: one tab stop, the arrows, Shift to stretch, Enter to write, Escape to let go', () => {
        const el = mount(EDIT, { commentable: '' });
        const got = comments(el);
        const gutters = [...el.querySelectorAll<HTMLButtonElement>('button.aparte-diff-line__gutter')];
        expect(gutters.map((g) => g.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1]);
        gutters[0]!.focus();
        key(gutters[0]!, 'ArrowDown');
        expect(document.activeElement).toBe(gutters[1]);
        expect(gutters.map((g) => g.tabIndex).indexOf(0)).toBe(1);
        key(gutters[1]!, 'End');
        expect(document.activeElement).toBe(gutters[7]);
        key(gutters[7]!, 'Home');
        expect(document.activeElement).toBe(gutters[0]);
        // Down to line 3, then Shift+Down: lines 3 and 4.
        key(gutters[0]!, 'ArrowDown');
        key(gutters[1]!, 'ArrowDown');
        key(gutters[2]!, 'ArrowDown');
        expect(gutter(el, 'context', 3)).toBe(document.activeElement);
        key(document.activeElement!, 'ArrowDown', { shiftKey: true });
        expect(el.querySelectorAll('.aparte-diff-line[data-selected]')).toHaveLength(2);
        expect(gutter(el, 'context', 3).getAttribute('aria-pressed')).toBe('true');
        const enter = key(document.activeElement!, 'Enter');
        expect(enter.defaultPrevented).toBe(true);
        expect(form(el)!.label).toBe('Comment on lines 3–4');
        type(form(el)!.input, 'From the keyboard');
        // Ctrl+Enter (or ⌘+Enter) sends from the field.
        key(form(el)!.input, 'Enter', { ctrlKey: true });
        expect(got).toEqual([{ path: 'src/parse.ts', side: 'new', startLine: 3, endLine: 4, text: 'From the keyboard', code: 'three\nfour' }]);
        expect(document.activeElement).toBe(gutter(el, 'context', 4));

        // Space picks one line and opens the field; Escape in it closes it and gives the line back.
        key(document.activeElement!, ' ');
        expect(form(el)!.label).toBe('Comment on line 4');
        key(form(el)!.input, 'Escape');
        expect(form(el)).toBeNull();
        expect(document.activeElement).toBe(gutter(el, 'context', 4));
        expect(el.querySelectorAll('.aparte-diff-line[data-selected]')).toHaveLength(0);
    });

    it('keeps the field open with its text when the app cancels the event', () => {
        const el = mount(EDIT, { commentable: '' });
        el.addEventListener('aparte-diff-comment', (e) => e.preventDefault());
        click(gutter(el, 'add', 2));
        type(form(el)!.input, 'Not kept');
        form(el)!.submit.click();
        expect(form(el)!.input.value).toBe('Not kept');
    });

    it('lets the Cancel button close the field', () => {
        const el = mount(EDIT, { commentable: '' });
        click(gutter(el, 'add', 2));
        form(el)!.cancel.click();
        expect(form(el)).toBeNull();
        expect(document.activeElement).toBe(gutter(el, 'add', 2));
    });

    it('bubbles out of the chat, composed', () => {
        const el = mount(EDIT, { commentable: '' });
        const heard = vi.fn();
        document.addEventListener('aparte-diff-comment', heard);
        click(gutter(el, 'add', 2));
        type(form(el)!.input, 'Up');
        form(el)!.submit.click();
        document.removeEventListener('aparte-diff-comment', heard);
        expect(heard).toHaveBeenCalledTimes(1);
        const event = heard.mock.calls[0]![0] as CustomEvent;
        expect([event.bubbles, event.composed, event.cancelable]).toEqual([true, true, true]);
    });

    it("moves the focus to the first line a fold shows, on the line's button", () => {
        const el = mount(FORTY, { commentable: '' });
        el.querySelector<HTMLButtonElement>('button.aparte-diff-fold__show')!.click();
        expect(document.activeElement).toBe(gutter(el, 'context', 1));
        expect(gutter(el, 'context', 1).tabIndex).toBe(0);
    });
});

describe('the comments the app hands back', () => {
    it('are shown under their lines, with where each stands', () => {
        const el = mount(EDIT);
        el.comments = [
            { id: 'c1', path: 'src/parse.ts', side: 'new', startLine: 2, endLine: 2, text: 'Why upper case?', state: 'pending' },
            { id: 'c2', path: 'src/parse.ts', side: 'new', startLine: 3, endLine: 5, text: 'This block', state: 'sent' },
            { id: 'c3', path: 'src/parse.ts', side: 'old', startLine: 5, endLine: 5, text: 'Old five', state: 'pending' },
            { id: 'c4', path: 'other.ts', side: 'new', startLine: 1, endLine: 1, text: 'Not this file' },
        ];
        const shown = [...el.querySelectorAll('.aparte-diff-comment')].map((c) => [
            c.previousElementSibling?.querySelector('code')?.textContent,
            c.querySelector('.aparte-diff-comment__lines')!.textContent,
            c.querySelector('.aparte-diff-comment__state')?.textContent ?? '',
            c.querySelector('.aparte-diff-comment__text')!.textContent,
            c.getAttribute('data-state'),
        ]);
        expect(shown).toEqual([
            ['TWO', 'Line 2', 'Pending', 'Why upper case?', 'pending'],
            ['five', 'Removed line 5', 'Pending', 'Old five', 'pending'],
            ['FIVE', 'Lines 3–5', 'Sent', 'This block', 'sent'],
        ]);
        // A new list is drawn in place of the last.
        el.comments = [];
        expect(el.querySelectorAll('.aparte-diff-comment')).toHaveLength(0);
    });

    it('puts a comment whose line is folded at the end of its file, and shows it once the fold opens', () => {
        const el = mount(FORTY);
        el.comments = [{ path: 'src/long.ts', side: 'new', startLine: 3, endLine: 3, text: 'Folded' }];
        const file = el.querySelector('.aparte-diff-file__lines')!;
        expect(file.lastElementChild!.classList.contains('aparte-diff-comment')).toBe(true);
        el.querySelector<HTMLButtonElement>('button.aparte-diff-fold__show')!.click();
        const comment = el.querySelector('.aparte-diff-comment')!;
        expect(comment.previousElementSibling!.querySelector('code')!.textContent).toBe('const line3 = 3;');
        // No state given: none shown.
        expect(comment.querySelector('.aparte-diff-comment__state')).toBeNull();
    });
});

describe('without commentable', () => {
    it('offers nothing to press: no button, no tab stop, no role, no pointer', () => {
        const el = mount(EDIT);
        expect(el.querySelectorAll('button.aparte-diff-line__gutter')).toHaveLength(0);
        expect(el.querySelectorAll('.aparte-diff-file__lines [tabindex], .aparte-diff-file__lines [role]')).toHaveLength(0);
        click(el.querySelector('.aparte-diff-line__gutter')!);
        key(el.querySelector('.aparte-diff-line__gutter')!, 'Enter');
        expect(form(el)).toBeNull();
        expect(el.hasAttribute('commentable')).toBe(false);
    });

    it('turns on and off with the attribute or the property, letting go of an open field', () => {
        const el = mount(EDIT);
        el.commentable = true;
        expect(el.hasAttribute('commentable')).toBe(true);
        click(gutter(el, 'add', 2));
        expect(form(el)).not.toBeNull();
        el.removeAttribute('commentable');
        expect(el.commentable).toBe(false);
        expect(form(el)).toBeNull();
        expect(el.querySelectorAll('button.aparte-diff-line__gutter')).toHaveLength(0);
    });
});
