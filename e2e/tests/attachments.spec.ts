/**
 * Attachments, end to end through the real picker.
 *
 * The composer ships an attachment button by default, so this is a path users
 * take — yet nothing covered it in a browser: not the chip, not removing one,
 * not what the message bubble shows afterwards, and not whether the file content
 * actually reaches the model (the `rawFileInject` contract).
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK, type LlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
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
async function transcriptColumnInnerEdges(row: import('@playwright/test').Locator): Promise<{ left: number; right: number }> {
    const box = await row.boundingBox();
    if (!box) throw new Error('the message row must be laid out');
    const [padLeft, padRight] = await row.evaluate((el) => {
        const s = getComputedStyle(el);
        return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)];
    });
    return { left: box.x + padLeft, right: box.x + box.width - padRight };
}

const textFile = (name = 'notes.md', body = 'aparte attachment fixture') => ({
    name,
    mimeType: 'text/markdown',
    buffer: Buffer.from(`# ${body}\n`),
});

// A 1x1 transparent PNG.
const imageFile = () => ({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+g5QAAAAASUVORK5CYII=',
        'base64',
    ),
});

let mock: LlmMock;

test.beforeEach(async ({ page }) => {
    mock = await installLlmMock(page);
    await page.goto('/');
});

test('a picked file shows as a chip and can be removed before sending', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.waitUngated();

    await chat.attachFiles([textFile()]);
    await expect(chat.composerAttachments).toHaveCount(1);
    await expect(chat.composerAttachments.first()).toContainText('notes.md');

    // Removing it leaves nothing pending — the strip must not keep a ghost tile.
    await chat.composerAttachments.first().locator('.aparte-thumb__remove').click();
    await expect(chat.composerAttachments).toHaveCount(0);
});

test('sending with an attachment shows it in the bubble and sends its content to the model', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await chat.waitUngated();

    await chat.attachFiles([textFile('notes.md', 'inlined by rawFileInject')]);
    await expect(chat.composerAttachments).toHaveCount(1);

    await chat.sendAndSettle('here is a file', { expect: MOCK_REPLY_MARK });

    // The sent message keeps its attachment visible…
    const userBubble = chat.bubbles('user').last();
    await expect(chat.bubbleAttachments(userBubble)).toHaveCount(1);
    await expect(chat.bubbleAttachments(userBubble).first()).toContainText('notes.md');
    // …and the composer is clear again.
    await expect(chat.composerAttachments).toHaveCount(0);

    // rawFileInject defaults to 'all', so the text content really went out.
    const sent = JSON.stringify(mock.lastChatRequest());
    expect(sent).toContain('inlined by rawFileInject');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the attachment strip lines up with the bubble it belongs to', async ({ page }) => {
    // Regression: the strip was anchored to the trailing edge while the user
    // bubble hugs its text on the leading edge, so one message rendered split
    // across both sides of the transcript. Asserted here through the REAL upload
    // path, which is why it also covers the framework-managed wrappers.
    const chat = new ChatPage(page);
    await chat.waitUngated();

    await chat.attachFiles([textFile()]);
    await chat.sendAndSettle('alignment through the real path', { expect: MOCK_REPLY_MARK });

    const userBubble = chat.bubbles('user').last();
    const tile = chat.bubbleAttachments(userBubble).first();
    await expect(tile).toBeVisible();

    const tileBox = await tile.boundingBox();
    const contentBox = await userBubble.locator('.aparte-message-content').first().boundingBox();
    expect(tileBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    // Which edge the bubble is actually anchored to: the leading one when it hugs
    // its text on the start side (core's default), the trailing one when a skin
    // anchors the user's turn to the end edge (the chat site's does, as the product
    // it measures). Read from the CONTENT's own position in its row, not guessed —
    // `min(leading, trailing) < 4` used to accept either edge blindly, which would
    // also pass a strip anchored opposite to a bubble whose other edge happened to
    // coincide.
    const row = userBubble.locator('.aparte-message').first();
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

test('an image attachment renders a thumbnail and asks the host for a preview', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.waitUngated();

    const readPreviews = await chat.recordEvents<{ name: string }>('aparte-attachment-preview');

    await chat.attachFiles([imageFile()]);
    await chat.sendAndSettle('look at this image', { expect: MOCK_REPLY_MARK });

    const tile = chat.bubbleAttachments(chat.bubbles('user').last()).first();
    await expect(tile).toHaveClass(/aparte-thumb--image/);
    await expect(tile.locator('img')).toBeVisible();

    // This app declared `attachmentPreview`, so the tile is a real button —
    // reachable by keyboard, not a div with a click listener.
    await expect(tile).toHaveAttribute('role', 'button');
    await expect(tile).toHaveAttribute('tabindex', '0');

    // Clicking asks the app to open its own lightbox (core owns no modal).
    await tile.click();
    await expect.poll(async () => (await readPreviews()).at(-1)?.name, { timeout: 10_000 })
        .toBe('pixel.png');
});
