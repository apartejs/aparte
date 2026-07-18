/**
 * demo-vanilla suite — this app consumes `@aparte/core` from its published
 * `dist` (external-consumer integrity) and showcases the human-in-the-loop
 * tool-approval flow. No BYOK, no model gate: a bare shell + a local echo.
 *
 * Requires `pnpm build` first (it reads dist, not source).
 */

import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';

async function ask(page: import('@playwright/test').Page, text: string): Promise<void> {
    await expect(page.locator('aparte-chat')).toBeVisible();
    const editor = page.locator('aparte-composer-input [contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially(text);
    await page.locator('aparte-composer-send button').first().click();
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
