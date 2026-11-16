/**
 * Zones where a custom action can appear — the message (bubble) toolbar, and only it.
 *
 * The type is a single member on purpose: a composer button is an element the consumer
 * writes in their own markup (`<aparte-composer-action>`), not a registry entry, so the
 * composer never asked the registry for anything. The zone stays a named type rather
 * than the bare literal because `getActions(zone)` reads as a lookup, and a second zone
 * (a toolbar of core's own, say) would be added here.
 */
export type AparteActionZone = 'bubble';

/**
 * A custom action button, registered once via `aparteGlobalConfig.registerAction(...)`
 * and placed in the message (bubble) toolbar via `zones`.
 *
 * Declarative and framework-agnostic: clicking it emits an `aparte-action`
 * CustomEvent (bubbles, composed) carrying `{ actionId, zone, … }`, exactly like
 * the built-in retry/feedback buttons — so you wire it the same way in
 * React/Vue/Svelte/Angular and in vanilla. An optional `onClick` callback fires
 * alongside the event for imperative convenience.
 *
 * For a button in the composer, write an `<aparte-composer-action>` in your markup and
 * listen for `aparte-action-click` — see that element's docs.
 *
 * @example
 * aparteGlobalConfig.registerAction({
 *   id: 'share', icon: '<svg>…</svg>', label: 'Share',
 *   zones: ['bubble'], bubble: { roles: ['assistant'] },
 * });
 * chatEl.addEventListener('aparte-action', (e) => {
 *   if (e.detail.actionId === 'share') share(e.detail.messageId);
 * });
 */
export interface AparteAction {
    /** Stable id — echoed as `actionId` in the `aparte-action` event. */
    id: string;
    /**
     * Icon for the button:
     * - If it starts with `<`, it is treated as raw HTML/SVG and used directly.
     * - Otherwise it is treated as a key for `aparteGlobalConfig.getIcon()`. If the
     *   provider doesn't have the key, falls back to `iconFallback`.
     *
     * Not needed with `display: 'label'`. A button left with no icon to draw shows its
     * label instead, never an empty box.
     */
    icon?: string;
    /** Inline SVG/HTML fallback used when the icon provider doesn't have the key. */
    iconFallback?: string;
    /**
     * What the button is called: its text with `display: 'label'` or `'both'`, else its
     * `aria-label` and tooltip. A key of the locale when the locale has it (add yours with
     * `extendLocale`), so it follows the chat's language; else shown as written.
     */
    label: string;
    /**
     * What the button shows. `'icon'` is the bar's own look: the icon, the label as its name
     * and tooltip. `'label'` writes the label, for an action an icon cannot say ("Go back
     * before"); `'both'` puts the icon before it. A button that shows its label is named by
     * it, with no tooltip repeating it.
     * @default 'icon'
     */
    display?: 'icon' | 'label' | 'both';
    /**
     * Where it stands in the bar: `'end'`, after the built-in buttons, or `'start'`, before
     * them. `order` sorts the actions on each side.
     * @default 'end'
     */
    position?: 'start' | 'end';
    /** Lower renders first among the custom actions on the same side of the built-ins. */
    order?: number;
    /** Which zones this action appears in. */
    zones: AparteActionZone[];
    /** Bubble-toolbar placement (used when `zones` includes `'bubble'`). */
    bubble?: {
        /** Bubble roles this action shows on. Default: both user and assistant. */
        roles?: ('user' | 'assistant')[];
        /**
         * Who wrote the messages this action shows on (`AparteMessage.author`): `'ai'`, a
         * model; `'human'`, a person — an advisor who took over, or the person using the
         * chat. Default: both.
         */
        authorTypes?: ('ai' | 'human')[];
    };
    /** Optional imperative callback, fired alongside the `aparte-action` event. */
    onClick?: (event: Event, context?: unknown) => void;
}
