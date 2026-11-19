// @vitest-environment jsdom
/**
 * `stop-key`: a key that stops the reply being written while the focus is in the composer, as
 * Stop does. Off by default. A host that wanted Escape had to listen on the window and guess
 * what aparté's own elements do with the key; the composer knows, because what takes the key
 * inside it cancels the keydown first.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../../launcher/aparte-launcher.js';
import '../../chat/aparte-chat.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteLauncher } from '../../launcher/aparte-launcher.js';

function mount(stopKey: string | null = 'Escape', id = 'chat-a'): { composer: AparteComposer; editor: HTMLElement; aborts: unknown[] } {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = id;
    chat.innerHTML = '<aparte-composer><aparte-composer-input></aparte-composer-input></aparte-composer>';
    document.body.appendChild(chat);
    const composer = chat.querySelector('aparte-composer') as AparteComposer;
    if (stopKey) composer.setAttribute('stop-key', stopKey);
    const aborts: unknown[] = [];
    window.addEventListener('aparte-abort', (e) => aborts.push((e as CustomEvent).detail), { once: true });
    return { composer, editor: composer.querySelector('.aparte-ci-editor') as HTMLElement, aborts };
}

const streaming = (targetId = 'chat-a'): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId, messageId: `${targetId}-r` } }));
};
const press = (target: HTMLElement, key = 'Escape', init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};

afterEach(() => {
    window.dispatchEvent(new CustomEvent('aparte-message-aborted', { detail: {} }));
    document.body.innerHTML = '';
});

describe('stop-key', () => {
    it('stops the reply of this chat, and says it took the key', () => {
        const { composer, editor, aborts } = mount();
        streaming();
        const event = press(editor);
        expect(aborts).toEqual([{ targetId: 'chat-a' }]);
        expect(event.defaultPrevented).toBe(true);
        expect(composer.streaming).toBe(false);
    });

    it('does nothing without the attribute, which is the default', () => {
        const { editor, aborts } = mount(null);
        streaming();
        expect(press(editor).defaultPrevented).toBe(false);
        expect(aborts).toEqual([]);
    });

    it('leaves the key alone while no reply is being written', () => {
        const { editor, aborts } = mount();
        expect(press(editor).defaultPrevented).toBe(false);
        expect(aborts).toEqual([]);
    });

    it('is that key alone: not another, and not with a modifier', () => {
        const { editor, aborts } = mount();
        streaming();
        press(editor, 'Enter');
        press(editor, 'Escape', { shiftKey: true });
        press(editor, 'Escape', { ctrlKey: true });
        expect(aborts).toEqual([]);
    });

    it('leaves an Escape that something inside took first, the / menu for one', () => {
        const { composer, editor, aborts } = mount();
        streaming();
        // The triggers menu listens on the composer in the capture phase, and cancels.
        composer.addEventListener('keydown', (e) => e.preventDefault(), { capture: true, once: true });
        press(editor);
        expect(aborts).toEqual([]);
    });

    it('leaves the key to an input method that is composing', () => {
        const { editor, aborts } = mount();
        streaming();
        press(editor, 'Escape', { isComposing: true });
        press(editor, 'Escape', { keyCode: 229 });
        expect(aborts).toEqual([]);
    });

    it('leaves it while a question or an approval is open in the composer', () => {
        const { composer, editor, aborts } = mount();
        streaming();
        composer.showPanel(document.createElement('div'), { mode: 'none' });
        press(editor);
        expect(aborts).toEqual([]);
    });

    it('is forwarded by <aparte-chat>, set at first or later', () => {
        document.body.innerHTML = '<aparte-chat stop-key="Escape"></aparte-chat>';
        const chat = document.querySelector('aparte-chat') as HTMLElement;
        expect(chat.querySelector('aparte-composer')?.getAttribute('stop-key')).toBe('Escape');
        chat.removeAttribute('stop-key');
        expect(chat.querySelector('aparte-composer')?.hasAttribute('stop-key')).toBe(false);
        chat.setAttribute('stop-key', 'F2');
        expect(chat.querySelector('aparte-composer')?.getAttribute('stop-key')).toBe('F2');
    });
});

describe('stop-key inside a launcher', () => {
    it('stops the reply on the first Escape, and closes the card on the next', () => {
        document.body.innerHTML = '<aparte-launcher><div data-aparte-chat id="chat-a"><aparte-composer stop-key="Escape"><aparte-composer-input></aparte-composer-input></aparte-composer></div></aparte-launcher>';
        const launcher = document.querySelector('aparte-launcher') as AparteLauncher;
        launcher.show();
        const editor = launcher.querySelector('.aparte-ci-editor') as HTMLElement;
        const aborts: unknown[] = [];
        window.addEventListener('aparte-abort', (e) => aborts.push((e as CustomEvent).detail));
        streaming();

        press(editor);
        expect(aborts).toHaveLength(1);
        expect(launcher.open).toBe(true);

        press(editor);
        expect(aborts).toHaveLength(1);
        expect(launcher.open).toBe(false);
    });
});
