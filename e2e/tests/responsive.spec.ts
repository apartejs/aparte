/**
 * Small viewport. Every other spec runs at 1000x720, so nothing proved the chat
 * is usable on a phone-sized screen — where the classic failures are a document
 * that scrolls sideways, a composer pushed off-screen, and a dropdown that opens
 * outside the viewport.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

test('the chat is usable at phone width and never scrolls the page sideways', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    // The composer must be reachable without horizontal scrolling.
    await expect(chat.editor).toBeVisible();
    await expect(chat.sendButton).toBeVisible();

    const noSideScroll = async () =>
        page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(await noSideScroll(), 'idle chat must not overflow horizontally').toBe(true);

    // A long unbroken string is the classic culprit: it must wrap, not widen.
    await chat.sendAndSettle('x'.repeat(300), { expect: MOCK_REPLY_MARK });
    expect(await noSideScroll(), 'a long unbroken message must wrap, not widen the page').toBe(true);

    // Bubbles stay inside the viewport.
    const box = await chat.bubbles('user').last().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x, 'bubble must start inside the viewport').toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, 'bubble must end inside the viewport').toBeLessThanOrEqual(PHONE.width + 1);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the model dropdown opens within the viewport at phone width', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    if ((await chat.modelTrigger.count()) === 0) test.skip(true, 'no model selector in this example');

    await chat.modelTrigger.click();
    const dropdown = chat.modelSelector.locator('.aparte-select-dropdown');
    await expect(dropdown).toBeVisible();

    const box = await dropdown.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x, 'dropdown must not start off-screen').toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, 'dropdown must not extend past the viewport').toBeLessThanOrEqual(PHONE.width + 1);
});
