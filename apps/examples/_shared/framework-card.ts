/**
 * `?framework-card`: each framework example draws the `get_weather` call with a component of
 * its own framework (`AparteToolUI`, or `aparteToolUI` in Angular) instead of core's row. Off by
 * default, because the approval, agent-loop and tool-row specs read core's row.
 *
 * The card shows the city, the result once it is in, and the site's name — which each example
 * provides as app context (React context, Vue `provide`, Svelte `setContext`, an Angular
 * service), so the card proves it renders from where it was declared.
 */
import type { AparteToolCallView } from '@aparte/core';

export const FRAMEWORK_CARD = new URLSearchParams(window.location.search).has('framework-card');

/** The value each example provides as app context, and the card reads back. */
export const SITE_NAME = 'ChatClone';

/** The card's line: the city, then the result once the call has one. */
export function weatherLine(view: AparteToolCallView): string {
    const city = String((view.input as { city?: unknown } | undefined)?.city ?? '');
    return view.status === 'resolved' ? `${city}: ${view.result ?? ''}` : `${city}: ${view.status}`;
}

/** Counted for the e2e spec: one card component was mounted. */
export function noteCardMounted(): void {
    const w = window as Window & { __aparteToolUiMounts?: number };
    w.__aparteToolUiMounts = (w.__aparteToolUiMounts ?? 0) + 1;
}

/** Counted for the e2e spec: one card component was unmounted. */
export function noteCardUnmounted(): void {
    const w = window as Window & { __aparteToolUiUnmounts?: number };
    w.__aparteToolUiUnmounts = (w.__aparteToolUiUnmounts ?? 0) + 1;
}
