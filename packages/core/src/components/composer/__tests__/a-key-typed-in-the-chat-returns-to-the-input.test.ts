// @vitest-environment jsdom
/**
 * A key typed in the chat returns to the input.
 *
 * Someone selects a few words of a reply to copy them, then goes on typing: the click that
 * made the selection took the caret out of the input, so the letters went nowhere until they
 * clicked the input again. The composer now takes the caret back on the first key that
 * writes something — when the person was last IN the chat, so an embedded chat never takes
 * a key from the page around it (`type-to-focus="page"` widens it, `"off"` turns it off).
 *
 * jsdom has no layout and writes no character on a keydown, so these tests say WHERE the
 * caret goes and that the key is left to the browser (never cancelled); that the letter is
 * then written in the input is proven in a real browser, in `e2e/tests/type-to-focus.spec.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';

interface Page {
    /** The chat's root, as a wrapper renders it. */
    chat: HTMLElement;
    /** A line of the transcript: text a person selects. */
    reply: HTMLElement;
    composer: HTMLElement;
    editor: HTMLElement;
    /** A paragraph of the page around the chat. */
    outside: HTMLElement;
}

function mountPage(attrs: Record<string, string> = {}, id = 'chat'): Page {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = id;
    const reply = document.createElement('p');
    reply.textContent = 'The transport is the object that talks to the model.';
    chat.appendChild(reply);
    const composer = document.createElement('aparte-composer');
    for (const [name, value] of Object.entries(attrs)) composer.setAttribute(name, value);
    composer.appendChild(document.createElement('aparte-composer-input'));
    chat.appendChild(composer);
    const outside = document.createElement('p');
    outside.textContent = 'The page around the chat.';
    document.body.append(outside, chat);
    return { chat, reply, composer, editor: composer.querySelector<HTMLElement>('.aparte-ci-editor')!, outside };
}

/** A click, as far as the caret is concerned: the pointer goes down and nothing keeps the focus. */
function click(target: HTMLElement): void {
    (document.activeElement as HTMLElement | null)?.blur();
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
}

/** Press a key where the focus is; the event comes back so a test can read what became of it. */
function type(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
}

