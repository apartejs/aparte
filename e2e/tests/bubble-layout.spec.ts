/**
 * Bubble layout invariants — real browser geometry, the thing jsdom can never
 * see. Runs on the pure web-component playground: the CSS under test is core's,
 * identical in every wrapper.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/');
    await expect(page.locator('aparte-chat-viewport')).toBeAttached();
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
    expect(
        Math.abs(tileBox!.x - contentBox!.x),
        `attachment tile x=${tileBox!.x} vs bubble content x=${contentBox!.x}`,
    ).toBeLessThan(4);
});
