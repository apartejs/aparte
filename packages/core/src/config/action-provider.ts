/**
 * A custom action button added to the message (bubble) toolbar — "Share",
 * "Regenerate", "Report", etc. — beyond the built-in copy/retry/edit/feedback.
 *
 * Declarative and framework-agnostic: it carries no `onClick`. Clicking it emits
 * an `aparte:action` CustomEvent (bubbles, composed) with `{ actionId, messageId,
 * role, targetId }`, exactly like the built-in retry/feedback buttons — so you
 * wire it the same way in React/Vue/Svelte/Angular and in vanilla. Register via
 * `AparteConfig.registerBubbleAction(...)`; a live registration re-renders mounted
 * bubbles.
 *
 * @example
 * AparteConfig.registerBubbleAction({
 *   id: 'share', icon: '<svg>…</svg>', label: 'Share', roles: ['assistant'],
 * });
 * chatEl.addEventListener('aparte:action', (e) => {
 *   if (e.detail.actionId === 'share') share(e.detail.messageId);
 * });
 */
export interface AparteBubbleAction {
    /** Stable id — echoed as `actionId` in the `aparte:action` event. */
    id: string;
    /**
     * Icon for the button: raw inline `<svg>`/HTML when it starts with `<`,
     * otherwise an icon-provider key (falls back to `iconFallback`).
     */
    icon: string;
    /** Inline SVG/HTML used when the icon key isn't in the provider. */
    iconFallback?: string;
    /** Accessible label (sets `aria-label` + `title`). Raw string — localize your side. */
    label: string;
    /** Lower renders first among custom actions (they follow the built-ins). */
    order?: number;
    /** Bubble roles this action shows on. Default: both user and assistant. */
    roles?: ('user' | 'assistant')[];
}

export interface AparteAction {
    id: string;
    /**
     * Icon to display on the action button.
     * - If it starts with `<`, it is treated as raw HTML/SVG and used directly.
     * - Otherwise it is treated as a key for `AparteConfig.getIcon()` (icon provider lookup).
     *   If the provider doesn't have the key, falls back to `iconFallback` or `id`.
     */
    icon: string;
    /** Optional inline SVG/HTML fallback used when the icon provider doesn't have the key. */
    iconFallback?: string;
    label: string; // Key for LocaleProvider or raw string
    position: 'left' | 'right';
    order?: number; // Optional ordering (lower is first)
    /**
     * When `true`, the action button is hidden from the input toolbar.
     * Use `AparteConfig.setActionHidden(id, hidden)` to toggle at runtime.
     */
    hidden?: boolean;
    onClick: (event: Event, context: any) => void;
}
