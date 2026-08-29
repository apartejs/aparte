// @vitest-environment jsdom
/**
 * The dialog wiring: three attributes on the browser's own <dialog>. jsdom draws no
 * top layer and implements neither `showModal()` nor `close()`, so both are stubbed
 * to what the spec says they do to the element — toggle `open`, record `returnValue`,
 * fire `close` — and the assertions are on that.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { installDialogTriggersOnce } from '../dialog-triggers.js';

beforeAll(() => {
    const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: (v?: string) => void };
    if (typeof proto.showModal !== 'function') {
        proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    }
    if (typeof proto.close !== 'function') {
        proto.close = function (this: HTMLDialogElement, value?: string) {
            if (value !== undefined) (this as { returnValue: string }).returnValue = value;
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
    }
    installDialogTriggersOnce();
});

afterEach(() => { document.body.innerHTML = ''; });

function page(extra = ''): { dialog: HTMLDialogElement; opener: HTMLButtonElement } {
    document.body.innerHTML = `
        <button id="open" type="button" data-aparte-dialog-open="settings">Open</button>
        <dialog class="aparte-dialog" id="settings" ${extra}>
            <div class="aparte-dialog__body"><input id="field"></div>
            <button id="cancel" type="button" data-aparte-dialog-close>Cancel</button>
            <button id="save" type="button" data-aparte-dialog-close="saved">Save</button>
        </dialog>`;
    return {
        dialog: document.getElementById('settings') as HTMLDialogElement,
        opener: document.getElementById('open') as HTMLButtonElement,
    };
}

describe('the dialog triggers', () => {
    it('data-aparte-dialog-open shows the dialog it names, modally', () => {
        const { dialog, opener } = page();
        opener.click();
        expect(dialog.open).toBe(true);
    });

    it('data-aparte-dialog-close closes the enclosing dialog and hands its value back as returnValue', () => {
        const { dialog, opener } = page();
        opener.click();
        let seen = '';
        dialog.addEventListener('close', () => { seen = dialog.returnValue; });

        (document.getElementById('save') as HTMLButtonElement).click();

        expect(dialog.open).toBe(false);
        expect(seen).toBe('saved');
    });

    it('a bare data-aparte-dialog-close RESETS returnValue — a Cancel after a Save must not report "saved" again', () => {
        const { dialog, opener } = page();
        opener.click();
        (document.getElementById('save') as HTMLButtonElement).click();
        expect(dialog.returnValue).toBe('saved');

        opener.click();
        (document.getElementById('cancel') as HTMLButtonElement).click();

        expect(dialog.open).toBe(false);
        expect(dialog.returnValue).toBe('');
    });

    it('a click on the backdrop — the dialog element itself — closes it', () => {
        const { dialog, opener } = page();
        opener.click();
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dialog.open).toBe(false);
    });

    it('a click inside the box does not', () => {
        const { dialog, opener } = page();
        opener.click();
        (document.getElementById('field') as HTMLInputElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dialog.open).toBe(true);
    });

    it('data-aparte-dialog-static keeps the backdrop click from closing', () => {
        const { dialog, opener } = page('data-aparte-dialog-static');
        opener.click();
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dialog.open).toBe(true);
    });

    it('leaves a dialog that is not the kit\'s alone on a backdrop click', () => {
        document.body.innerHTML = `<dialog id="mine" open><p>theirs</p></dialog>`;
        const dialog = document.getElementById('mine') as HTMLDialogElement;
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(dialog.open).toBe(true);
    });

    it('an unknown id is a no-op, and installing twice adds no second listener', () => {
        document.body.innerHTML = `<button id="b" type="button" data-aparte-dialog-open="nope">x</button>`;
        installDialogTriggersOnce();
        expect(() => (document.getElementById('b') as HTMLButtonElement).click()).not.toThrow();
        const { dialog, opener } = page();
        opener.click();
        let closes = 0;
        dialog.addEventListener('close', () => { closes += 1; });
        (document.getElementById('cancel') as HTMLButtonElement).click();
        expect(closes, 'one listener, one close').toBe(1);
    });
});
