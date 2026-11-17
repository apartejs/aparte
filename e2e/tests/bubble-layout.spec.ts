/**
 * Bubble layout invariants — real browser geometry, the thing jsdom can never
 * see. Runs on the pure web-component example: the CSS under test is core's,
 * identical in every wrapper.
 */

import { test, expect, type Locator } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/**
 * The transcript column's own inner edges for a message row — its padding box,
 * after the row's own inline padding. A trailing-anchored bubble
 * (`margin-inline-start: auto`, the chat site's skin) sits flush against the
 * inner right edge; a leading-anchored one (core's own default) sits flush
 * against the inner left edge instead. Reading this — rather than assuming
 * either side — is what lets the test assert the ONE edge the bubble actually
 * anchors to, instead of accepting whichever of the two happens to be close.
 */
async function transcriptColumnInnerEdges(row: Locator): Promise<{ left: number; right: number }> {
    const box = await row.boundingBox();
    if (!box) throw new Error('the message row must be laid out');
    const [padLeft, padRight] = await row.evaluate((el) => {
        const s = getComputedStyle(el);
        return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)];
    });
    return { left: box.x + padLeft, right: box.x + box.width - padRight };
}

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
    // message, so their edges must line up (they were 700+px apart when the strip
    // was right-anchored while the bubble hugged text on the left).
    //
    // Which edge is the right one to check is read from the CONTENT's own position
    // in its row, not guessed: the leading edge when it hugs text on the start side
    // (core's default), the trailing edge when a skin anchors the user's turn to
    // the end edge (the chat site's does, as the product it measures).
    // `min(leading, trailing) < 4` used to accept either edge blindly, which would
    // also pass a strip anchored opposite to a bubble whose other edge happened to
    // coincide.
    const row = bubble.locator('.aparte-message').first();
    const { left, right } = await transcriptColumnInnerEdges(row);
    const anchoredTrailing = Math.abs((contentBox!.x + contentBox!.width) - right) < Math.abs(contentBox!.x - left);
    const diff = anchoredTrailing
        ? Math.abs((tileBox!.x + tileBox!.width) - (contentBox!.x + contentBox!.width))
        : Math.abs(tileBox!.x - contentBox!.x);
    expect(
        diff,
        `attachment tile x=${tileBox!.x}..${tileBox!.x + tileBox!.width} vs bubble content x=${contentBox!.x}..${contentBox!.x + contentBox!.width}`
        + ` (anchored ${anchoredTrailing ? 'trailing' : 'leading'})`,
    ).toBeLessThan(4);
});

// A bubble skipped by `content-visibility: auto` takes its `contain-intrinsic-size` fallback (320px)
// until the browser has rendered it once, and a new message has never been rendered: it used to be
// laid out 320px tall on its first frame, the auto-scroll pinned the bottom to that, and the next
// frame snapped it back — a flash under every message, the person's, the reply's, or one the app
// appended (an advisor's, a notice). The newest messages are where a person is looking, so they
// are always rendered; the history above keeps the skipping.
test('a new message has its own height on its first frame, and the history is still skipped', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const vp = document.querySelector('aparte-chat-viewport') as any;
        // Enough history to overflow the transcript: a new message lands below the fold, where
        // the browser has not drawn it yet, and the scroll brings it in afterwards.
        for (let i = 0; i < 30; i++) {
            vp.appendMessage({ id: `h${i}`, role: i % 2 ? 'assistant' : 'user', content: `Earlier message ${i}, long enough to take a line or two of the transcript.`, timestamp: Date.now() });
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const bubble = (id: string) => vp.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as HTMLElement;
        const height = (id: string) => Math.round(bubble(id).getBoundingClientRect().height);
        // Two at once, the way a send appends the question and the waiting reply.
        vp.appendMessage({ id: 'q', role: 'user', content: 'Is it shipped?', timestamp: Date.now() });
        vp.appendMessage({ id: 'n', role: 'assistant', kind: 'notice', content: 'Marie joined the conversation', timestamp: Date.now() });
        const first = await new Promise<{ q: number; n: number }>((r) => requestAnimationFrame(() => r({ q: height('q'), n: height('n') })));
        // Once the send's glide has brought them in and they have been drawn.
        await new Promise((r) => setTimeout(r, 800));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return { first, settled: { q: height('q'), n: height('n') }, history: getComputedStyle(bubble('h0')).contentVisibility };
    });
    // One line each: nowhere near the 320px fallback.
    expect(result.settled.q).toBeLessThan(200);
    expect(result.settled.n).toBeLessThan(200);
    expect(result.first, 'first frame').toEqual(result.settled);
    expect(result.history).toBe('auto');
});
