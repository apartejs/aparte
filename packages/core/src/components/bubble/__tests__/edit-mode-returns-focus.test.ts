// @vitest-environment jsdom
/**
 * Leaving the inline editor puts the keyboard back on the button that opened it.
 *
 * Both exits destroy the focused element: the editor node is removed, and the action
 * bar is rebuilt with `innerHTML`, so the ✓ / ✗ buttons are destroyed too. Focus then
 * falls to `<body>` and the next Tab restarts at the top of the page — the reader who
 * edited the fourth message of a long transcript has to walk back down to it.
 *
 * The node cannot be remembered (its identity is destroyed twice); the `data-action`
 * string can, and it names the same button in the rebuilt bar.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../composer/aparte-composer-input.js';
import { aparteGlobalConfig } from '../../../config/index.js';

const mountUserBubble = (): HTMLElement => {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('data-role', 'user');
    el.setAttribute('message-id', 'u1');
    document.body.appendChild(el);
    (el as HTMLElement & { updateMessage(u: { content: string }): void }).updateMessage({ content: 'first draft' });
    return el;
};

const editButton = (el: HTMLElement): HTMLButtonElement =>
    el.querySelector('[data-action="edit"]') as HTMLButtonElement;

/** Open the editor the way a reader does: the button takes focus, then fires. */
const openEditor = (el: HTMLElement): HTMLElement => {
    const btn = editButton(el);
    btn.focus();
    btn.click();
    return el.querySelector('aparte-composer-input') as HTMLElement;
};

describe('leaving the inline editor returns the focus to the action bar', () => {
    beforeEach(() => aparteGlobalConfig.setBubbleActions({ edit: true }));
    afterEach(() => {
        aparteGlobalConfig.reset();
        document.body.innerHTML = '';
    });

    it('Escape cancels and the edit button gets the keyboard back', () => {
        const el = mountUserBubble();
        const input = openEditor(el);
        expect(input).not.toBeNull();

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(el.querySelector('aparte-composer-input')).toBeNull();
        expect(document.activeElement).toBe(editButton(el));
    });

    it('the ✓ button saves and hands the keyboard back to the edit button', () => {
        const el = mountUserBubble();
        openEditor(el);
        const save = el.querySelector('[data-action="edit-save"]') as HTMLButtonElement;
        save.focus();
        save.click();

        expect(document.activeElement).toBe(editButton(el));
    });

    it('Enter (aparte-composer-submit) saves and hands the keyboard back too', () => {
        const el = mountUserBubble();
        const input = openEditor(el);

        input.dispatchEvent(new CustomEvent('aparte-composer-submit', { bubbles: true }));

        expect(document.activeElement).toBe(editButton(el));
    });

    it('does not steal the focus when the editor was opened from outside the bubble', () => {
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        const el = mountUserBubble();
        editButton(el).click();          // no focus on the opener
        const input = el.querySelector('aparte-composer-input') as HTMLElement;
        outside.focus();                 // the reader moved on

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(document.activeElement).toBe(outside);
    });
    it('the restored button becomes the single tab stop of the bar', () => {
        const el = mountUserBubble();
        const input = openEditor(el);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        // `role="toolbar"` is one tab stop that moves with the arrows. The rebuilt bar
        // parks it on the first button (copy), so focusing edit without moving the stop
        // leaves the reader on a `tabindex="-1"` member: Shift+Tab out, Tab back, and
        // they are on copy — not where they were.
        expect(editButton(el).tabIndex).toBe(0);
        expect((el.querySelector('[data-action="copy"]') as HTMLButtonElement).tabIndex).toBe(-1);
    });

    it('falls back to an enabled button when the remembered action came back disabled', () => {
        const el = mountUserBubble();
        const input = openEditor(el);

        // The reader sent from the composer while the editor was open: the transcript
        // went busy, so edit is rebuilt disabled. `focus()` on a disabled button is a
        // no-op, which drops the reader on `<body>` — the very bug, silently.
        (el as HTMLElement & { setTranscriptBusy(b: boolean): void }).setTranscriptBusy(true);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        const copy = el.querySelector('[data-action="copy"]') as HTMLButtonElement;
        expect(editButton(el).disabled).toBe(true);
        expect(document.activeElement).toBe(copy);
        expect(copy.tabIndex).toBe(0);
    });
});
