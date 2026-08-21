/**
 * The composer toolbar — the row a mode picker or a model selector belongs in.
 *
 * This suite runs on **every** playground, which is the point: the row used to be
 * three positional slots per wrapper in three different syntaxes, and nothing in the
 * repo showed how to place two controls at opposite ends. What is asserted here is
 * the contract that replaced them:
 *
 *  - the row is core's `<aparte-composer-toolbar>` element, the same in vanilla and
 *    in the four wrappers;
 *  - placement is the DOM order, and `margin-inline-start: auto` pushes a control to
 *    the end — no `left`/`right` name anywhere;
 *  - that push is LOGICAL, so it follows the reading direction. The RTL case is the
 *    one that would have caught the real bug: `dir` used to be applied by the
 *    viewport alone, so the composer never flipped and a logical margin behaved like
 *    a physical one.
 *
 * The mirror ("no toolbar ⇒ no row in the DOM") lives in the wrappers' unit tests,
 * where the absence can be asserted per framework without a playground that
 * deliberately renders nothing.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/** Horizontal box of a locator, failing loudly rather than returning null. */
async function boxOf(chat: ChatPage, selector: string): Promise<{ x: number; width: number }> {
    const box = await chat.composerToolbar.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no bounding box for "${selector}" inside the toolbar`);
    return { x: box.x, width: box.width };
}

test('the toolbar holds both controls, and the pushed one sits at the end', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await expect(chat.composerToolbar).toHaveCount(1);
    await expect(chat.composerToolbar).not.toHaveAttribute('data-empty', '');

    const lang = await boxOf(chat, 'button');
    const selector = await boxOf(chat, 'aparte-model-selector');

    // Order first: the language control is authored first, so it comes first.
    expect(lang.x).toBeLessThan(selector.x);

    // Then the push itself. Ordering alone would pass with the two controls sitting
    // side by side; a real gap between them is what proves `margin-inline-start: auto`
    // is doing the work.
    expect(selector.x - (lang.x + lang.width)).toBeGreaterThan(20);
});

test('the push follows the reading direction — the controls swap under RTL', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    const before = {
        lang: await boxOf(chat, 'button'),
        selector: await boxOf(chat, 'aparte-model-selector'),
    };
    expect(before.lang.x).toBeLessThan(before.selector.x);

    // Every playground puts a real locale switch in the toolbar; clicking it sets a
    // right-to-left locale on the live config.
    await chat.composerToolbar.locator('button').first().click();
    await expect(chat.composer).toHaveAttribute('dir', 'rtl');

    const after = {
        lang: await boxOf(chat, 'button'),
        selector: await boxOf(chat, 'aparte-model-selector'),
    };

    // The authored order did not change; the reading direction did. So the pushed
    // control is now on the other side, and so is the button.
    expect(after.selector.x).toBeLessThan(after.lang.x);
    expect(after.lang.x).toBeGreaterThan(before.lang.x);
});
