/**
 * Bubble layout invariants — real browser geometry, the thing jsdom can never
 * see. Runs on the pure web-component example: the CSS under test is core's,
 * identical in every wrapper.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/');
    await expect(new ChatPage(page).viewport).toBeAttached();
});

test('a user attachment strip is anchored to the same edge as the bubble', async ({ page }) => {
    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as any;
        vp.appendMessage({
            id: 'u-attach',
            role: 'user',
            content: 'voila',
            timestamp: Date.now(),
            attachments: [{ id: 'att-1', name: 'data.json', type: 'application/json', url: '' }],
        });
    });

    const bubble = page.locator('aparte-chat-bubble[data-role="user"]').first();
    const tile = bubble.locator('.aparte-thumb').first();
    await expect(tile).toBeVisible();

    const tileBox = await tile.boundingBox();
    const contentBox = await bubble.locator('.aparte-message-content').first().boundingBox();
    expect(tileBox, 'attachment tile must be laid out').not.toBeNull();
    expect(contentBox, 'bubble content must be laid out').not.toBeNull();

    // The strip sits directly above the text bubble; both belong to the same
    // message, so their leading edges must line up (they were 700+px apart when
    // the strip was right-anchored while the bubble hugged text on the left).
    // The same edge: the leading one when the bubble hugs its text on the start side,
    // the trailing one when a skin anchors the user's turn to the end edge (the chat
    // site's does, as the product it measures). Either way the strip and the bubble
    // share an edge; what must never happen is one on each side.
    const leading = Math.abs(tileBox!.x - contentBox!.x);
    const trailing = Math.abs((tileBox!.x + tileBox!.width) - (contentBox!.x + contentBox!.width));
    expect(
        Math.min(leading, trailing),
        `attachment tile x=${tileBox!.x}..${tileBox!.x + tileBox!.width} vs bubble content x=${contentBox!.x}..${contentBox!.x + contentBox!.width}`,
    ).toBeLessThan(4);
});
