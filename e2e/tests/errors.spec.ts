/**
 * Failure paths. The mock previously only ever returned a well-formed 200, so
 * nothing about how the UI behaves when the model call fails was covered —
 * neither the error segment, nor `data-error`, nor the lifecycle event, nor
 * whether the chat is still usable afterwards (the part that actually decides
 * if a user is stuck).
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test('a vendor 500 surfaces an error state and dispatches aparte-message-error', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'http-500' });
    const chat = new ChatPage(page);
    await page.goto('/');

    const readErrors = await chat.recordEvents<{ messageId: string }>('aparte-message-error');
    await chat.send('please fail');

    // The bubble is marked as failed, and the failure is visible in the transcript.
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(1, { timeout: 20_000 });
    await expect(chat.segment('error').first()).toBeVisible();

    // The app-facing lifecycle event fired (what a host listens to for telemetry).
    await expect.poll(async () => (await readErrors()).length, { timeout: 10_000 }).toBeGreaterThan(0);

    // A failed turn must not leave the composer stuck in streaming mode.
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/);

    // The failure is rendered, not thrown.
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the chat recovers: the next turn succeeds after a failure', async ({ page }) => {
    await installLlmMock(page, { scenario: 'http-500' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('first attempt fails');
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(1, { timeout: 20_000 });

    await page.unrouteAll();
    await installLlmMock(page, { scenario: 'text' });
    await chat.sendAndSettle('second attempt works', { expect: MOCK_REPLY_MARK });
});

test('malformed SSE degrades without crashing the page', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'malformed-sse' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('unparseable stream');

    // Whatever the outcome (empty reply or error segment), the turn must END —
    // no bubble left spinning forever — and the composer must be usable again.
    await expect(chat.streaming(chat.lastReply)).toHaveCount(0, { timeout: 20_000 });
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/);
    await expect(chat.editor).toBeEditable();

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('an empty stream completes the turn instead of hanging', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'empty-stream' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('nothing comes back');

    await expect(chat.streaming(chat.lastReply)).toHaveCount(0, { timeout: 20_000 });
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
