/**
 * A reply ARRIVING OVER TIME, which nothing in the browser suite had ever seen.
 *
 * `route.fulfill` hands a body over atomically, so every other spec observes a
 * reply that was already complete when it appeared. That left the behaviours which
 * only exist DURING progressive arrival with no coverage at all — in the one suite
 * that drives a real engine:
 *
 *   - the transcript following the stream, and NOT stealing the scroll back once
 *     the user has scrolled up (a cold audit sabotage proved this had no unit test
 *     that bites: gutting `_scrollToBottom()` left all 784 core tests green)
 *   - Stop keeping the text already on screen (three abort defects lived here; the
 *     existing cancel test aborts before the first token, so it cannot see this)
 *
 * `pace` delivers the same bytes as the buffered path, one SSE frame at a time.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/**
 * Scroll geometry of whichever element actually scrolls.
 *
 * The viewport picks its scroller at runtime — `.aparte-viewport-container` when it
 * owns the DOM, or the host element itself in framework-managed mode — so the test
 * asks the DOM which one overflows rather than assuming a class name. Guessing one
 * is how the first version of this test "passed" by measuring a container that
 * never scrolls.
 */
async function geometry(chat: ChatPage) {
    return chat.viewport.evaluate((vp) => {
        const candidates = [vp.querySelector('.aparte-viewport-container'), vp, vp.parentElement]
            .filter((el): el is HTMLElement => el instanceof HTMLElement);
        const scroller = candidates.find(el => el.scrollHeight - el.clientHeight > 4) ?? candidates[0]!;
        return {
            top: scroller.scrollTop,
            height: scroller.scrollHeight,
            client: scroller.clientHeight,
            which: scroller.className || scroller.tagName.toLowerCase(),
        };
    });
}

/** Scroll whichever element the geometry helper found. */
async function scrollToTop(chat: ChatPage): Promise<void> {
    await chat.viewport.evaluate((vp) => {
        const candidates = [vp.querySelector('.aparte-viewport-container'), vp, vp.parentElement]
            .filter((el): el is HTMLElement => el instanceof HTMLElement);
        const scroller = candidates.find(el => el.scrollHeight - el.clientHeight > 4) ?? candidates[0]!;
        scroller.scrollTop = 0;
    });
}

const distanceFromBottom = (g: { top: number; height: number; client: number }) =>
    g.height - g.client - g.top;

test('the reply text grows over time instead of appearing at once', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { pace: 120 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('paced arrival probe');

    // Three readings, each strictly at least the previous one, and at least one
    // strictly bigger — that is what "arrived over time" means.
    const lengths: number[] = [];
    for (let i = 0; i < 6 && lengths.length < 3; i++) {
        const text = (await chat.lastReply.textContent()) ?? '';
        if (text.length > 0) lengths.push(text.length);
        await page.waitForTimeout(150);
    }

    expect(lengths.length, 'the reply never rendered').toBeGreaterThanOrEqual(2);
    for (let i = 1; i < lengths.length; i++) {
        expect(lengths[i]!, `text shrank between polls: ${lengths.join(' → ')}`).toBeGreaterThanOrEqual(lengths[i - 1]!);
    }
    expect(
        Math.max(...lengths),
        `the whole reply was already there on the first poll: ${lengths.join(' → ')}`,
    ).toBeGreaterThan(Math.min(...lengths));

    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK, { timeout: 15_000 });

    // The request half still ran through the real provider + transport.
    const requests = await mock.pacedRequests();
    expect(requests.length, 'no request reached the shim').toBeGreaterThan(0);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the transcript is anchored at the bottom once a streamed reply lands', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 60 });
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to overflow, so "at the bottom" is a real claim.
    for (const text of ['fill one', 'fill two', 'fill three', 'fill four']) {
        await chat.sendAndSettle(text, { expect: MOCK_REPLY_MARK });
    }

    const g = await geometry(chat);
    expect(
        g.height - g.client,
        `nothing overflowed (measured ${g.which}: ${g.height} vs ${g.client}) — this would prove nothing`,
    ).toBeGreaterThan(4);
    expect(
        distanceFromBottom(g),
        `the transcript did not follow the stream (${distanceFromBottom(g)}px from the bottom)`,
    ).toBeLessThanOrEqual(4);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('scrolling up mid-stream is not overridden by the arriving reply', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 90 });
    const chat = new ChatPage(page);
    await page.goto('/');

    for (const text of ['fill one', 'fill two', 'fill three', 'fill four']) {
        await chat.sendAndSettle(text, { expect: MOCK_REPLY_MARK });
    }

    // A new turn, then the user reads back while it streams.
    await chat.send('one more, and I will scroll away');
    await expect(chat.sendButton).toHaveClass(/is-streaming/, { timeout: 10_000 });

    await scrollToTop(chat);

    // Let several more frames arrive at the pace above.
    await page.waitForTimeout(500);

    const g = await geometry(chat);
    expect(
        g.top,
        `the arriving reply stole the scroll back (top is ${g.top}px, expected to stay near 0)`,
    ).toBeLessThan(Math.max(60, g.client / 2));

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Stop keeps the text that had already arrived', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 200 });
    const chat = new ChatPage(page);
    await page.goto('/');

    const readErrorEvents = await chat.recordEvents('aparte-message-error');
    await chat.send('stop me halfway');

    // Wait for SOME text, so there is a partial answer to lose.
    await expect.poll(
        async () => ((await chat.lastReply.textContent()) ?? '').length,
        { timeout: 15_000, message: 'no text arrived before the stop' },
    ).toBeGreaterThan(3);
    const partial = ((await chat.lastReply.textContent()) ?? '').trim();

    await chat.sendButton.click();   // the stop button, mid-stream
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/, { timeout: 10_000 });

    // The answer the user was reading is still there, and no failure is claimed.
    await expect(chat.lastReply).toContainText(partial.slice(0, Math.min(12, partial.length)));
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(0);
    await expect(chat.segment('error')).toHaveCount(0);
    expect(await readErrorEvents()).toEqual([]);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
