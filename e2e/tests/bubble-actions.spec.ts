/**
 * The bubble action bar — copy, retry (which forks a branch) and edit.
 *
 * These are the buttons a user reaches for most, and not one of them had any
 * browser coverage: the unit tests assert the events fire, nothing proved the
 * click-to-outcome path works once a real client and a real transport are wired.
 *
 * What is under test is the OPT-IN, not a default: core ships `copy` alone, and
 * these playgrounds call `setBubbleActions({ retry: true, edit: true })` because
 * they run an AparteClient that can honor both. `feedback` and the details (ⓘ)
 * button are never declared, so they must stay absent — even though the mocked
 * reply carries a `usage`, which is what would otherwise summon the ⓘ.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('the settled reply offers copy + retry, and the user bubble offers copy + edit', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('action bar probe', { expect: MOCK_REPLY_MARK });

    await expect(chat.action(chat.lastReply, 'copy')).toBeVisible();
    await expect(chat.action(chat.lastReply, 'retry')).toBeVisible();
    // Undeclared actions must NOT be rendered — feedback, and the details button
    // even though this reply carries a usage payload. Nothing here listens for
    // `aparte-message-info`, so an ⓘ would open nothing.
    await expect(chat.action(chat.lastReply, 'feedback-positive')).toHaveCount(0);
    await expect(chat.action(chat.lastReply, 'info')).toHaveCount(0);

    const userBubble = chat.bubbles('user').last();
    await expect(chat.action(userBubble, 'copy')).toBeAttached();
    await expect(chat.action(userBubble, 'edit')).toBeAttached();
    // Retrying is an assistant-side affordance.
    await expect(chat.action(userBubble, 'retry')).toHaveCount(0);
});

test('copy puts the reply on the clipboard and confirms it in the button', async ({ page, context, browserName }) => {
    const chat = new ChatPage(page);
    // Reading the clipboard needs a permission Chromium supports and WebKit doesn't.
    const canReadClipboard = browserName === 'chromium';
    if (canReadClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await chat.sendAndSettle('copy me', { expect: MOCK_REPLY_MARK });

    const copy = chat.action(chat.lastReply, 'copy');
    await copy.click();

    // The button confirms with a checkmark — the feedback every user relies on.
    await expect(copy.locator('svg polyline')).toBeVisible({ timeout: 5_000 });

    if (canReadClipboard) {
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toContain(MOCK_REPLY_MARK);
    }
});

test('retry forks a branch and the ‹1/2› picker navigates between versions', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('retry probe', { expect: MOCK_REPLY_MARK });

    const readRetries = await chat.recordEvents<{ messageId: string }>('aparte-retry');
    await chat.action(chat.lastReply, 'retry').click();

    // The client picked the event up (not just a DOM dispatch into the void).
    await expect.poll(async () => (await readRetries()).length, { timeout: 10_000 }).toBeGreaterThan(0);

    // A retry must FORK, not overwrite: the sibling picker appears on the reply…
    const picker = chat.branchPicker(chat.lastReply);
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await expect(picker).toContainText('2');

    // …and the transcript still holds exactly one visible reply (the active branch).
    await expect(chat.bubbles('assistant')).toHaveCount(1);

    // Navigating back shows version 1 again.
    await picker.locator('.aparte-branch-prev').click();
    await expect(picker).toContainText('1');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('editing a user message re-sends it and reports the new text', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('first wording', { expect: MOCK_REPLY_MARK });

    const readEdits = await chat.recordEvents<{ messageId: string; content: string }>('aparte-edit');
    const userBubble = chat.bubbles('user').last();
    await chat.action(userBubble, 'edit').click();

    // Edit mode swaps in the composer primitive, seeded with the original text.
    const inlineEditor = userBubble.locator('[contenteditable="true"]').first();
    await expect(inlineEditor).toBeVisible({ timeout: 10_000 });
    await expect(inlineEditor).toContainText('first wording');

    await inlineEditor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await inlineEditor.pressSequentially('second wording');
    await userBubble.locator('.aparte-action-btn[data-action="edit-save"]').click();

    // The edit reached the app with the NEW content…
    await expect.poll(async () => (await readEdits()).at(-1)?.content, { timeout: 10_000 })
        .toContain('second wording');
    // …the bubble shows it, and the inline editor is gone.
    await expect(userBubble).toContainText('second wording');
    await expect(inlineEditor).toBeHidden();

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('swapping a branch at the bottom of a scrollable transcript leaves no scroll button', async ({ page }) => {
    // Reported from bonaparte: on a conversation long enough to scroll, navigating a
    // branch on the LAST message showed the scroll-to-bottom button even though the
    // user was already at the bottom. Cause: `navigateBranch` deliberately turns
    // auto-scroll off (so the rebuild doesn't yank the view), and in
    // framework-managed mode the post-swap geometry re-derive never ran - no scroll
    // event fires when a swap rebuilds the DOM, so the flag and the button stayed
    // stale. Needs a real browser: the whole thing is scroll geometry.
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to overflow the viewport, so the button is even possible.
    for (let i = 0; i < 6; i++) await chat.sendAndSettle(`filler turn ${i}`, { expect: MOCK_REPLY_MARK });

    const scrollBtn = page.locator('.aparte-scroll-btn').first();
    await expect(scrollBtn, 'settled at the bottom: no button before we start')
        .toHaveClass(/aparte-scroll-btn--hidden/);

    // Fork the last reply, then swap between the two versions.
    await chat.action(chat.lastReply, 'retry').click();
    const picker = chat.branchPicker(chat.lastReply);
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await picker.locator('.aparte-branch-prev').click();
    await expect(picker).toContainText('1');

    // Still at the bottom → still nothing to offer. (The class is re-derived a
    // couple of frames after the swap, hence the retrying assertion.)
    await expect(scrollBtn, 'a branch swap must not invent a scroll-to-bottom button')
        .toHaveClass(/aparte-scroll-btn--hidden/);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

