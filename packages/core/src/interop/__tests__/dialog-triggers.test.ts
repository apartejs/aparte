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

/**
 * A pointer gesture, in the order the engines send it: `pointerdown` where the press
 * landed, `pointerup` where it was released, then one `click` on their common ancestor
 * — which for a drag out of the box IS the `<dialog>` itself. jsdom has no
 * `PointerEvent`; a `MouseEvent` carries everything the listeners read.
 */
function press(from: HTMLElement, to: HTMLElement): void {
    const mouse = (type: string): MouseEvent => new MouseEvent(type, { bubbles: true, cancelable: true });
    from.dispatchEvent(mouse('pointerdown'));
    to.dispatchEvent(mouse('pointerup'));
    (from === to ? from : commonAncestor(from, to)).dispatchEvent(mouse('click'));
}

function commonAncestor(a: HTMLElement, b: HTMLElement): HTMLElement {
    let node: HTMLElement | null = a;
    while (node && !node.contains(b)) node = node.parentElement;
    return node ?? document.body;
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
        press(dialog, dialog);
        expect(dialog.open).toBe(false);
    });

    it('a click inside the box does not', () => {
        const { dialog, opener } = page();
        opener.click();
        const field = document.getElementById('field') as HTMLInputElement;
        press(field, field);
        expect(dialog.open).toBe(true);
    });

    it('a selection drag that starts in the box and ends on the backdrop does not close it', () => {
        const { dialog, opener } = page();
        opener.click();
        // Select the text in the body and overshoot: the release lands on the <dialog>
        // itself, so the click's target IS the backdrop even though nobody clicked it.
        press(document.getElementById('field') as HTMLElement, dialog);
        expect(dialog.open, 'a drag-select is not a dismissal').toBe(true);
    });

    it('a press on the backdrop released inside the box does not close it either', () => {
        const { dialog, opener } = page();
        opener.click();
        press(dialog, document.getElementById('field') as HTMLElement);
        expect(dialog.open).toBe(true);
    });

    it('a programmatic click() on the dialog does not close it — close() does', () => {
        const { dialog, opener } = page();
        opener.click();
        dialog.click();
        expect(dialog.open, 'no press, no release, no dismissal').toBe(true);
        dialog.close();
        expect(dialog.open).toBe(false);
    });

    it('data-aparte-dialog-static keeps the backdrop click from closing', () => {
        const { dialog, opener } = page('data-aparte-dialog-static');
        opener.click();
        press(dialog, dialog);
        expect(dialog.open).toBe(true);
    });

    it('leaves a dialog that is not the kit\'s alone on a backdrop click', () => {
        document.body.innerHTML = `<dialog id="mine" open><p>theirs</p></dialog>`;
        const dialog = document.getElementById('mine') as HTMLDialogElement;
        press(dialog, dialog);
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
