/**
 * THE WAITING STATE — a contract, not yet an implementation.
 *
 * Between "user sends" and the first token there is today: an assistant bubble
 * with a name, an empty body, and nothing else. No indicator, no skeleton, no
 * announcement. Reported from bonaparte as "it says Assistant, you wait, and you
 * have no idea what is happening" — and in the display-only path (appendMessage
 * with no `status`) the copy/retry buttons show up on that empty bubble too.
 *
 * What core has today, verified in source: the client marks the message
 * `status: 'pending'` before the request is even sent; the bubble reflects
 * pending/streaming as `data-streaming` + `aria-busy` and CSS hides the footer;
 * `<aparte-chat-status>` exists, is mounted by all four wrappers, and is NEVER
 * switched on (`onTypingChange(true)` appears nowhere in the repo); the skeleton
 * provider is never invoked; `locale.typing` / `locale.thinking` are dead strings.
 *
 * These tests are `fixme` on purpose: they state the intended behaviour so the
 * design work has a target and can't quietly land half-done. Turning them on IS
 * the acceptance criterion of that work.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

test.fixme('a waiting turn shows a built-in indicator, with no app wiring', async ({ page }) => {
    await installLlmMock(page, { scenario: 'slow', delayMs: 6000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('what happens while I wait');

    // Something must say "working on it" by default — today nothing does.
    await expect(chat.status).toBeVisible({ timeout: 10_000 });
    await expect(chat.status).not.toBeEmpty();
});

test.fixme('the waiting indicator uses the active locale, not a hardcoded string', async ({ page }) => {
    // `locale.typing` exists and is never read; a French app must not be told
    // "Typing" in English.
    await installLlmMock(page, { scenario: 'slow', delayMs: 6000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('locale probe');
    await expect(chat.status).toBeVisible({ timeout: 10_000 });

    const localized = await page.evaluate(() => {
        const cfg = (window as unknown as { AparteConfig?: { getLocale(): Record<string, string> } }).AparteConfig;
        return cfg?.getLocale().typing ?? null;
    });
    if (localized) await expect(chat.status).toContainText(localized);
});

test.fixme('an imperatively appended assistant message can declare itself pending', async ({ page }) => {
    // The bring-your-own-loop path: appendMessage() with no `status` leaves the
    // bubble looking finished — action bar and all — before a single token
    // arrives. Pending must be expressible (and ideally the default for an empty
    // assistant message that a token stream is about to fill).
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
});
