/**
 * The dialog wiring: three attributes, one delegated listener, no element.
 *
 * The kit's dialog is the browser's `<dialog>` wearing `.aparte-dialog`
 * (`styles/surface/dialog.css`): `showModal()` gives the top layer, the focus trap,
 * Escape and the focus return, so there is no behaviour left for a custom element to
 * own — and wrapping the host's content in one would have moved children a framework
 * renders, which is the one thing a light-DOM element must not do. What the browser
 * does NOT give is a way to open a dialog from a button without a line of script, or
 * to close it from the backdrop. That is what this installs, once per document:
 *
 * - a click on `[data-aparte-dialog-open="id"]` calls `showModal()` on the dialog
 *   with that id;
 * - a click on `[data-aparte-dialog-close]` inside a dialog closes it — the
 *   attribute's value, if any, becomes the dialog's `returnValue`;
 * - a click on the backdrop (the `<dialog>` itself, outside its box) closes an
 *   `.aparte-dialog`, unless it carries `data-aparte-dialog-static`.
 *
 * Installed by the browser entry at import, like the default renderers; exported for
 * a host that builds the page before importing core, and idempotent.
 */

const INSTALLED = Symbol.for('aparte.dialogTriggers');

function onClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;

    const opener = target.closest<HTMLElement>('[data-aparte-dialog-open]');
    if (opener) {
        const id = opener.getAttribute('data-aparte-dialog-open');
        const dialog = id ? document.getElementById(id) : null;
        if (dialog instanceof HTMLDialogElement && !dialog.open) {
            event.preventDefault();
            dialog.showModal();
        }
        return;
    }

    const closer = target.closest<HTMLElement>('[data-aparte-dialog-close]');
    if (closer) {
        const dialog = closer.closest('dialog');
        if (dialog instanceof HTMLDialogElement && dialog.open) {
            event.preventDefault();
            // The attribute's value, EMPTY INCLUDED: `close('')` resets `returnValue`,
            // `close(undefined)` leaves it — so a bare Cancel after a Save used to report
            // "saved" a second time. The selector matched, so the attribute is there.
            dialog.close(closer.getAttribute('data-aparte-dialog-close') ?? '');
        }
        return;
    }

    // The backdrop: a click whose target is the <dialog> element itself lands outside
    // its box, since the box is what its children cover. Only for the kit's own class,
    // so a host's dialogs keep whatever they do.
    if (target instanceof HTMLDialogElement && target.open && target.classList.contains('aparte-dialog') && !target.hasAttribute('data-aparte-dialog-static')) {
        target.close();
    }
}

/**
 * Wire `data-aparte-dialog-open` / `-close` and the backdrop click on this document.
 * Called once by `@aparte/core` at import; safe to call again.
 */
export function installDialogTriggersOnce(doc: Document = document): void {
    const marked = doc as Document & { [INSTALLED]?: true };
    if (marked[INSTALLED]) return;
    marked[INSTALLED] = true;
    doc.addEventListener('click', onClick);
}
