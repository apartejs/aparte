/**
 * The placeholder a live frame shows until its document has loaded. Every place that embeds a
 * demo or a template (the catalogue's tiles, the template tiles, the home's carousel and product
 * window, a page's <Variant>) draws the kit's skeleton beside its iframe:
 *
 *     <span class="aparte-skeleton frame-skeleton" aria-hidden="true"></span>
 *
 * laid over the frame by content.css, and imports this module, which removes it once the frame
 * has loaded. It is in the markup rather than added here so it is there from the first paint.
 * A module runs once however many components import it.
 */

// The frames are same-origin, so the document is readable. A lazy frame, or one whose src is
// assigned later (the carousel), still holds its initial about:blank, which is "complete" too.
const loaded = (frame: HTMLIFrameElement): boolean => {
    const doc = frame.contentDocument;
    return !!doc && doc.readyState === 'complete' && doc.URL !== 'about:blank';
};

for (const skeleton of document.querySelectorAll<HTMLElement>('.frame-skeleton')) {
    const frame = skeleton.parentElement?.querySelector('iframe');
    if (!frame) {
        skeleton.remove();
        continue;
    }
    // A frame that finished before this module ran fires no load event for us to hear.
    const settle = (): void => {
        if (loaded(frame)) skeleton.remove();
    };
    frame.addEventListener('load', settle);
    settle();
}
