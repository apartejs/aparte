/** Zones where a custom action can appear. */
export type AparteActionZone = 'composer' | 'bubble';

/**
 * A custom action button, registered once via `AparteConfig.registerAction(...)`
 * and placed in one or more zones — the composer toolbar and/or the message
 * (bubble) toolbar — via `zones`.
 *
 * Declarative and framework-agnostic: clicking it emits an `aparte:action`
 * CustomEvent (bubbles, composed) carrying `{ actionId, zone, … }`, exactly like
 * the built-in retry/feedback buttons — so you wire it the same way in
 * React/Vue/Svelte/Angular and in vanilla. An optional `onClick` callback fires
 * alongside the event for imperative convenience.
 *
 * @example
 * AparteConfig.registerAction({
 *   id: 'share', icon: '<svg>…</svg>', label: 'Share',
 *   zones: ['bubble'], bubble: { roles: ['assistant'] },
 * });
 * chatEl.addEventListener('aparte:action', (e) => {
 *   if (e.detail.actionId === 'share') share(e.detail.messageId);
 * });
 */
export interface AparteAction {
    /** Stable id — echoed as `actionId` in the `aparte:action` event. */
    id: string;
    /**
     * Icon for the button:
     * - If it starts with `<`, it is treated as raw HTML/SVG and used directly.
     * - Otherwise it is treated as a key for `AparteConfig.getIcon()`. If the
     *   provider doesn't have the key, falls back to `iconFallback` or `id`.
     */
    icon: string;
    /** Inline SVG/HTML fallback used when the icon provider doesn't have the key. */
    iconFallback?: string;
    /** Accessible label (sets `aria-label` + `title`) — a locale key or a raw string. */
    label: string;
    /** Lower renders first among custom actions (they follow the built-ins). */
    order?: number;
    /** Which zones this action appears in. */
    zones: AparteActionZone[];
    /** Composer-toolbar placement (used when `zones` includes `'composer'`). */
    composer?: {
        /** Toolbar side. Default: `'left'`. */
        position?: 'left' | 'right';
        /**
         * When `true`, the button is hidden from the composer toolbar.
         * Toggle at runtime with `AparteConfig.setActionHidden(id, hidden)`.
         */
        hidden?: boolean;
    };
    /** Bubble-toolbar placement (used when `zones` includes `'bubble'`). */
    bubble?: {
        /** Bubble roles this action shows on. Default: both user and assistant. */
        roles?: ('user' | 'assistant')[];
    };
    /** Optional imperative callback, fired alongside the `aparte:action` event. */
    onClick?: (event: Event, context?: unknown) => void;
}
