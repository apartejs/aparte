/**
 * THE WAITING STATE — between "user sends" and the first token.
 *
 * There used to be nothing there: an assistant bubble with a name, an empty body,
 * and (in the display-only path) copy/retry on a reply that did not exist yet.
 * Reported from a consumer as "it says Assistant, you wait, and you have no idea
 * what is happening".
 *
 * These three specs were written `fixme` as the contract for that work. Two of
 * them originally targeted `<aparte-chat-status>`; the built-in indicator ended up
 * in the BUBBLE instead — it needs no wiring, it works identically in raw core and
 * in every wrapper, and it sits where the user is already looking. The status
 * element stays the application's own channel ("indexing your files"), which is why
 * this suite no longer asserts on it.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

test('a waiting turn shows a built-in indicator, with no app wiring', async ({ page }) => {
    await installLlmMock(page, { scenario: 'slow', delayMs: 6000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('what happens while I wait');

    // The bubble says "working on it" by itself — nothing in the page configures it.
    const waiting = chat.bubbles('assistant').last().locator('.aparte-waiting');
    await expect(waiting).toBeVisible({ timeout: 10_000 });
    // And it is not just decoration: the action bar stays away until there is a
    // reply to act on.
    await expect(chat.bubbles('assistant').last().locator('.aparte-action-bar')).toBeHidden();
});

test('the waiting indicator announces itself to assistive tech', async ({ page }) => {
    // The dots are decorative, so the state must also exist as text and as
    // `aria-busy`. That the text comes from `locale.typing` (and follows a
    // `setLocale`) is asserted in the bubble's unit tests, where the locale is
    // reachable — here we only require that it is not empty: a page with animated
    // dots and nothing to announce is the failure mode this guards.
    await installLlmMock(page, { scenario: 'slow', delayMs: 6000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('locale probe');
    const bubble = chat.bubbles('assistant').last();
    const waiting = bubble.locator('.aparte-waiting');
    await expect(waiting).toBeVisible({ timeout: 10_000 });

    const announced = (await waiting.textContent())?.trim() ?? '';
    expect(announced, 'the indicator must carry announceable text').not.toBe('');
    await expect(bubble.locator('[aria-busy="true"]')).toHaveCount(1);
});

test('the indicator goes away as soon as the reply starts', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('and then it answers');

    const bubble = chat.bubbles('assistant').last();
    await expect(bubble.locator('.aparte-waiting')).toBeHidden();
    // The finished turn gets its action bar back.
    await expect(bubble.locator('.aparte-action-bar')).toBeVisible();
});

test('an imperatively appended assistant message declares itself waiting', async ({ page }) => {
    // The bring-your-own-loop path: appendMessage() with no `status` used to leave
    // the bubble looking finished — action bar and all — before a single token
    // arrived. An empty assistant message with no status IS a reply on its way.
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as unknown as {
            appendMessage(m: Record<string, unknown>): void;
        };
        vp.appendMessage({ id: 'pending-1', role: 'assistant', content: '', timestamp: Date.now() });
    });

    const bubble = chat.bubbles('assistant').first();
    await expect(bubble.locator('.aparte-action-bar')).toBeHidden();
    await expect(chat.streaming(bubble)).toHaveCount(1);
    await expect(bubble.locator('.aparte-waiting')).toBeVisible();
});
