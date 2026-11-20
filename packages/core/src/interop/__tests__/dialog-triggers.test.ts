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

describe('inside a shadow root of the app', () => {
    // A Lit or Stencil app puts its markup in its own shadow root. A click from there reaches the
    // document with the shadow HOST as its target, so the opener and the closer were never found,
    // and the dialog was looked up in the document, where it is not.
    function shadowPage(): { root: ShadowRoot; dialog: HTMLDialogElement } {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <button id="open" type="button" data-aparte-dialog-open="settings">Open</button>
            <dialog class="aparte-dialog" id="settings">
                <button id="save" type="button" data-aparte-dialog-close="saved">Save</button>
            </dialog>`;
        return { root, dialog: root.getElementById('settings') as HTMLDialogElement };
    }
    const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));

    it('the opener opens the dialog of its own root, and the closer closes it', () => {
        const { root, dialog } = shadowPage();
        click(root.getElementById('open')!);
        expect(dialog.open).toBe(true);
        click(root.getElementById('save')!);
        expect(dialog.open).toBe(false);
        expect(dialog.returnValue).toBe('saved');
    });

    // The backdrop asks for the press AND the release on the <dialog>. Both ends are read where
    // the gesture began; a release read as the shadow host never matched the press.
    it('a press and a release on the backdrop close the dialog', () => {
        const { root, dialog } = shadowPage();
        click(root.getElementById('open')!);
        const pointer = (type: string) => dialog.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
        pointer('pointerdown');
        pointer('pointerup');
        click(dialog);
        expect(dialog.open).toBe(false);
    });
});

describe('an opener or a closer made of a web component', () => {
    // A Shoelace or Material button, or an icon component inside a plain button: the click lands
    // in the component's own shadow root, and `closest()` from there stops at that root's edge.
    // Read from `event.target` (the host, as the document sees it), the control was found; read
    // from where the click began, it was not.
    class ShadowIcon extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' }).innerHTML = '<span part="glyph">*</span>';
        }
    }
    beforeAll(() => {
        if (!customElements.get('x-shadow-icon')) customElements.define('x-shadow-icon', ShadowIcon);
    });
    const glyphOf = (el: Element): Element => el.querySelector('x-shadow-icon')!.shadowRoot!.querySelector('span')!;
    const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));

    it('a click on the icon inside an opener opens the dialog', () => {
        const { dialog, opener } = page();
        opener.innerHTML = '<x-shadow-icon></x-shadow-icon>';
        click(glyphOf(opener));
        expect(dialog.open).toBe(true);
    });

    it('a click on the icon inside a closer closes the dialog with its value', () => {
        const { dialog, opener } = page();
        opener.click();
        const save = document.getElementById('save')!;
        save.innerHTML = '<x-shadow-icon></x-shadow-icon>';
        click(glyphOf(save));
        expect(dialog.open).toBe(false);
        expect(dialog.returnValue).toBe('saved');
    });

    it('a click inside a component that IS the opener opens the dialog', () => {
        const { dialog } = page();
        const button = document.createElement('x-shadow-icon');
        button.setAttribute('data-aparte-dialog-open', 'settings');
        document.body.appendChild(button);
        click(button.shadowRoot!.querySelector('span')!);
        expect(dialog.open).toBe(true);
    });
});
