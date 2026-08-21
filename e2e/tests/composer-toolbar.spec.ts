/**
 * The composer toolbar — the row a mode picker or a model selector belongs in.
 *
 * This suite runs on **every** playground, which is the point: the row used to be
 * three positional slots per wrapper in three different syntaxes, and vanilla had only
 * a CSS class written by hand. What is asserted here is the contract that replaced
 * them — one element, and placement by DOM order plus `margin-inline-start: auto`.
 *
 * Scope, honestly: the unit suite already proves that a locale switch puts `dir` on
 * the composer (`locale-live-switch.test.ts`, sabotage-verified). What jsdom cannot
 * prove is the half that needs real layout — that the push is LOGICAL, so the control
 * changes sides with the reading direction. That is what the second test is for, and
 * it is a guard on the idiom we teach: it fails the moment the playgrounds (or the
 * docs they mirror) reach for `margin-left` instead.
 *
 * The mirror ("no toolbar ⇒ no row in the DOM") lives in the wrappers' unit tests,
 * where absence is assertable per framework without a playground that deliberately
 * renders nothing.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/** Free space on each side of the model selector, inside the toolbar row. */
async function gapsAroundSelector(chat: ChatPage): Promise<{ start: number; end: number }> {
    const row = await chat.composerToolbar.boundingBox();
    const control = await chat.composerToolbar.locator('aparte-model-selector').first().boundingBox();
    if (!row || !control) throw new Error('the toolbar or its control has no bounding box');
    return {
        start: control.x - row.x,
        end: row.x + row.width - (control.x + control.width),
    };
}

test('the toolbar renders, and its control is pushed to the end of the row', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await expect(chat.composerToolbar).toHaveCount(1);
    await expect(chat.composerToolbar).not.toHaveAttribute('data-empty', '');

    // The discriminating measurement: with the auto margin the free space is all on
    // the START side. Drop the margin and the control sits at the start instead, which
    // flips both numbers — so this fails on exactly the regression it is here for.
    const { start, end } = await gapsAroundSelector(chat);
    expect(start).toBeGreaterThan(40);
    expect(end).toBeLessThan(20);
});

test('the push is logical — the control changes sides with the reading direction', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    const ltr = await gapsAroundSelector(chat);
    expect(ltr.start).toBeGreaterThan(ltr.end);

    // `dir` is set directly rather than through a locale switch: the config → `dir`
    // half is a unit test's job, and there is no control in the page to click — a
    // playground shows the finished product, not a demo console.
    await chat.composer.evaluate((el) => el.setAttribute('dir', 'rtl'));

    const rtl = await gapsAroundSelector(chat);
    expect(rtl.end).toBeGreaterThan(rtl.start);
    expect(rtl.start).toBeLessThan(20);
});
