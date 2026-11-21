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
import { activeElementIn } from './event-target.js';

/** A toast's colour, as the kit's alert tones: `danger` is also announced at once. */
export type AparteToastTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface AparteToastOptions {
    /** Its tone (default `'info'`). `'danger'` is announced as an alert, interrupting. */
    tone?: AparteToastTone;
    /** Milliseconds before it goes on its own (default 5000); `0` keeps it until it is closed. */
    timeout?: number;
    /**
     * The element the message is about, usually the chat. The toast then goes in that element's
     * tree (the shadow root it is in, where the kit's sheet was loaded) and wears its theme (the
     * `data-aparte-theme` of its nearest ancestor that has one). Without it, the page's.
     */
    target?: Element;
}

export interface AparteToast {
    /** The toast's own element, an `.aparte-alert`. */
    readonly element: HTMLElement;
    /** Take it away now. Closing twice does nothing. */
    close(): void;
}

const DEFAULT_TIMEOUT = 5000;
/** How long a live region just made waits before it is spoken into. */
const REGION_SETTLES_MS = 50;

/** Under the pointer now: an engine that cannot say reads as not. */
const hovered = (el: Element): boolean => {
    try {
        return el.matches(':hover');
    } catch {
        return false;
    }
};
const isModal = (dialog: Element): boolean => {
    try {
        return dialog.matches(':modal');
    } catch {
        return false;
    }
};
const NOTHING: AparteToast = { element: null as unknown as HTMLElement, close: () => {} };

/**
 * The toasts a region just made holds back, in the order they were shown. A live region is not
 * heard at once: what goes in it in the same task may not be announced. Every toast shown before
 * the region is in place waits for it, the first and the ones after it, so they keep their order.
 */
const settling = new WeakMap<Element, Array<() => void>>();

/**
 * Where a toast goes. The page's body, or the shadow root its target is in. While a modal dialog
 * is open there, inside it: a modal dialog makes everything outside it inert and draws it under
 * its backdrop, so a toast shown from an action in a dialog could be neither read nor reached,
 * nor heard. The topmost one is the one that holds the focus.
 */
function homeOf(target: Element | undefined): Element | ShadowRoot {
    const root = target?.getRootNode();
    const base: Element | ShadowRoot = root instanceof ShadowRoot ? root : document.body;
    const focusedIn = activeElementIn(base instanceof ShadowRoot ? base : document.body)?.closest('dialog');
    if (focusedIn && isModal(focusedIn)) return focusedIn;
    let top: Element | null = null;
    for (const dialog of base.querySelectorAll('dialog[open]')) if (isModal(dialog)) top = dialog;
    return top ?? base;
}

/** The corner the toasts stack in, in `home`: one per place, made the first time one is shown. */
function stackIn(home: Element | ShadowRoot): HTMLElement {
    // Among its children: `:scope` names nothing on a shadow root.
    const found = [...home.children].find((child): child is HTMLElement => child.classList.contains('aparte-toasts'));
    if (found) return found;
    const doc = home.ownerDocument ?? document;
    const stack = doc.createElement('div');
    stack.className = 'aparte-toasts';
    stack.setAttribute('role', 'region');
    // Polite: a toast waits for what is being read to end, except an alert, which says so itself.
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-label', resolveConfig(home instanceof ShadowRoot ? home.host : home).t('notifications') || 'Notifications');
    home.append(stack);
    const waiting: Array<() => void> = [];
    settling.set(stack, waiting);
    setTimeout(() => {
        settling.delete(stack);
        for (const show of waiting) show();
    }, REGION_SETTLES_MS);
    // A dialog closes with its toasts in it: what is still to be read goes back to the page.
    if (home instanceof HTMLDialogElement) {
        home.addEventListener('close', () => {
            const left = [...stack.children];
            stack.remove();
            if (left.length === 0) return;
            const back = stackIn(homeOf(home));
            back.append(...left);
        }, { once: true });
    }
    return stack;
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
    const config = resolveConfig(options.target ?? document.body);

    const toast = document.createElement('div');
    toast.className = `aparte-alert aparte-alert--${tone}`;
    toast.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const theme = options.target?.closest('[data-aparte-theme]')?.getAttribute('data-aparte-theme');
    if (theme) toast.setAttribute('data-aparte-theme', theme);
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
    let runningSince = 0;
    /** Where the focus was before it came into the toast: where it goes back when the toast goes. */
    let cameFrom: HTMLElement | null = null;
    const stop = (): void => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
        left -= Date.now() - runningSince;
    };
    const start = (): void => {
        if (closed || timeout === 0 || timer !== null) return;
        runningSince = Date.now();
        timer = setTimeout(close, Math.max(0, left));
    };
    function close(): void {
        if (closed) return;
        closed = true;
        if (timer !== null) clearTimeout(timer);
        // Removed with the focus in it, the toast took the focused element away and the focus fell
        // to <body>: it goes back where it came from, when that is still on the page.
        const held = toast.contains(activeElementIn(toast));
        toast.remove();
        if (held && cameFrom?.isConnected) cameFrom.focus();
    }

    // Read, or reached from the keyboard: it stays while it is hovered or holds the focus.
    toast.addEventListener('mouseenter', stop);
    toast.addEventListener('mouseleave', () => { if (!toast.contains(activeElementIn(toast))) start(); });
    toast.addEventListener('focusin', (e) => {
        const from = e.relatedTarget as HTMLElement | null;
        if (from && !toast.contains(from)) cameFrom = from;
        stop();
    });
    toast.addEventListener('focusout', (e) => {
        if (!toast.contains(e.relatedTarget as Node | null) && !hovered(toast)) start();
    });
    toast.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
    });
    dismiss.addEventListener('click', close);

    const stack = stackIn(homeOf(options.target));
    const show = (): void => {
        if (closed) return;
        stack.append(toast);
        start();
    };
    const waiting = settling.get(stack);
    if (waiting) waiting.push(show);
    else show();
    return { element: toast, close };
}
