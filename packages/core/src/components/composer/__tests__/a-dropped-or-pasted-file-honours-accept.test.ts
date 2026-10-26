// @vitest-environment jsdom
/**
 * A file outside the picker's `accept` list is not attached, however it arrives.
 *
 * `accept` only ever reached the file input, where the browser reads it as a suggestion:
 * its dialog offers "All files", and a drop or a paste never sees the list at all. Measured
 * on a real n8n bench: with `accept="image/*"`, a PDF dropped on the composer was attached
 * and sent. The list is now checked where the file arrives — the drop, the paste, and the
 * picker's own answer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../aparte-composer-add-attachment.js';
import { acceptsFile } from '../accepts-file.js';

type Composer = HTMLElement & { attachments: File[] };

function mount(accept?: string): { composer: Composer; editor: HTMLElement } {
    const composer = document.createElement('aparte-composer') as Composer;
    composer.appendChild(document.createElement('aparte-composer-input'));
    const add = document.createElement('aparte-composer-add-attachment');
    if (accept !== undefined) add.setAttribute('accept', accept);
    composer.appendChild(add);
    document.body.appendChild(composer);
    return { composer, editor: composer.querySelector<HTMLElement>('.aparte-ci-editor')! };
}

const pdf = (name = 'menu.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
const png = (name = 'photo.png') => new File(['png'], name, { type: 'image/png' });
const names = (composer: Composer) => composer.attachments.map((f) => f.name);

function drop(target: HTMLElement, files: File[]): void {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    event.dataTransfer = { files };
    target.dispatchEvent(event);
}

function paste(target: HTMLElement, file: File): void {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { items: [{ type: file.type, getAsFile: () => file }], getData: () => '' };
    target.dispatchEvent(event);
}

/** Click the button, then answer the file input it puts on the page with `files`. */
function pick(composer: Composer, files: File[]): void {
    composer.querySelector<HTMLButtonElement>('aparte-composer-add-attachment button')!.click();
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: files });
    input.dispatchEvent(new Event('change'));
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('the accept list holds wherever a file arrives', () => {
    it('a drop keeps only the files the list admits', () => {
        const { composer } = mount('image/*');
        drop(composer, [pdf(), png()]);
        expect(names(composer)).toEqual(['photo.png']);
    });

    it('a drop of nothing admissible attaches nothing at all', () => {
        const { composer } = mount('image/*');
        const spy = vi.spyOn(composer as unknown as { addAttachments(f: File[]): void }, 'addAttachments');
        drop(composer, [pdf()]);
        expect(spy).not.toHaveBeenCalled();
    });

    it('a pasted image outside the list is not attached', () => {
        const { composer, editor } = mount('application/pdf');
        paste(editor, png('shot.png'));
        expect(names(composer)).toEqual([]);
    });

    it('a pasted image inside the list is', () => {
        const { composer, editor } = mount('image/png,.pdf');
        paste(editor, png('shot.png'));
        expect(names(composer)).toEqual(['shot.png']);
    });

    it("the picker's answer is checked too: its dialog offers \"All files\"", () => {
        const { composer } = mount('image/*');
        pick(composer, [pdf(), png()]);
        expect(names(composer)).toEqual(['photo.png']);
    });

    it('without a list, everything is admitted, as before', () => {
        const { composer } = mount();
        drop(composer, [pdf(), png()]);
        expect(names(composer)).toEqual(['menu.pdf', 'photo.png']);
    });
});

describe('acceptsFile reads a list the way the browser does', () => {
    // Plain strings in the table: a jsdom File in a test title is formatted in full.
    it.each([
        ['image/*', 'photo.png', 'image/png', true],
        ['image/*', 'menu.pdf', 'application/pdf', false],
        ['.pdf', 'MENU.PDF', 'application/pdf', true],
        ['.pdf', 'menu.pdf.txt', 'text/plain', false],
        ['application/pdf', 'menu.pdf', 'application/pdf', true],
        [' IMAGE/PNG , .pdf ', 'photo.png', 'image/png', true],
        ['', 'menu.pdf', 'application/pdf', true],
        [null, 'menu.pdf', 'application/pdf', true],
        ['image/*', 'unknown', '', false],
    ] as const)('%s admits %s (%s): %s', (accept, name, type, expected) => {
        expect(acceptsFile(accept, new File(['x'], name, { type }))).toBe(expected);
    });
});
