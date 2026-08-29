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

/**
 * Where the last gesture pressed and where it released. A `click` fires on the nearest
 * common ancestor of the two, so selecting text in the dialog's body and letting go a
 * few pixels past the box targets the `<dialog>` ITSELF — indistinguishable, from the
 * click alone, from a deliberate press on the backdrop. Every engine does it, in both
 * directions (press outside → release inside targets the backdrop too).
 *
 * So the backdrop dismissal asks for both ends on the backdrop. The cost is that a
 * programmatic `dialog.click()` no longer closes the dialog: it never pressed anything.
 * That is the right trade — `close()` is the API for closing a dialog.
 */
let pressTarget: EventTarget | null = null;
let releaseTarget: EventTarget | null = null;

function onPointerDown(event: Event): void {
    pressTarget = event.target;
    releaseTarget = null;
}

function onPointerUp(event: Event): void {
    releaseTarget = event.target;
}

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
    // so a host's dialogs keep whatever they do — and only when the gesture BEGAN and
    // ENDED there, so a selection dragged out of the box is not read as a dismissal.
    if (target instanceof HTMLDialogElement && target.open && target.classList.contains('aparte-dialog') && !target.hasAttribute('data-aparte-dialog-static')) {
        const deliberate = pressTarget === target && releaseTarget === target;
        pressTarget = null;
        releaseTarget = null;
        if (deliberate) target.close();
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
    // Capture, so a host that stops the gesture from propagating still lets the two ends
    // be recorded — the alternative is a backdrop that silently stops dismissing.
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('click', onClick);
}
