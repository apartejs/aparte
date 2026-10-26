/**
 * The Agent Builder article's demo, in a browser: `apps/examples/agents-sdk`.
 *
 * An OpenAI Agents SDK agent — what Agent Builder exports — runs on the dev server behind
 * `/agent`, on the SDK's own scripted model, and streams AG-UI; the page is aparté with
 * `@aparte/runner-ag-ui` and nothing else. What only the whole chain shows: the tool call the
 * SDK ran on the server drawn as a row, the answer streamed after it, the history going back
 * on the next turn, and Stop reaching the server through the request's abort.
 */
import { test, expect } from '@playwright/test';
import { ChatPage } from '../helpers/chat.js';
import { collectPageErrors } from '../helpers/actions.js';

const TOOL_ROW = '.aparte-segment-tool-call';

test('the agent runs its tool on the server, and the chat draws the call and the answer', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.sendAndSettle('Where is order 1042?', { expect: 'Order 1042 has shipped with La Poste and arrives in 2 days.' });
    const row = chat.lastReply.locator(TOOL_ROW);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('get_order_status');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the next turn sends the conversation so far, as AG-UI messages', async ({ page }) => {
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.sendAndSettle('Where is order 1042?', { expect: 'arrives in 2 days' });
    const request = page.waitForRequest((r) => r.url().endsWith('/agent') && r.method() === 'POST');
    await chat.sendAndSettle('Thanks!', { expect: 'This demo runs on a scripted model' });
    const body = (await request).postDataJSON() as { messages: { role: string }[]; threadId: string; runId: string };
    expect(body.threadId).toBeTruthy();
    expect(body.runId).toBeTruthy();
    const roles = body.messages.map((m) => m.role);
    expect(roles[0]).toBe('user');
    expect(roles.at(-1)).toBe('user');
    expect(roles).toContain('assistant');
});

test('Stop ends the reply where it is, without an error, and the next turn still works', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.send('Hello');
    // The first words are on screen, the rest is still coming from the server.
    await expect(chat.lastReply).toContainText('This demo runs', { timeout: 15_000 });
    await expect(chat.sendButton).toHaveClass(/aparte-is-streaming/);
    await chat.sendButton.click();
    await expect(chat.sendButton).not.toHaveClass(/aparte-is-streaming/, { timeout: 10_000 });

    const kept = (await chat.lastReply.textContent()) ?? '';
    expect(kept).toContain('This demo runs');
    expect(kept).not.toContain('to watch the agent call its tool.');
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(0);
    await expect(chat.segment('error')).toHaveCount(0);

    await chat.sendAndSettle('Where is order 7001?', { expect: 'Order 7001 has shipped' });
    expect(errors, 'no uncaught page errors').toEqual([]);
});
