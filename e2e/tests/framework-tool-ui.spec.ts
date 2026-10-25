/**
 * A tool call drawn by a component of the page's own framework, in a real browser.
 *
 * Under `?framework-card` each framework example declares the `get_weather` card with its
 * wrapper's `AparteToolUI` (`aparteToolUI` in Angular), and the card reads a value the page
 * provides as app context. The unit suites prove each wrapper against a bare bubble; this is the
 * whole chain on the chat site — the scripted model's call, the approval panel, the result
 * landing in the same card, and the card unmounted when the conversation is left.
 */

import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const PANEL = '.aparte-elic-panel.aparte-approval-panel';
const APPROVE = '.aparte-approval-option--affirm';
const CARD = '[data-testid="framework-weather-card"]';

test('a framework component draws the get_weather card, with the app context', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario&framework-card');
    await chat.send('what is the weather?');

    // The call waits for approval — drawn by the page's component, not core's row.
    const card = chat.lastReply.locator(CARD);
    await expect(card).toBeVisible();
    await expect(card).toContainText('awaiting-approval');
    await expect(card).toContainText('ChatClone');
    await expect(chat.lastReply.locator('.aparte-segment-tool-call')).toHaveCount(0);

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await panel.locator(APPROVE).click();

    // The result lands in the same card: updated in place, never mounted twice — not even when
    // the host re-syncs the finished message, which used to draw every segment again.
    await expect(card).toContainText('Cloudy');
    await expect(chat.streaming()).toHaveCount(0);
    await expect(chat.lastReply.locator(CARD)).toHaveCount(1);
    expect(await counts(page)).toEqual({ mounts: 1, unmounts: 0 });
    expect(errors, 'no uncaught page errors').toEqual([]);
});

const counts = (page: import('@playwright/test').Page) => page.evaluate(() => {
    const w = window as Window & { __aparteToolUiMounts?: number; __aparteToolUiUnmounts?: number };
    return { mounts: w.__aparteToolUiMounts ?? 0, unmounts: w.__aparteToolUiUnmounts ?? 0 };
});

test('leaving the conversation unmounts the card once', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&framework-card');
    await chat.send('what is the weather?');
    await page.locator(PANEL).locator(APPROVE).click();
    await expect(chat.lastReply.locator(CARD)).toContainText('Cloudy');
    // The reply finished: the subject here is the card leaving, not a new chat mid-stream.
    await expect(chat.streaming()).toHaveCount(0);

    await page.locator('#new-chat').click();

    await expect(page.locator(CARD)).toHaveCount(0);
    await expect.poll(() => counts(page)).toEqual({ mounts: 1, unmounts: 1 });
});
