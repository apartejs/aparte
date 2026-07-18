/**
 * Framework-boundary smoke suite — runs against react, vue, svelte, angular and
 * vanilla (one Playwright project per app, same assertions). Every M6 bug lived
 * in exactly these four behaviours yet passed the jsdom unit tests; this is the
 * net that would have caught them in the browser.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { sendMessage, bubbleRoles } from '../helpers/actions.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('mounts without runtime errors', async ({ page }) => {
    // Catches the React-19 getter-only throw and the Angular double-`define`
    // crash — both surfaced as an uncaught error that blanked the page.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');

    // Universal "the app rendered" markers — present whether the wrapper emits an
    // <aparte-chat> host (vanilla) or mounts the pieces directly (React/Vue/Svelte).
    await expect(page.locator('aparte-composer-input')).toBeVisible();
    await expect(page.locator('aparte-chat-viewport')).toBeAttached();
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('model selector populates and ungates the composer', async ({ page }) => {
    await page.goto('/');

    // Options render (empty on the async-race bug where subscribe ran after the
    // provider notify).
    await expect(page.locator('aparte-model-selector aparte-option').first()).toBeAttached({ timeout: 20_000 });

    // The require-model gate opens only once a model auto-selects.
    await expect(page.locator('aparte-composer:not([data-model-gated])').first()).toBeAttached({ timeout: 20_000 });
});

test('a sent message streams a reply, ordered after the user bubble', async ({ page }) => {
    await page.goto('/');
    await sendMessage(page, 'ordering probe');

    await expect(page.locator('aparte-chat-bubble[data-role="user"]')).toContainText('ordering probe');

    // The user bubble must precede the assistant bubble in the DOM (React once
    // appended the assistant first).
    const roles = await bubbleRoles(page);
    expect(roles[0]).toBe('user');
    expect(roles[1]).toBe('assistant');

    // Markdown ran: the mock's `**aparte e2e mock**` rendered as <strong>.
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"] strong').first())
        .toContainText(MOCK_REPLY_MARK);
});

test('the transcript scrolls once messages overflow', async ({ page }) => {
    await page.goto('/');

    // Enough turns to exceed the viewport height.
    for (let i = 0; i < 7; i++) await sendMessage(page, `overflow turn ${i}`);

    // The scroll container differs by mode: framework-managed scrolls the
    // <aparte-chat-viewport> itself; the vanilla shell scrolls the inner
    // .aparte-viewport-container (the viewport is overflow:hidden).
    const metrics = await page.evaluate(() => {
        const el =
            document.querySelector('.aparte-viewport-container') ??
            document.querySelector('aparte-chat-viewport');
        return el
            ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
            : { scrollHeight: 0, clientHeight: 0 };
    });

    // The bug this guards: framework-managed children flex-shrank so
    // scrollHeight == clientHeight and the transcript never scrolled.
    expect(metrics.scrollHeight, 'content should overflow the scroll container')
        .toBeGreaterThan(metrics.clientHeight + 4);
});
