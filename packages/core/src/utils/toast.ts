/**
 * `showToast` — a short message in a corner of the page, which goes away on its own.
 *
 * For what has nowhere else to be said: why an action did not happen (a conversation dragged to a
 * project while its reply still runs), that something was saved. It is the kit's alert
 * (`.aparte-alert`, its tones), stacked in a fixed corner that never moves the layout under the
 * pointer, announced to assistive technology (`role="status"`, `role="alert"` for `danger`),
 * closed by its button or Escape, and gone after `timeout` — paused while it is hovered or holds
 * the focus, so it can be read and reached (WCAG 2.2.1).
 *
 * Not for what a person must act on: a dialog asks, a toast tells.
 */
import { resolveConfig } from '../config/config-context.js';

/** A toast's colour, as the kit's alert tones: `danger` is also announced at once. */
export type AparteToastTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface AparteToastOptions {
    /** Its tone (default `'info'`). `'danger'` is announced as an alert, interrupting. */
    tone?: AparteToastTone;
    /** Milliseconds before it goes on its own (default 5000); `0` keeps it until it is closed. */
    timeout?: number;
}

export interface AparteToast {
    /** The toast's own element, an `.aparte-alert`. */
    readonly element: HTMLElement;
    /** Take it away now. Closing twice does nothing. */
    close(): void;
}

const DEFAULT_TIMEOUT = 5000;

/** Under the pointer now: an engine that cannot say reads as not. */
const hovered = (el: Element): boolean => {
    try {
        return el.matches(':hover');
    } catch {
        return false;
    }
};
const NOTHING: AparteToast = { element: null as unknown as HTMLElement, close: () => {} };

/** The corner the toasts stack in: one per document, made the first time one is shown. */
function stackOf(doc: Document): { stack: HTMLElement; fresh: boolean } {
    const found = doc.body.querySelector<HTMLElement>(':scope > .aparte-toasts');
    if (found) return { stack: found, fresh: false };
    const stack = doc.createElement('div');
    stack.className = 'aparte-toasts';
    stack.setAttribute('role', 'region');
    // Polite: a toast waits for what is being read to end, except an alert, which says so itself.
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-label', resolveConfig(doc.body).t('notifications') || 'Notifications');
    doc.body.append(stack);
    return { stack, fresh: true };
}

/**
 * Show `text` in a toast. Returns a handle to close it before its time.
 *
 * @example
 * import { showToast } from '@aparte/core';
 *
 * showToast('A reply is still running: move it once it is done.', { tone: 'warning' });
 */
export function showToast(text: string, options: AparteToastOptions = {}): AparteToast {
    // A server render has no page to show it on.
    if (typeof document === 'undefined' || !document.body) return NOTHING;
    const tone = options.tone ?? 'info';
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const config = resolveConfig(document.body);

    const toast = document.createElement('div');
    toast.className = `aparte-alert aparte-alert--${tone}`;
    toast.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const body = document.createElement('div');
    body.className = 'aparte-alert__body';
    const message = document.createElement('p');
    message.className = 'aparte-alert__message';
    message.textContent = text;
    body.append(message);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'aparte-alert__dismiss';
    dismiss.setAttribute('aria-label', config.t('dismissNotification') || 'Dismiss');
    dismiss.innerHTML = config.getIcon('close');  // safe-text: the icon provider's SVG markup, not text
    toast.append(body, dismiss);

    let closed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let left = timeout;
    let startedAt = 0;
    const stop = (): void => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
        left -= Date.now() - startedAt;
    };
    const start = (): void => {
        if (closed || timeout === 0 || timer !== null) return;
        startedAt = Date.now();
        timer = setTimeout(close, Math.max(0, left));
    };
    function close(): void {
        if (closed) return;
        closed = true;
        if (timer !== null) clearTimeout(timer);
        toast.remove();
    }

    // Read, or reached from the keyboard: it stays while it is hovered or holds the focus.
    toast.addEventListener('mouseenter', stop);
    toast.addEventListener('mouseleave', () => { if (!toast.contains(document.activeElement)) start(); });
    toast.addEventListener('focusin', stop);
    toast.addEventListener('focusout', (e) => {
        if (!toast.contains(e.relatedTarget as Node | null) && !hovered(toast)) start();
    });
    toast.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
    });
    dismiss.addEventListener('click', close);

    const { stack, fresh } = stackOf(document);
    // A live region just made is not yet heard: what is put in it at once may not be announced.
    // The first toast waits a moment for the region to be in place.
    const show = (): void => {
        if (closed) return;
        stack.append(toast);
        start();
    };
    if (fresh) setTimeout(show, 50);
    else show();
    return { element: toast, close };
}
