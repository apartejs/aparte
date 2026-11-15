/**
 * The keyboard for a panel whose options are buttons: a single-choice question
 * (`.aparte-elic-option--command`) and an approval (`.aparte-approval-option`).
 *
 * Two keys, one handler, because both panels are the same act (a click that settles):
 *
 *  - **1 to 9** press the n-th option, and only while an option has the focus. The panel
 *    deliberately focuses its own container while the person is typing in the composer
 *    (so Enter is never "Approve"), and a digit typed then belongs to the sentence, not to
 *    the list: "I have 2…" must not pick option 2.
 *  - **Escape** is "Skip" on a question, and on an approval the option whose tone is
 *    `deny` — only when there is exactly one, because with two a key cannot know which
 *    refusal was meant. It is always `preventDefault()`ed once it acted: the launcher
 *    closes on an Escape nobody handled.
 *
 * Inert in a text field (the "Other" field, the instruction), on a repeated key, with a
 * modifier, and during IME composition — a digit or Escape there means something else.
 */

/** The options a number can press. */
const OPTION = '.aparte-elic-option--command, .aparte-approval-option';
const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Number the options (at most nine) and say so to assistive technology. Call after the panel is built. */
export function numberOptions(panel: HTMLElement): void {
    const options = [...panel.querySelectorAll<HTMLElement>(OPTION)];
    options.forEach((option, i) => {
        if (i >= 9) return;
        option.setAttribute('data-shortcut', String(i + 1));
        option.setAttribute('aria-keyshortcuts', String(i + 1));
    });
}

/**
 * Listen on `panel` for the keys above. Returns the function that stops listening (the panel
 * is removed on close, so a caller may ignore it).
 */
export function bindOptionKeys(panel: HTMLElement): () => void {
    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.defaultPrevented || e.repeat || e.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        // A panel put aside (`data-collapsed`) is not the thing the person is looking at.
        if (panel.hasAttribute('data-collapsed')) return;
        const target = e.target instanceof Element ? e.target : null;
        if (!target || target.closest(TEXT_FIELD)) return;

        if (/^[1-9]$/.test(e.key)) {
            // Only from an option: the panel's own container has the focus while the person types.
            if (!target.closest(OPTION)) return;
            const option = panel.querySelectorAll<HTMLElement>(OPTION)[Number(e.key) - 1];
            if (!option) return;
            e.preventDefault();
            option.click();
            return;
        }

        if (e.key === 'Escape') {
            const skip = panel.querySelector<HTMLElement>('.aparte-elic-skip');
            const denies = panel.querySelectorAll<HTMLElement>('.aparte-approval-option--deny');
            const answer = skip ?? (denies.length === 1 ? denies[0]! : null);
            if (!answer) return;
            e.preventDefault();
            answer.click();
        }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
}
