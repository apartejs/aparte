/**
 * The icon button that copies a block's text — the code block's, and a tool call's parts.
 *
 * One builder, so the two cannot drift: the same recipe, the same accessible name, the
 * same "copied" confirmation and the same rule that a relabel leaves a confirmation the
 * reader is still looking at alone.
 */
import { escapeAttr } from '../utils/escape.js';
import { copyText } from '../utils/copy-text.js';
import { contextConfig } from '../config/index.js';

/** How long the check mark stays before the button returns to rest. */
const CONFIRM_MS = 1500;

/**
 * The tooltip and the accessible name are the same string and move together: an icon
 * button named by `title` alone has nothing for a screen reader to read, so both are set.
 */
function nameButton(button: HTMLElement, label: string): void {
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
}

/** The button, at rest. `className` is the component's own hook beside the recipe's. */
export function copyButtonMarkup(className: string): string {
    const label = escapeAttr(contextConfig().t('copy'));
    const icon = contextConfig().getIcon('copy');  // safe-text: the icon provider's SVG — the same contract as getIcon, where escaping would print the source
    return `<button type="button" class="aparte-btn aparte-btn--icon aparte-btn--sm ${escapeAttr(className)}" data-action="copy" aria-label="${label}" title="${label}">${icon}</button>`;
}

/**
 * Copy what `read()` returns on click, then confirm with a check mark for a moment.
 *
 * `read` is called at click time — the DOM, not a segment a closure captured at setup,
 * which for a streamed block was still empty.
 */
export function wireCopyButton(button: HTMLElement, read: () => string): void {
    button.addEventListener('click', () => {
        // Late execution (user click) — the ambient render config is gone; resolve from
        // the connected element instead.
        void copyText(read()).catch(() => { /* best-effort: a failed clipboard write degrades silently */ });
        button.innerHTML = contextConfig(button).getIcon('check');
        nameButton(button, contextConfig(button).t('copied'));
        // Marked, so `relabelCopyButton` does not cancel a confirmation the reader is
        // still looking at. The flag is also the only way to tell the two states apart:
        // they differ by title and icon alone, and after a locale switch the old title
        // matches nothing.
        button.dataset['copied'] = '1';
        setTimeout(() => {
            button.innerHTML = contextConfig(button).getIcon('copy');
            nameButton(button, contextConfig(button).t('copy'));
            delete button.dataset['copied'];
        }, CONFIRM_MS);
    });
}

/** The button's icon and name from the current config — skipped while it confirms a copy. */
export function relabelCopyButton(button: HTMLElement): void {
    // Its own timeout restores the resting state from the new config a moment later.
    if (button.dataset['copied']) return;
    nameButton(button, contextConfig().t('copy'));
    button.innerHTML = contextConfig().getIcon('copy');
}
