/**
 * vanilla-dist suite — this app consumes `@aparte/core` from its published
 * `dist` (external-consumer integrity) and showcases the human-in-the-loop
 * tool-approval flow. No BYOK, no model gate: a bare shell + a local echo.
 *
 * Requires `pnpm build` first (it reads dist, not source).
 */

import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** This app has no model gate (bare shell + a local echo), hence `gated: false`. */
async function ask(page: import('@playwright/test').Page, text: string): Promise<void> {
    await expect(page.locator('aparte-chat')).toBeVisible();
    await new ChatPage(page).send(text, { gated: false });
}

test('mounts and runs the human-in-the-loop tool approval', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await ask(page, 'please delete my notes');

    // The default tool_call renderer offers Approve / Reject.
    const approve = page.locator('[data-tool-decision="approve"]');
    const reject = page.locator('[data-tool-decision="reject"]');
    await expect(approve).toBeVisible({ timeout: 15_000 });
    await expect(reject).toBeVisible();

    // Approving resolves the segment and streams the follow-up reply.
    await approve.click();
    await expect(page.locator('.segment-tool-call[data-status="resolved"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"]').last()).toContainText('Approved');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('rejecting a tool call halts the action', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await ask(page, 'delete everything');

    const reject = page.locator('[data-tool-decision="reject"]');
    await expect(reject).toBeVisible({ timeout: 15_000 });
    await reject.click();

    await expect(page.locator('.segment-tool-call[data-status="rejected"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"]').last()).toContainText('Rejected');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the bare shell offers no attachment picker (opt-in capability)', async ({ page }) => {
    // This app is a plain `<aparte-chat>` with no `attachments` attribute, read
    // from core's built dist. A picker here would promise file support the host
    // never wired: the files would ride on `aparte-send` and be dropped in
    // silence. Asserted in a real browser because the default composition is
    // built by core itself, at custom-element upgrade time.
    await page.goto('/');
    await expect(page.locator('aparte-chat')).toBeVisible();
    await expect(page.locator('aparte-composer-input')).toBeVisible();
    await expect(page.locator('aparte-composer-add-attachment')).toHaveCount(0);
    await expect(page.locator('aparte-composer-attachments')).toHaveCount(0);
});
