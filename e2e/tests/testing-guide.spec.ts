/**
 * Testing your chat: the guide's example, and the file the repository runs on its six example
 * apps (vanilla, React, Vue, Svelte 4 and 5, Angular), with the same lines in each. It reaches
 * the chat through the testing contract and through nothing else: no class, no tag a wrapper
 * adds. So what it proves is what a test of your own app can rely on, and a hook that moves
 * is what turns this file red.
 */
import { test, expect } from '@playwright/test';
// This repo's stand-in for the model: it answers the API the example apps call. Yours is
// whatever fakes your app's backend: a `page.route`, a test server, a recorded stream.
import { installLlmMock } from '../helpers/mock-llm.js';

test('type, send, wait for the reply to finish, read it', async ({ page }) => {
    await installLlmMock(page, { scenario: 'text' });
    await page.goto('/');
    const chat = page.locator('[data-aparte-chat]');

    // The field is a textbox, and its accessible name is the placeholder.
    await chat.getByRole('textbox', { name: 'Ask ChatClone' }).fill('Say hello');

    // `data-act` says what the button does now: `send`. Press the button inside it.
    await chat.locator('aparte-composer-send[data-act="send"] button').click();

    // A message is told by its role.
    await expect(chat.locator('aparte-chat-bubble[data-role="user"]')).toContainText('Say hello');
    const reply = chat.locator('aparte-chat-bubble[data-role="assistant"]').last();
    await expect(reply).toBeVisible();

    // The reply is finished when nothing in it is `aria-busy`. Read it then.
    await expect(reply.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(reply).toContainText('aparte e2e mock');
});

test('stop a reply that is still being written', async ({ page }) => {
    await installLlmMock(page, { scenario: 'slow', delayMs: 15_000 });
    await page.goto('/');
    const chat = page.locator('[data-aparte-chat]');

    await chat.getByRole('textbox', { name: 'Ask ChatClone' }).fill('Take your time');
    await chat.locator('aparte-composer-send[data-act="send"] button').click();

    // While the reply is written, the same button says `stop`, and the reply says it is busy.
    const stop = chat.locator('aparte-composer-send[data-act="stop"]');
    const reply = chat.locator('aparte-chat-bubble[data-role="assistant"]').last();
    await expect(stop).toBeVisible();
    await expect(reply.locator('[aria-busy="true"]')).toHaveCount(1);

    await stop.locator('button').click();

    // Stopped: the button is Send again and nothing is being written.
    await expect(chat.locator('aparte-composer-send[data-act="send"]')).toBeVisible();
    await expect(reply.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('see a failed turn', async ({ page }) => {
    await installLlmMock(page, { scenario: 'http-500' });
    await page.goto('/');
    const chat = page.locator('[data-aparte-chat]');

    await chat.getByRole('textbox', { name: 'Ask ChatClone' }).fill('This one fails');
    await chat.locator('aparte-composer-send[data-act="send"] button').click();

    // A failed turn leaves an error in the reply, and `data-error-code` says why: here the model
    // answered with a 500.
    const failure = chat.locator('aparte-chat-bubble[data-role="assistant"] [data-error-code]');
    await expect(failure).toBeVisible();
    await expect(failure).toHaveAttribute('data-error-code', 'PROVIDER_ERROR');

    // And the chat is usable again: nothing is written, the button is Send.
    await expect(chat.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(chat.locator('aparte-composer-send[data-act="send"]')).toBeVisible();
});
