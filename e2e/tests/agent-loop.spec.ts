/**
 * The agent loop on a SERVER, in a browser, on every site.
 *
 * The site opens with `?agent=<url>`: its `AparteClient` sends each turn to the examples'
 * agent server (`apps/examples/_shared/agent-server.mjs`, started by this config) instead
 * of running the loop itself. The server runs the same scripted model, with `get_weather`
 * as a SERVER tool that needs a person, and `ask_user` stays a BROWSER tool.
 *
 * What only a browser shows: the run suspends on the server, the page's own panel asks
 * (the approval plugin's policy included), the answer crosses the network with the
 * server's signed ticket, and the reply continues in the same bubble — the round trip,
 * on the real wire, through each framework's wrapper.
 *
 * A reload DURING the wait is pinned in core's in-memory end-to-end test: the examples
 * keep their conversations in memory, so a reload here would lose the conversation, not
 * test the resume.
 */

import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const AGENT = 'http://localhost:5399/api/agent';

const APPROVAL_PANEL = '.aparte-elic-panel.aparte-approval-panel';
const APPROVE = '.aparte-approval-option--affirm';
const REJECT = '.aparte-approval-option--deny';
const QUESTION_PANEL = '.aparte-elic-panel';
const TOOL_ROW = '.aparte-segment-tool-call';
const rows = (chat: ChatPage, status: string) => chat.lastReply.locator(`${TOOL_ROW}[data-status="${status}"]`);

async function openSite(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto(`/?scenario&agent=${encodeURIComponent(AGENT)}`);
    await expect(chat.approvalMode.locator('aparte-select')).toBeVisible();
    return chat;
}

test('a server tool that needs a person asks in the page, and Approve lets it run on the server', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('what is the weather?');

    const panel = page.locator(APPROVAL_PANEL);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('get_weather');
    await expect(rows(chat, 'awaiting-approval')).toHaveCount(1);

    await panel.locator(APPROVE).click();

    await expect(panel).toHaveCount(0);
    await expect(rows(chat, 'resolved')).toHaveCount(1);
    // The server ran the tool and the model answered on its result, in the same bubble.
    await expect(chat.lastReply).toContainText('Cloudy');
    await expect(chat.lastReply).toContainText('Let me check');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('Reject crosses the network: the server does not run the tool, and the model answers the refusal', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('what is the weather?');
    const panel = page.locator(APPROVAL_PANEL);
    await expect(panel).toBeVisible();
    await panel.locator(REJECT).click();

    await expect(panel).toHaveCount(0);
    await expect(rows(chat, 'rejected')).toHaveCount(1);
    await expect(chat.lastReply).toContainText('I have not run it');
    await expect(chat.lastReply).not.toContainText('Cloudy');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a browser tool runs in the page while the loop runs on the server', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('ask me a question');

    // `ask_user` is the PAGE's tool: the server suspends on it, the page asks.
    const panel = page.locator(QUESTION_PANEL);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Which mood for your landing page?');
    await panel.getByText('Dark and quiet', { exact: false }).first().click();

    await expect(panel).toHaveCount(0);
    // The answer went back to the server, and the conversation keeps the exchange.
    const receipt = chat.lastReply.locator('.aparte-question-receipt');
    await expect(receipt).toHaveCount(1);
    await expect(receipt).toContainText('Dark and quiet');
    expect(errors, 'no uncaught page errors').toEqual([]);
});
