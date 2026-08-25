/**
 * Two chats on one page.
 *
 * Core supports it (per-instance config, `scopeToTargetId`, target resolution per
 * event) and six jsdom tests cover the config isolation — but nothing ever proved
 * the ROUTING in a browser, where it actually matters: the client listens on
 * `window`, every core event bubbles + composes, and a mis-resolved target sends
 * a reply into the wrong transcript. That is precisely the class of bug jsdom
 * hides.
 *
 * Fixture: the vanilla example mounts a second chat under `?chats=2`, both
 * composers carrying `target`, one client serving both.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/?chats=2');
});

test('both chats mount independently', async ({ page }) => {
    const a = new ChatPage(page, '#chat-a');
    const b = new ChatPage(page, '#chat-b');

    await expect(a.viewport).toBeAttached();
    await expect(b.viewport).toBeAttached();
    await expect(a.editor).toBeVisible();
    await expect(b.editor).toBeVisible();
    // Two separate transcripts, both empty.
    await expect(a.bubbles()).toHaveCount(0);
    await expect(b.bubbles()).toHaveCount(0);
});

test('a reply lands only in the chat that sent it', async ({ page }) => {
    const errors = collectPageErrors(page);
    const a = new ChatPage(page, '#chat-a');
    const b = new ChatPage(page, '#chat-b');

    await a.sendAndSettle('question from A', { expect: MOCK_REPLY_MARK });

    // A holds the exchange…
    await expect(a.bubbles('user')).toContainText('question from A');
    await expect(a.bubbles('assistant')).toHaveCount(1);
    // …and B was untouched: no user bubble, and crucially no stray reply.
    await expect(b.bubbles()).toHaveCount(0);

    // Now the other direction.
    await b.sendAndSettle('question from B', { expect: MOCK_REPLY_MARK });
    await expect(b.bubbles('user')).toContainText('question from B');
    await expect(b.bubbles('assistant')).toHaveCount(1);
    // A did not gain a second reply from B's turn.
    await expect(a.bubbles('assistant')).toHaveCount(1);
    await expect(a.bubbles()).toHaveCount(2);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('retrying in one chat does not touch the other', async ({ page }) => {
    const a = new ChatPage(page, '#chat-a');
    const b = new ChatPage(page, '#chat-b');

    await a.sendAndSettle('A first turn', { expect: MOCK_REPLY_MARK });
    await b.sendAndSettle('B first turn', { expect: MOCK_REPLY_MARK });

    await a.action(a.lastReply, 'retry').click();

    // A forked (its picker appears); B kept exactly its own single exchange.
    await expect(a.branchPicker(a.lastReply)).toBeVisible({ timeout: 20_000 });
    await expect(b.bubbles()).toHaveCount(2);
    await expect(b.branchPicker(b.lastReply)).toBeHidden();
});

test('an in-flight turn in one chat leaves the other composer idle', async ({ page }) => {
    await page.unrouteAll();
    await installLlmMock(page, { scenario: 'slow', delayMs: 5000 });
    await page.goto('/?chats=2');

    const a = new ChatPage(page, '#chat-a');
    const b = new ChatPage(page, '#chat-b');

    await a.send('slow turn in A');

    // A shows the streaming affordances; B's send button must not follow along.
    await expect(a.sendButton).toHaveClass(/aparte-is-streaming/, { timeout: 15_000 });
    await expect(a.streaming()).toHaveCount(1);
    await expect(b.sendButton).not.toHaveClass(/aparte-is-streaming/);
    await expect(b.streaming()).toHaveCount(0);
});
