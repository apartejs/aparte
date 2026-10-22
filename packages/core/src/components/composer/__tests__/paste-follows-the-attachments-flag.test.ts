// @vitest-environment jsdom
/**
 * A pasted image becomes an attachment only where attachments are on.
 *
 * The paste handler pushed every pasted image to the composer, with no guard, so a chat that
 * offered no attachments — no add-attachment button, no drop target — still collected a
 * pasted screenshot and sent it. The signal is the one drag and drop answers to: an
 * `<aparte-composer-add-attachment>` in the composer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../aparte-composer-add-attachment.js';

function mount(withAttachments: boolean): { composer: HTMLElement & { addAttachments(f: File[]): void }; editor: HTMLElement } {
    const composer = document.createElement('aparte-composer') as HTMLElement & { addAttachments(f: File[]): void };
    composer.appendChild(document.createElement('aparte-composer-input'));
    if (withAttachments) composer.appendChild(document.createElement('aparte-composer-add-attachment'));
    document.body.appendChild(composer);
    return { composer, editor: composer.querySelector<HTMLElement>('.aparte-ci-editor')! };
}

/** A paste event carrying one PNG, the way a screenshot arrives. */
function pasteImage(target: HTMLElement): void {
    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { items: [{ type: 'image/png', getAsFile: () => file }], getData: () => '' };
    target.dispatchEvent(event);
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pasting an image', () => {
    it('attaches it when the composer offers attachments', () => {
        const { composer, editor } = mount(true);
        const add = vi.spyOn(composer, 'addAttachments');
        pasteImage(editor);
        expect(add).toHaveBeenCalledTimes(1);
    });

    it('attaches nothing when it offers none', () => {
        const { composer, editor } = mount(false);
        const add = vi.spyOn(composer, 'addAttachments');
        pasteImage(editor);
        expect(add).not.toHaveBeenCalled();
    });
});