/** Something in the page that can hold the focus. */
function focusable(parent: HTMLElement, tag = 'button', attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    if (tag !== 'button' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') el.tabIndex = 0;
    parent.appendChild(el);
    return el;
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('a key typed in the chat returns to the input', () => {
    it('puts the caret in the input when a letter follows a click in the transcript', () => {
        const page = mountPage();
        click(page.reply);
        expect(document.activeElement, 'precondition: the click left the caret nowhere').toBe(document.body);

        const event = type('m');

        expect(document.activeElement).toBe(page.editor);
        expect(event.defaultPrevented, 'the letter is the browser\'s to write').toBe(false);
    });

    it('leaves the page alone when the last click was around the chat', () => {
        const page = mountPage();
        click(page.reply);
        click(page.outside);

        type('m');

        expect(document.activeElement).toBe(document.body);
    });

    it('does nothing before anyone has clicked in the chat', () => {
        mountPage();

        type('m');

        expect(document.activeElement).toBe(document.body);
    });

    it('takes a letter typed with the focus on a control of the chat that is not a field', () => {
        const page = mountPage();
        focusable(page.chat).focus();

        type('m');

        expect(document.activeElement).toBe(page.editor);
    });

    it('leaves a control of the page its focus, even after a click in the chat', () => {
        const page = mountPage();
        click(page.reply);
        // Reached with Tab: no pointer went down since the click in the chat.
        const button = focusable(document.body);
        button.focus();

        type('m');

        expect(document.activeElement).toBe(button);
    });

    it.each([
        ['an input', 'input', {}],
        ['a textarea', 'textarea', {}],
        ['a select', 'select', {}],
        ['an editable region', 'div', { contenteditable: 'true' }],
        ['a textbox', 'div', { role: 'textbox' }],
        ['a combobox', 'div', { role: 'combobox' }],
        ['a listbox', 'div', { role: 'listbox' }],
        ['a menu', 'div', { role: 'menu' }],
    ] as const)('never takes a key from %s, in the chat or around it', (_name, tag, attrs) => {
        const page = mountPage({ 'type-to-focus': 'page' });
        for (const parent of [page.chat, document.body]) {
            const field = focusable(parent, tag, attrs);
            field.focus();

            type('m');

            expect(document.activeElement).toBe(field);
        }
    });

    it.each([
        ['Ctrl+C', 'c', { ctrlKey: true }],
        ['Cmd+V', 'v', { metaKey: true }],
        ['Alt+F', 'f', { altKey: true }],
        ['an arrow', 'ArrowDown', {}],
        ['Tab', 'Tab', {}],
        ['Escape', 'Escape', {}],
        ['Enter', 'Enter', {}],
        ['Backspace', 'Backspace', {}],
        ['Shift alone', 'Shift', { shiftKey: true }],
        ['the space bar, which scrolls and presses', ' ', {}],
        ['a function key', 'F5', {}],
    ] as const)('leaves %s alone: it writes nothing', (_name, key, init) => {
        const page = mountPage();
        click(page.reply);

        type(key, init);

        expect(document.activeElement).toBe(document.body);
        expect(page.editor.textContent).toBe('');
    });

    it.each([
        ['a capital', 'M', { shiftKey: true }],
        ['a digit', '7', {}],
        ['a sign', '?', { shiftKey: true }],
        ['a character behind AltGr', '@', { ctrlKey: true, altKey: true, modifierAltGraph: true }],
        ['a dead key, the first half of an accent', 'Dead', {}],
    ] as const)('takes %s like a letter', (_name, key, init) => {
        const page = mountPage();
        click(page.reply);

        type(key, init);

        expect(document.activeElement).toBe(page.editor);
    });

    it('leaves a key that something else already handled', () => {
        const page = mountPage();
        click(page.reply);
        document.body.addEventListener('keydown', (event) => event.preventDefault(), { once: true });

        type('m');

        expect(document.activeElement).toBe(document.body);
    });

    it('leaves a key that belongs to a composition under way', () => {
        const page = mountPage();
        click(page.reply);

        type('m', { isComposing: true });

        expect(document.activeElement).toBe(document.body);
    });

    it('leaves a disabled composer without the caret', () => {
        const page = mountPage({ disabled: '' });
        click(page.reply);

        type('m');

        expect(document.activeElement).not.toBe(page.editor);
    });

    it('leaves an input that is disabled on its own without the caret', () => {
        const page = mountPage();
        page.composer.querySelector('aparte-composer-input')!.setAttribute('disabled', '');
        click(page.reply);

        type('m');

        expect(document.activeElement).not.toBe(page.editor);
    });

    it('keeps what is already written and puts the caret after it', () => {
        const page = mountPage();
        page.editor.textContent = 'Thanks';
        click(page.reply);

        type('!');

        expect(document.activeElement).toBe(page.editor);
        const range = document.getSelection()!.getRangeAt(0);
        expect(range.collapsed).toBe(true);
        expect(range.endContainer).toBe(page.editor);
        expect(range.endOffset).toBe(page.editor.childNodes.length);
    });
});

describe('type-to-focus="page"', () => {
    it('takes a letter typed anywhere in the page, outside a field', () => {
        const page = mountPage({ 'type-to-focus': 'page' });
        click(page.outside);

        type('m');

        expect(document.activeElement).toBe(page.editor);
    });

    it('takes it from a control of the page as well', () => {
        const page = mountPage({ 'type-to-focus': 'page' });
        focusable(document.body).focus();

        type('m');

        expect(document.activeElement).toBe(page.editor);
    });

    it('is read at every key, so it can be set after the chat mounted', () => {
        const page = mountPage();
        click(page.outside);
        type('m');
        expect(document.activeElement, 'precondition: the default stays in the chat').toBe(document.body);

        page.composer.setAttribute('type-to-focus', 'page');
        type('m');

        expect(document.activeElement).toBe(page.editor);
    });
});

describe('type-to-focus="off"', () => {
    it('never moves the caret', () => {
        const page = mountPage({ 'type-to-focus': 'off' });
        click(page.reply);

        type('m');

        expect(document.activeElement).toBe(document.body);
    });
});

describe('which chat a composer answers for', () => {
    it('is the chat it sits in: of two chats, the one last clicked takes the letter', () => {
        const first = mountPage({}, 'first');
        const second = mountPage({}, 'second');

        click(second.reply);
        type('m');
        expect(document.activeElement).toBe(second.editor);

        click(first.reply);
        type('m');
        expect(document.activeElement).toBe(first.editor);
    });

    it('is the chat its `target` names when it sits outside it', () => {
        const page = mountPage();
        const apart = document.createElement('aparte-composer');
        apart.setAttribute('target', 'chat');
        apart.appendChild(document.createElement('aparte-composer-input'));
        page.composer.remove();
        document.body.appendChild(apart);

        click(page.reply);
        type('m');

        expect(document.activeElement).toBe(apart.querySelector('.aparte-ci-editor'));
    });

    it('stops listening once it leaves the page, and listens again when it comes back', () => {
        const page = mountPage();
        page.composer.remove();
        click(page.reply);
        type('m');
        expect(document.activeElement).toBe(document.body);

        page.chat.appendChild(page.composer);
        click(page.reply);
        type('m');

        expect(document.activeElement).toBe(page.composer.querySelector('.aparte-ci-editor'));
    });
});
