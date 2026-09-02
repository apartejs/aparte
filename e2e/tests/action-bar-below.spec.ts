/**
 * #56 — an older message's action bar floats BELOW the message, in the space that
 * already separates two turns, and moves nothing.
 *
 * The stylesheet test pins the rules; this pins the GEOMETRY, which only a layout
 * engine can answer: hovering an older reply, the bar's top is under the text, its
 * bottom does not pass the next bubble's top, its start edge is the text's start
 * edge — and the bubble is exactly as tall hovered as it was at rest (no reserved
 * row, no shift). Hover-capable pointer only, like the rule it measures.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('an older reply\'s action bar hangs under its text, inside the gap, and reserves no height', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('first question');
    await chat.sendAndSettle('second question');

    // The first reply is an OLDER message now (not last-of-type): its bar floats.
    const older = chat.bubbles('assistant').first();
    const message = older.locator('.aparte-message');
    const body = older.locator('.aparte-body');
    const content = older.locator('.aparte-message-content');
    const bar = older.locator('.aparte-action-bar');

    const restHeight = (await older.boundingBox())!.height;
    await expect(bar).toHaveCSS('opacity', '0');

    await message.hover();
    await expect(bar).toHaveCSS('opacity', '1');

    const hoveredHeight = (await older.boundingBox())!.height;
    expect(hoveredHeight, 'the bubble is exactly as tall hovered — the bar reserves no row').toBe(restHeight);

    const [barBox, contentBox, bodyBox, olderBox, nextTop] = await Promise.all([
        bar.boundingBox(), content.boundingBox(), body.boundingBox(), older.boundingBox(),
        older.locator('xpath=following-sibling::aparte-chat-bubble[1]').boundingBox().then((b) => b!.y),
    ]);
    expect(barBox && contentBox && bodyBox && olderBox).toBeTruthy();

    expect(barBox!.y, `the bar's top (${barBox!.y}) is under the text's bottom (${contentBox!.y + contentBox!.height})`)
        .toBeGreaterThanOrEqual(contentBox!.y + contentBox!.height - 1);
    expect(barBox!.y + barBox!.height, `the bar's bottom (${barBox!.y + barBox!.height}) stays within the bubble's box (${olderBox!.y + olderBox!.height})`)
        .toBeLessThanOrEqual(olderBox!.y + olderBox!.height + 1);
    expect(barBox!.y + barBox!.height, 'and never reaches the next turn').toBeLessThanOrEqual(nextTop + 1);
    // The bar's INK starts where the text starts (UI audit, LOT 22): the first button's
    // box begins half a button-padding before the text edge, so that its glyph — the
    // thing the eye reads as the bar's start — lands on the column. Measured on the
    // glyph, not the box, since the box is exactly what moved.
    const glyphBox = await bar.locator('svg').first().boundingBox();
    expect(glyphBox).toBeTruthy();
    expect(Math.abs(glyphBox!.x - bodyBox!.x), `the bar's first glyph (${glyphBox!.x}) starts where the text starts (${bodyBox!.x})`).toBeLessThanOrEqual(2);

    // The last reply keeps its always-visible bar in the flow — every chat does that.
    const lastBar = chat.lastReply.locator('.aparte-action-bar');
    await expect(lastBar).toHaveCSS('opacity', '1');
    await expect(lastBar).toHaveCSS('position', 'static');

    expect(errors, 'no runtime errors while probing').toEqual([]);
});
