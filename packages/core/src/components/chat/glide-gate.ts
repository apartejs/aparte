/**
 * `data-glide` on a centring chat once a person is there: the first key or pointer in the page,
 * or a send from inside the chat.
 *
 * The composer's slide between the welcome state and a conversation reads it (shell.css). A
 * conversation a script restores on load therefore lands in one frame — sliding it there, before
 * anyone had touched the page, was a layout shift the reader never caused (CLS 0.14 on a phone).
 * Every change after that, a send, an opened conversation, a new chat, still glides.
 *
 * Returns the teardown. Used by `<aparte-chat>` on itself and by the framework hosts on their root.
 */
export function gateGlide(el: HTMLElement): () => void {
    if (el.hasAttribute('data-glide')) return () => {};
    const doc = el.ownerDocument;
    const off = (): void => {
        doc.removeEventListener('pointerdown', lift, true);
        doc.removeEventListener('keydown', lift, true);
        el.removeEventListener('aparte-send', lift);
    };
    const lift = (): void => {
        el.setAttribute('data-glide', '');
        off();
    };
    doc.addEventListener('pointerdown', lift, true);
    doc.addEventListener('keydown', lift, true);
    el.addEventListener('aparte-send', lift);
    return off;
}
