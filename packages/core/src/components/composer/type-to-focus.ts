/**
 * A key typed in the chat returns to the input.
 *
 * Selecting a few words of a reply to copy them takes the caret out of the input, and the
 * next letters typed went nowhere. The composer takes the caret back on the first key that
 * writes something. It only moves the focus: the key is never cancelled, so the browser
 * writes the character in the input the keydown just focused.
 *
 * Three settings, on the composer's `type-to-focus` attribute, read at every key:
 * - `chat` (the default): only when the person was last IN the chat — the focus is on
 *   something of the chat that is not a field, or it is nowhere and the last pointer went
 *   down in the chat. An embedded chat never takes a key from the page around it.
 * - `page`: from anywhere in the page, as long as no field has the focus. For an app whose
 *   page IS the chat.
 * - `off`: never.
 *
 * Never from a field (an input, a textarea, a select, an editable region, a listbox, a
 * menu…): that key is the field's. Never a shortcut, a key that writes nothing, a key
 * something else already handled, or a key of a composition under way. An input that is
 * hidden (a panel took its place, the launcher is closed) cannot take the focus, so nothing
 * moves there either: `display: none` is what hides it.
 */
export type AparteTypeToFocus = 'chat' | 'page' | 'off';

/** What can read a typed key itself: the caret is never taken from one of these. */
const FIELDS = [
    'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])',
    '[role="textbox"]', '[role="searchbox"]', '[role="combobox"]', '[role="listbox"]',
    '[role="menu"]', '[role="menubar"]', '[role="tree"]', '[role="grid"]',
].join(', ');

const CHAT = 'aparte-chat, [data-aparte-chat]';

function modeOf(composer: Element): AparteTypeToFocus {
    const value = composer.getAttribute('type-to-focus');
    return value === 'page' || value === 'off' ? value : 'chat';
}

/**
 * A key that writes a character. A shortcut does not; AltGr does (it is how `@` and `#` are
 * typed on many keyboards, and it reports Ctrl and Alt both held). The space bar is left
 * out: on a page it scrolls, on a button it presses, and no message starts with it. A dead
 * key is the first half of an accented letter: taking the caret then lets the input compose it.
 */
function writes(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing) return false;
    const altGr = event.getModifierState?.('AltGraph') === true;
    if ((event.ctrlKey || event.metaKey || event.altKey) && !altGr) return false;
    if (event.key === 'Dead') return true;
    return event.key.length === 1 && event.key !== ' ';
}

/** The element that has the focus, through any shadow root on the way. */
function focused(doc: Document): Element | null {
    let active = doc.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/**
 * Listen for the composer; the function returned stops listening. The chat a composer
 * answers for is the one it sits in, else the one its `target` names, and always itself.
 */
export function installTypeToFocus(composer: HTMLElement): () => void {
    const doc = composer.ownerDocument;
    let pointerInChat = false;

    const chat = (): Element[] => {
        const target = composer.getAttribute('target');
        const root = composer.closest(CHAT) ?? (target ? doc.getElementById(target) : null);
        return root ? [root, composer] : [composer];
    };

    const onPointerDown = (event: Event): void => {
        const path = event.composedPath();
        pointerInChat = chat().some((el) => path.includes(el));
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        const mode = modeOf(composer);
        if (mode === 'off' || !writes(event) || composer.hasAttribute('disabled')) return;
        const input = composer.querySelector<HTMLElement & { focusEnd?: () => void }>('aparte-composer-input');
        if (!input || input.hasAttribute('disabled')) return;
        const active = focused(doc);
        if (active?.closest(FIELDS)) return;
        if (mode === 'chat') {
            const nowhere = !active || active === doc.body || active === doc.documentElement;
            const inChat = !nowhere && chat().some((el) => el.contains(active));
            if (!inChat && !(nowhere && pointerInChat)) return;
        }
        input.focusEnd?.();
    };

    // The pointer in the capture phase: a control that stops its own pointerdown still
    // counts as "in the chat". The key in the bubble phase: whoever handles it first can
    // cancel it, and a cancelled key is left alone.
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
        doc.removeEventListener('pointerdown', onPointerDown, true);
        doc.removeEventListener('keydown', onKeyDown);
    };
}
