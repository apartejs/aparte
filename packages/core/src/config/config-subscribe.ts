/**
 * One way for an element to hear that its config changed.
 *
 * `AparteConfig._notify()` dispatches `aparte-config-change` on `window` so that
 * components already on screen pick up a live change — a language switch, a new
 * icon set, different bubble actions. Five components subscribed to it, each with
 * its own verbatim copy of the same three lines, and the event name written out as
 * a string literal in each. Every component that reads config at RENDER time and
 * did not copy those lines is silently stale: sixteen of the twenty-one files that
 * read an icon or a locale string never re-read it, while the docs say "a locale
 * switch is live: mounted components re-render immediately".
 *
 * So: one function, and it owns both the event name and the scope rule.
 *
 * @param el      the element whose config decides whether a change is *its* change
 * @param handler called on a relevant change — do a TARGETED refresh, not a
 *                re-render: several components render once by design and their DOM
 *                holds live state (focus, listeners, a caret, a mounted iframe)
 * @returns an unsubscribe, to call from `disconnectedCallback`
 *
 * @example
 * connectedCallback(): void {
 *   this._render();
 *   this._unsubscribe = subscribeConfigChange(this, () => this._refreshChrome());
 * }
 * disconnectedCallback(): void {
 *   this._unsubscribe?.();
 *   this._unsubscribe = null;
 * }
 */
import { resolveConfig } from './config-context.js';

/** The event `AparteConfig._notify()` dispatches on `window`. */
export const APARTE_CONFIG_CHANGE = 'aparte-config-change';

export function subscribeConfigChange(el: Element, handler: () => void): () => void {
    const listener = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
        /*
         * The config is resolved HERE, per event — never captured when subscribing.
         *
         * `AparteChatStatus` documents why: caching it at connect made the element
         * "permanently deaf to its own instance", because the filter compared the
         * event's config against a value latched before the instance existed, so no
         * change for the real instance ever matched. The filter meant to isolate two
         * chats on one page became the thing that silenced one of them.
         *
         * A bare notify — no `detail.config` — always passes, which is what a manual
         * `_notify()` and the global config both produce.
         */
        if (detail?.config && detail.config !== resolveConfig(el)) return;
        handler();
    };
    window.addEventListener(APARTE_CONFIG_CHANGE, listener);
    return () => window.removeEventListener(APARTE_CONFIG_CHANGE, listener);
}
