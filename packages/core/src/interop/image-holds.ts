/**
 * Showing a picture the image policy held in a reply: the click on its link.
 *
 * A held picture is a link to it (`config/image-policy.ts`), so without script the reader
 * still gets it, in a new tab. This turns a plain click on that link into the picture itself,
 * in place, and tells the chat's config (`showImage`) so a redraw shows it again rather than
 * asking twice. A click with a modifier key is left to the browser (a new tab, a new window, a
 * download, as for any link): it is the reader saying what they want done with the address.
 *
 * Inside a link of the reply's own the held picture is a `<span role="button">`, which gets the
 * same click, and Enter or Space from the keyboard, without following the link around it.
 *
 * Installed by the browser entry at import, like the dialog triggers, and idempotent.
 * Internal: not exported from the package barrel.
 */

import { resolveConfig } from '../config/config-context.js';

const INSTALLED = Symbol.for('aparte.imageHolds');

/** A held picture in a reply, in either of the two forms the policy writes. */
const HELD = '.aparte-image-held[data-aparte-image]';

/** Put the picture `link` holds in its place, and remember the reader chose to see it. */
export function showHeldImage(link: Element): void {
    const address = link.getAttribute('data-aparte-image') ?? '';
    resolveConfig(link).showImage(address);
    const img = document.createElement('img');
    // Before `src`: the request is made when the address is set.
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('alt', link.getAttribute('data-aparte-image-alt') ?? '');
    img.setAttribute('src', address);
    const focused = link === document.activeElement;
    link.replaceWith(img);
    // Pressed from the keyboard: the focus stays where the reader was, on the picture.
    if (focused) {
        img.tabIndex = -1;
        img.focus({ preventScroll: true });
    }
}

function onClick(event: MouseEvent): void {
    // A new tab, a window, a download: the browser's, with the address the link holds.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.(HELD);
    if (!link) return;
    // The default is the link's — the held one's, or the reply's around the button form.
    event.preventDefault();
    // Captured on the document, before the bubble announces a link: this is no link the model
    // asked the reader to follow, so no `aparte-link-click` and no router sees it.
    event.stopPropagation();
    showHeldImage(link);
}

/** The button form inside a link: Enter and Space, which a link answers with its click alone. */
function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = event.target as Element | null;
    if (!button?.matches?.(`span${HELD}`)) return;
    event.preventDefault();
    event.stopPropagation();
    showHeldImage(button);
}

/** Install the listeners once per document. */
export function installImageHoldsOnce(): void {
    const doc = document as Document & { [INSTALLED]?: true };
    if (doc[INSTALLED]) return;
    doc[INSTALLED] = true;
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
}
