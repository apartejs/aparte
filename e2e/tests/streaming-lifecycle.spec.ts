/**
 * The lifecycle of one turn, asserted WHILE it is in flight.
 *
 * Everything else in the suite waits for the settled reply, so the states a user
 * actually stares at — the empty pending bubble, the streaming flags, the stop
 * button, cancelling — had no coverage at all. The `slow` scenario holds the
 * response open, which is the only window where they exist.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test('an in-flight turn marks the assistant bubble streaming and hides its action bar', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'slow', delayMs: 4000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('streaming state probe');

    // The bubble exists before any token: streaming flag + aria-busy for AT users.
    const streamingMessage = chat.streaming(chat.lastReply);
    await expect(streamingMessage).toHaveCount(1, { timeout: 15_000 });
    await expect(streamingMessage).toHaveAttribute('aria-busy', 'true');

    // Nothing to copy or retry yet — the footer must stay out of reach mid-turn.
    await expect(chat.lastReply.locator('.aparte-action-bar')).toBeHidden();

    // …and once the turn settles, the flags clear and the actions come back.
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK, { timeout: 20_000 });
    await expect(chat.streaming(chat.lastReply)).toHaveCount(0);
    await expect(chat.action(chat.lastReply, 'copy')).toBeAttached();

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the send button becomes a stop button while streaming, and back after', async ({ page }) => {
    await installLlmMock(page, { scenario: 'slow', delayMs: 4000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await expect(chat.sendButton).not.toHaveClass(/is-streaming/);

    await chat.send('stop button probe');
    await expect(chat.sendButton).toHaveClass(/is-streaming/, { timeout: 15_000 });

    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK, { timeout: 20_000 });
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/);
});

test('cancelling mid-stream stops the turn and leaves the composer usable', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'slow', delayMs: 15_000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    const readCancels = await chat.recordEvents('aparte-cancel');
    const readErrorEvents = await chat.recordEvents('aparte-message-error');
    await chat.send('cancel probe');
    await expect(chat.sendButton).toHaveClass(/is-streaming/, { timeout: 15_000 });

    // The stop button is the send button in streaming mode.
    await chat.sendButton.click();
    await expect.poll(async () => (await readCancels()).length, { timeout: 10_000 }).toBeGreaterThan(0);

    // Streaming state is fully unwound — no zombie flag, no stuck stop button.
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/, { timeout: 10_000 });
    await expect(chat.streaming()).toHaveCount(0);

    // A deliberate Stop is NOT a failure. This is the half that let the defect
    // through: the loop turned the provider's AbortError into an `error` event, the
    // error branch threw, and the lifecycle handler REPLACED the message segments —
    // so pressing Stop erased the answer and blamed a fault that never happened.
    //
    // Note what this test still cannot see: with `scenario: 'slow'` the abort lands
    // before any token arrives, so there is no partial answer here to erase. The
    // "Stop keeps the text already on screen" half needs a mock that streams over
    // time (see the mock's own note about `route.fulfill` delivering atomically) and
    // is asserted in the unit suite meanwhile.
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(0);
    await expect(chat.segment('error')).toHaveCount(0);
    await expect.poll(async () => (await readErrorEvents()).length).toBe(0);

    // And the chat still works: a second turn goes through normally.
    await page.unrouteAll();
    await installLlmMock(page, { scenario: 'text' });
    await chat.sendAndSettle('after cancel', { expect: MOCK_REPLY_MARK });

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
