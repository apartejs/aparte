/**
 * The conversation persistence guide's recipe, in a browser, on the five framework examples:
 * the open conversation kept in the app's state and handed back to the chat —
 * `conversationId` set from `onConversationCreated`. `?controlled-conversation` turns it on.
 *
 * The id comes back while the first reply streams. The chat used to take it as a new
 * conversation to open and re-read it from the manager, which did not hold the reply yet: the
 * reply's text landed in the person's bubble, the person's message disappeared, and Send stayed
 * disabled. The reply is paced here, so the id does land mid-stream.
 */
import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test('a first message streams its reply into the reply bubble, and Send comes back', async ({ page }) => {
    await installLlmMock(page, { pace: 40 });
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?controlled-conversation');

    await chat.sendAndSettle('controlled conversation probe', { expect: MOCK_REPLY_MARK });

    // One question, one answer, in that order, each in its own bubble.
    expect(await chat.roles()).toEqual(['user', 'assistant']);
    await expect(chat.bubbles('user')).toContainText('controlled conversation probe');
    await expect(chat.bubbles('user')).not.toContainText(MOCK_REPLY_MARK);
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);

    // The turn is over: the button sends again.
    await expect(chat.sendAct).toHaveAttribute('data-act', 'send');

    // And a second message goes into the same conversation, answered as the first was.
    await chat.sendAndSettle('a second message', { expect: MOCK_REPLY_MARK });
    expect(await chat.roles()).toEqual(['user', 'assistant', 'user', 'assistant']);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
