// @vitest-environment jsdom
/**
 * `<aparte-chat type-to-focus>` reaches the composer it composes.
 *
 * The composer is what takes the caret back when a key is typed in the chat, and it reads
 * `type-to-focus` on itself — where the four wrappers write it. The vanilla shell composes
 * its own composer, so the attribute a page writes on `<aparte-chat>` has to get there, in
 * the initial markup and when it changes afterwards, as `submit-on-enter` does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';
import '../../composer/aparte-composer-input.js';
import { AparteChat } from '../aparte-chat.js';

afterEach(() => { document.body.replaceChildren(); });

function mount(attrs: Record<string, string> = {}): { chat: AparteChat; editor: HTMLElement; outside: HTMLElement } {
    const outside = document.createElement('p');
    outside.textContent = 'The page around the chat.';
    const chat = document.createElement('aparte-chat') as AparteChat;
    for (const [k, v] of Object.entries(attrs)) chat.setAttribute(k, v);
    document.body.append(outside, chat);
    const editor = chat.querySelector<HTMLElement>('.aparte-ci-editor');
    expect(editor, 'the default composition must include an input').toBeTruthy();
    return { chat, editor: editor!, outside };
}

/** A click somewhere, then a letter: where the caret is afterwards. */
function letterAfterClickOn(target: HTMLElement): Element | null {
    (document.activeElement as HTMLElement | null)?.blur();
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
    return document.activeElement;
}

describe('<aparte-chat type-to-focus>', () => {
    it('is observed', () => {
        expect(AparteChat.observedAttributes).toContain('type-to-focus');
    });

    it('left unset, a letter typed after a click in the chat returns to the input', () => {
        const { chat, editor, outside } = mount();
        expect(letterAfterClickOn(chat.viewport!)).toBe(editor);
        expect(letterAfterClickOn(outside), 'and the page keeps its own keys').toBe(document.body);
    });

    it('"off" in the initial markup reaches the composer', () => {
        const { chat } = mount({ 'type-to-focus': 'off' });
        expect(letterAfterClickOn(chat.viewport!)).toBe(document.body);
    });

    it('"page" in the initial markup reaches the composer', () => {
        const { editor, outside } = mount({ 'type-to-focus': 'page' });
        expect(letterAfterClickOn(outside)).toBe(editor);
    });

    it('set after mount, the composer follows, and a removal mirrors through', () => {
        const { chat, editor, outside } = mount();
        chat.setAttribute('type-to-focus', 'page');
        expect(letterAfterClickOn(outside)).toBe(editor);
        chat.removeAttribute('type-to-focus');
        expect(letterAfterClickOn(outside)).toBe(document.body);
    });
});
