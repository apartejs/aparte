/**
 * A person takes the conversation over from the AI, and hands it back, in each example.
 *
 * `?handoff` adds a simulated advisor to the chat site (`apps/examples/_shared/handoff.ts`):
 * "Talk to a person" turns the AI off for the open conversation (`setAutoReply(false, id)`),
 * draws a notice and Marie's messages under her name and picture, marks what the person
 * writes "Read by Marie" through the id the send carries, and "Hand back to the assistant"
 * turns the AI on again. Every one of those writes goes through the public API a real app
 * has — the chat's `appendMessage` / `updateMessage` — and the framework is the variable:
 * each wrapper mirrors a message it did not write itself.
 *
 * The scripted model answers from what it is sent: after the hand-back it says what Marie
 * promised only if her message reached the request.
 */

import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

const NOTICE = 'aparte-chat-bubble[data-kind="notice"]';
const MARIE = 'aparte-chat-bubble[data-role="assistant"][data-author-type="human"]';
/** The AI's own replies: an assistant message that is neither a notice nor a person's. */
const AI = 'aparte-chat-bubble[data-role="assistant"]:not([data-kind="notice"]):not([data-author-type="human"])';
const LIST = 'aparte-conversation-list';

const takeOver = async (chat: ChatPage) => {
    await chat.page.getByRole('button', { name: 'Talk to a person' }).click();
    await expect(chat.page.locator(NOTICE).last()).toContainText('Marie joined the conversation');
    await expect(chat.page.locator(MARIE).first()).toContainText('I’m Marie');
};

test('an advisor takes over, answers with a name and an avatar, and hands back', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario&handoff&fast');
    await chat.sendAndSettle('Where is my order?');
    await expect(page.locator(AI)).toHaveCount(1);

    await takeOver(chat);
    const marie = page.locator(MARIE);
    await expect(marie.first()).toHaveAttribute('name', 'Marie');
    await expect(marie.first().locator('img.aparte-avatar__img')).toHaveAttribute('src', /^data:image\//);

    // The person writes: nothing waits on the AI, and Marie reads it and answers.
    await chat.send('Is it shipped?');
    const mine = chat.bubbles('user').last();
    await expect(mine.locator('.aparte-message-note')).toHaveText('Read by Marie');
    await expect(marie).toHaveCount(2);
    await expect(marie.last()).toContainText('ships today');
    await expect(page.locator(AI)).toHaveCount(1);
    await expect(chat.streaming()).toHaveCount(0);

    // The line, Marie's picture and the note read well to a screen reader and in contrast.
    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);

    // Handed back: the AI answers the next message, and has read what Marie wrote.
    await page.getByRole('button', { name: 'Hand back to the assistant' }).click();
    await expect(page.locator(NOTICE).last()).toContainText('The assistant is back');
    await chat.sendAndSettle('Thanks! Anything else?', { expect: 'Marie confirmed your order ships today' });
    await expect(page.locator(AI)).toHaveCount(2);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the takeover survives a reload', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&handoff&fast&persist');
    await chat.sendAndSettle('Where is my order?');
    await takeOver(chat);
    await chat.send('Is it shipped?');
    await expect(chat.bubbles('user').last().locator('.aparte-message-note')).toHaveText('Read by Marie');
    await expect(page.locator(MARIE)).toHaveCount(2);

    await page.reload();
    await page.locator(LIST).getByText('Where is my order?').click();

    await expect(page.locator(NOTICE)).toContainText('Marie joined the conversation');
    await expect(page.locator(MARIE)).toHaveCount(2);
    await expect(chat.bubbles('user').last().locator('.aparte-message-note')).toHaveText('Read by Marie');

    // Still Marie's conversation: the app applied it again when the conversation loaded.
    await chat.send('Still there?');
    await expect(page.locator(MARIE)).toHaveCount(3);
    await expect(page.locator(AI)).toHaveCount(1);
    await expect(chat.streaming()).toHaveCount(0);
});

test('a message pushed while the AI writes leaves the reply whole', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario&handoff&fast');
    // The scripted model thinks for a moment before it writes: the pushes land in that moment.
    await chat.send('think hard about it');
    await expect(chat.streaming()).not.toHaveCount(0);

    await page.getByRole('button', { name: 'Marie writes' }).click();
    await page.getByRole('button', { name: 'Marie sends a photo' }).click();
    await expect(page.locator(MARIE)).toHaveCount(2);

    await expect(chat.streaming()).toHaveCount(0, { timeout: 20_000 });
    const reply = page.locator(AI);
    await expect(reply).toHaveCount(1);
    await expect(reply).toContainText('Done thinking. The answer is: it depends on the transport.');
    await expect(reply).not.toContainText('Quick note');

    const [text, photo] = [page.locator(MARIE).first(), page.locator(MARIE).last()];
    await expect(text).toContainText('Quick note while it answers');
    await expect(text).not.toContainText('Done thinking');
    await expect(photo.locator('img').last()).toHaveAttribute('src', /^data:image\//);
    await expect(photo).not.toContainText('Done thinking');
    expect(errors, 'no uncaught page errors').toEqual([]);
});
