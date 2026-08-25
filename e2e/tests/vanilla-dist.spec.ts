/**
 * vanilla-dist suite — this app consumes `@aparte/core` from its published
 * `dist` (external-consumer integrity) and showcases the human-in-the-loop
 * tool-approval flow. No BYOK, no model gate: a bare shell + a local echo.
 *
 * Requires `pnpm build` first (it reads dist, not source).
 */

import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** This app has no model gate (bare shell + a local echo), hence `gated: false`. */
async function ask(page: import('@playwright/test').Page, text: string): Promise<void> {
    await expect(page.locator('aparte-chat')).toBeVisible();
    await new ChatPage(page).send(text, { gated: false });
}

/** An approval option, by the label the page wrote. */
const option = (page: Page, label: string) =>
    page.locator('.aparte-approval-option', { hasText: label });

test('mounts and runs the human-in-the-loop tool approval', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await ask(page, 'please delete my notes');

    // The decision is at the COMPOSER. It used to be a pair of buttons inside the
    // bubble — this spec asserted `[data-tool-decision]`, and the event those buttons
    // dispatched is gone with them.
    await expect(option(page, 'Approve')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('aparte-composer')).toHaveAttribute('data-panel-active', '');

    // And the transcript holds the anchor, with nothing to press.
    await expect(page.locator('.aparte-segment-tool-call[data-status="awaiting-approval"]')).toBeVisible();
    await expect(page.locator('[data-tool-decision]')).toHaveCount(0);

    // One click, no confirm step.
    await option(page, 'Approve').click();
    await expect(page.locator('.aparte-segment-tool-call[data-status="resolved"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"]').last()).toContainText('Approved');
    await expect(page.locator('.aparte-approval-panel'), 'the panel closes with the decision').toHaveCount(0);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('rejecting a tool call halts the action', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await ask(page, 'delete everything');

    await expect(option(page, 'Reject')).toBeVisible({ timeout: 15_000 });
    await option(page, 'Reject').click();

    await expect(page.locator('.aparte-segment-tool-call[data-status="rejected"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"]').last()).toContainText('Rejected');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a refusal can carry the words the user typed instead', async ({ page }) => {
    // The arm that did not exist: a refusal with a reason. It is only useful because a
    // refusal now hands the model a turn to read it in — before, whatever was written
    // here went into a history nobody sent.
    const errors = collectPageErrors(page);

    await page.goto('/');
    await ask(page, 'delete everything');
    await expect(option(page, 'Approve')).toBeVisible({ timeout: 15_000 });

    await page.locator('.aparte-approval-instruction').fill('move them to the archive instead');
    // Written text is submitted by the composer's own button, which is the act it
    // already means; an option is its own click.
    await page.locator('aparte-composer-send button').click();

    await expect(page.locator('.aparte-segment-tool-call[data-status="rejected"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"]').last())
        .toContainText('move them to the archive instead');

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
