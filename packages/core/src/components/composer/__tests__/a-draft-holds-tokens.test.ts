// @vitest-environment jsdom
/**
 * The seams `@aparte/plugin-triggers` stands on: a caret as a number, a token as one unit of
 * the draft, and what a sent message says about its tokens.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../../bubble/aparte-chat-bubble.js';
import { drawMessageTokens } from '../../bubble/message-tokens.js';
import type { AparteComposerInput } from '../aparte-composer-input.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteSendEventDetail } from '../../../types/index.js';
import { placeFloating } from '../../../utils/place-floating.js';

function field(): { composer: AparteComposer; input: AparteComposerInput; editor: HTMLElement } {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    composer.innerHTML = '<aparte-composer-input></aparte-composer-input>';
    document.body.appendChild(composer);
    const input = composer.querySelector('aparte-composer-input') as AparteComposerInput;
    return { composer, input, editor: input.querySelector('.aparte-ci-editor') as HTMLElement };
}

function caretAt(editor: HTMLElement, node: Node, offset: number): void {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the caret', () => {
    it('is a number in the draft', () => {
        const { input, editor } = field();
        input.setValue('hello @pa');
        caretAt(editor, editor.firstChild!, 9);
        expect(input.getCaret()).toEqual({ text: 'hello @pa', offset: 9 });
    });

    it('is null with no selection in the editor', () => {
        const { input } = field();
        document.getSelection()!.removeAllRanges();
        expect(input.getCaret()).toBeNull();
    });

    it('counts a line break as one', () => {
        const { input, editor } = field();
        editor.innerHTML = 'ab<br>cd';
        caretAt(editor, editor.lastChild!, 1);
        expect(input.getCaret()).toEqual({ text: 'ab\ncd', offset: 4 });
    });
});

describe('a token in the draft', () => {
    const typed = (value: string) => {
        const parts = field();
        parts.input.setValue(value);
        caretAt(parts.editor, parts.editor.firstChild!, value.length);
        return parts;
    };

    it('takes the place of its range, and the caret lands after it', () => {
        const { input, editor } = typed('hi @pa');
        input.insertToken(3, 6, { label: 'Paul', text: '@paul' });
        expect(editor.querySelector('.aparte-inline-token')!.textContent).toBe('Paul');
        expect(input.getCaret()).toEqual({ text: 'hi ￼ ', offset: 5 });
    });

    it('is not editable', () => {
        const { input, editor } = typed('@');
        input.insertToken(0, 1, { label: 'Paul' });
        expect(editor.querySelector('.aparte-inline-token')!.getAttribute('contenteditable')).toBe('false');
    });

    it('sends its text, not its label', () => {
        const { input } = typed('see @re now');
        input.insertToken(4, 7, { label: 'report.pdf', text: '[report](file:1)' });
        expect(input.getValue()).toBe('see [report](file:1)  now');
    });

    it('says where it ended up, past any leading space', () => {
        const { input } = typed('  a @b');
        input.insertToken(4, 6, { label: 'B', text: '@b', kind: 'mention', data: { id: 7 } });
        expect(input.getValue()).toBe('a @b');
        expect(input.getTokens()).toEqual([{ label: 'B', text: '@b', start: 2, end: 4, kind: 'mention', data: { id: 7 } }]);
    });

    it('reaches the page under its kind, its text escaped', () => {
        const { input, editor } = typed('@');
        input.insertToken(0, 1, { label: '<img src=x onerror=1>', kind: 'mention' });
        const pill = editor.querySelector<HTMLElement>('.aparte-inline-token')!;
        expect(pill.dataset['kind']).toBe('mention');
        expect(editor.querySelector('img')).toBeNull();
    });

    it('goes with the draft when it is cleared', () => {
        const { input } = typed('@');
        input.insertToken(0, 1, { label: 'B' });
        input.clear();
        expect(input.getTokens()).toEqual([]);
    });

    it('rides on aparte-send', () => {
        const { composer, input } = typed('@p');
        input.insertToken(0, 2, { label: 'Paul', text: '@paul', data: 1 });
        let sent: AparteSendEventDetail | undefined;
        composer.addEventListener('aparte-send', (e) => { sent = (e as CustomEvent<AparteSendEventDetail>).detail; });
        composer.submit();
        expect(sent!.content).toBe('@paul');
        expect(sent!.tokens).toEqual([{ label: 'Paul', text: '@paul', start: 0, end: 5, data: 1 }]);
    });

    it('adds nothing to a send that has none', () => {
        const { composer, input } = typed('plain');
        input.setValue('plain');
        let sent: AparteSendEventDetail | undefined;
        composer.addEventListener('aparte-send', (e) => { sent = (e as CustomEvent<AparteSendEventDetail>).detail; });
        composer.submit();
        expect('tokens' in sent!).toBe(false);
    });
});

describe('replaceRange', () => {
    it('writes over the range and leaves the caret after it', () => {
        const { input, editor } = field();
        input.setValue('run /co now');
        input.replaceRange(4, 7, '/compact');
        expect(input.getValue()).toBe('run /compact now');
        expect(input.getCaret()!.offset).toBe(12);
        expect(editor.textContent).toBe('run /compact now');
    });

    it('an empty text just removes the range', () => {
        const { input } = field();
        input.setValue('/clear');
        input.replaceRange(0, 6, '');
        expect(input.getValue()).toBe('');
    });
});

describe('Enter, once something over the field took it', () => {
    it('does not send', () => {
        const { composer, input, editor } = field();
        input.setValue('hello');
        let sends = 0;
        composer.addEventListener('aparte-send', () => { sends += 1; });
        composer.addEventListener('keydown', (e) => e.preventDefault(), { capture: true });
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(sends).toBe(0);
    });
});

describe('a sent message shows its tokens', () => {
    const rendered = (html: string) => {
        const root = document.createElement('div');
        root.innerHTML = html;
        return root;
    };

    it('in place of their text', () => {
        const root = rendered('<p>hi @paul how</p>');
        drawMessageTokens(root, 'hi @paul how', [{ label: 'Paul', text: '@paul', start: 3, end: 8 }]);
        expect(root.querySelector('.aparte-inline-token')!.textContent).toBe('Paul');
        expect(root.textContent).toBe('hi Paul how');
    });

    it('at the right occurrence, when the same text was also typed', () => {
        const root = rendered('<p>@paul and @paul</p>');
        drawMessageTokens(root, '@paul and @paul', [{ label: 'Paul', text: '@paul', start: 10, end: 15 }]);
        expect(root.querySelector('p')!.firstChild!.textContent).toBe('@paul and ');
        expect(root.querySelectorAll('.aparte-inline-token')).toHaveLength(1);
    });

    it('several, each where it was', () => {
        const root = rendered('<p>@a then @b</p>');
        drawMessageTokens(root, '@a then @b', [
            { label: 'A', text: '@a', start: 0, end: 2 },
            { label: 'B', text: '@b', start: 8, end: 10 },
        ]);
        expect(root.textContent).toBe('A then B');
    });

    it('leaves as text one that Markdown took apart', () => {
        const root = rendered('<p>a <em>b</em> c</p>');
        drawMessageTokens(root, 'a *b* c', [{ label: 'X', text: '*b*', start: 2, end: 5 }]);
        expect(root.querySelector('.aparte-inline-token')).toBeNull();
    });

    it('does not draw them twice', () => {
        const root = rendered('<p>@a</p>');
        const tokens = [{ label: '@a', text: '@a', start: 0, end: 2 }];
        drawMessageTokens(root, '@a', tokens);
        drawMessageTokens(root, '@a', tokens);
        expect(root.querySelectorAll('.aparte-inline-token')).toHaveLength(1);
    });

    it('through the bubble, for a user message and not for a reply', () => {
        const make = (role: string) => {
            const el = document.createElement('aparte-chat-bubble') as HTMLElement & { setContent(c: string): void; setTokens(t: unknown): void };
            el.setAttribute('data-role', role);
            document.body.appendChild(el);
            el.setContent('hi @a');
            el.setTokens([{ label: 'A', text: '@a', start: 3, end: 5 }]);
            return el;
        };
        expect(make('user').querySelector('.aparte-inline-token')).not.toBeNull();
        expect(make('assistant').querySelector('.aparte-inline-token')).toBeNull();
    });
});

describe('placeFloating', () => {
    const box = (width: number, height: number) => {
        const el = document.createElement('div');
        el.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
        return el;
    };
    const at = (top: number, left: number) => ({ top, bottom: top + 20, left, right: left + 40 });

    beforeAll(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    });

    it('goes below by default, lined up with the start', () => {
        const el = box(200, 100);
        placeFloating(at(100, 300), el);
        expect([el.style.top, el.style.left]).toEqual(['124px', '300px']);
    });

    it('turns to the other side when the window ends first', () => {
        const el = box(200, 100);
        placeFloating(at(750, 300), el);
        expect(el.style.top).toBe('646px');
    });

    it('stays on the side asked when neither has room', () => {
        const el = box(200, 2000);
        placeFloating(at(300, 300), el, { side: 'above' });
        expect(el.style.top).toBe(`${300 - 2000 - 4}px`);
    });

    it('lines up with the other edge in right to left, and never leaves the window', () => {
        const el = box(200, 100);
        placeFloating(at(100, 10), el, { rtl: true });
        expect(el.style.left).toBe('8px');
    });

    it('opens beside, and turns back at the end of the line', () => {
        const el = box(200, 100);
        placeFloating(at(100, 900), el, { side: 'beside' });
        expect(el.style.left).toBe(`${900 - 200 - 4}px`);
        placeFloating(at(100, 100), el, { side: 'beside' });
        expect(el.style.left).toBe('144px');
    });
});
