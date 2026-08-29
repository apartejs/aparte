/**
 * Copy text to the clipboard, in every context the library actually runs in.
 *
 * `navigator.clipboard` is **secure-context only** — the same wall `uuid.ts` documents
 * for `crypto.randomUUID`. On `http://192.168.1.x`, the archetypal deployment for this
 * library's own audience, the property is `undefined`, so
 * `navigator.clipboard.writeText(text)` throws a TypeError synchronously — before any
 * `.catch()` can see it. The three copy buttons core renders (the bubble's action bar, a
 * code block, the artifact card) each had a `.catch()` for a REJECTED write and nothing
 * for a missing API: on plain http they threw in the click handler and gave no feedback
 * at all, not even a failed one.
 *
 * The fallback is `document.execCommand('copy')` — deprecated, but every engine still
 * honours it from a user gesture and it needs no secure context. The text goes into an
 * off-screen textarea, is selected, copied, and the textarea is removed; focus is handed
 * back to where it was, so a keyboard user does not lose their place on the button. It is
 * the path clipboard.js and copy-to-clipboard take, for the same reason.
 *
 * Rejects when neither path could copy, so a caller's "copied" confirmation can stay
 * honest. `pnpm check:secure-context` refuses a bare `navigator.clipboard` anywhere but
 * here, so the sweep cannot come undone one call site at a time.
 */
export function copyText(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text);
    }
    return new Promise<void>((resolve, reject) => {
        if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
            reject(new Error('[aparte] No clipboard available in this context'));
            return;
        }
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.setAttribute('aria-hidden', 'true');
        // Off-screen, not `display: none` — a hidden control cannot hold a selection.
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        area.style.opacity = '0';
        const active = document.activeElement;
        document.body.appendChild(area);
        // Focus explicitly: `select()` focuses in browsers but not everywhere, and the
        // command copies the DOCUMENT's selection — which is the focused control's.
        area.focus();
        area.select();
        area.setSelectionRange(0, text.length);
        let copied = false;
        try { copied = document.execCommand('copy'); } catch { copied = false; }
        area.remove();
        if (active instanceof HTMLElement) active.focus();
        if (copied) resolve();
        else reject(new Error('[aparte] Clipboard write failed'));
    });
}
