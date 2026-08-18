/**
 * Page-level helpers. Anything chat-specific lives on the {@link ChatPage} page
 * object (`./chat.ts`) — selectors belong in exactly one place.
 */

import type { Page } from '@playwright/test';

/**
 * Start collecting uncaught page errors, filtering the benign Chromium
 * "ResizeObserver loop completed with undelivered notifications" notice — the
 * viewport's layout-mutating ResizeObserver (auto-scroll) can emit it, and it
 * would otherwise flake the "no errors" assertion every spec makes.
 *
 * Returns the array, which fills as errors occur. Every test asserts it empty:
 * a rendering bug that only shows as a console throw must fail the suite.
 */
export function collectPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('pageerror', (e) => {
        if (/ResizeObserver loop/i.test(e.message)) return;
        errors.push(e.message);
    });
    return errors;
}
