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
 * test the resume. Leaving for another conversation and coming back is tested here: it
 * is the same promise — the pause lives in the conversation — without a reload.
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
const LIST = 'aparte-conversation-list';
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
    await expect(panel).toContainText('Allow Weather Lille?');
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

test('leaving during the wait keeps the question: it comes back with the conversation', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('what is the weather?');
    const panel = page.locator(APPROVAL_PANEL);
    await expect(panel).toBeVisible();

    // Another conversation instead of an answer: the question goes with the one it asks about.
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(panel).toHaveCount(0);
    // Seen, as a person sees it before going back. Clicked earlier, the row lands while
    // the list still settles from the switch (the paused conversation was just saved, which
    // moves it): one WebKit run in fifty lost that click, none in forty after this wait. The list
    // holds its render during a press now (a-press-survives-a-re-render), so the wait is a person's, not a fix.
    await expect(page.locator('aparte-chat-bubble[data-role="user"]').first()).toContainText('weather in Lille');

    // Back: the paused call is still there, the question is put again, and the answer
    // resumes the run on the server, in the same reply.
    await page.locator(LIST).getByText('what is the weather?').click();
    await expect(panel).toBeVisible();
    await expect(rows(chat, 'awaiting-approval')).toHaveCount(1);
    await panel.locator(APPROVE).click();

    await expect(panel).toHaveCount(0);
    await expect(rows(chat, 'resolved')).toHaveCount(1);
    await expect(chat.lastReply).toContainText('Cloudy');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

/*
 * The same three round trips against an AG-UI agent (`?agui=`, `@aparte/runner-ag-ui`), twice.
 * `POST /agui` is a scripted AG-UI agent: the approval is an AG-UI INTERRUPT answered by one
 * `resume` batch, and `ask_user` a frontend tool the agent leaves to the page, answered with a
 * `tool` message — the two ways AG-UI hands a call back. Its input and its events are checked
 * against `@ag-ui/core`'s schemas on the way. `POST /agui/tanstack` is TanStack AI's real
 * server (`chat()`), which pauses for `ask_user` with an interrupt of its own — and frames its
 * runs its own way (a RUN_FINISHED per model step), so the page reads it as its users are
 * told to, with `relaxedRunFraming` (`&agui-framing=relaxed`).
 */
for (const [agent, AGUI, framing] of [
    ['an AG-UI agent', 'http://localhost:5399/agui', ''],
    ['a TanStack AI route', 'http://localhost:5399/agui/tanstack', '&agui-framing=relaxed'],
] as const) {

async function openAgUiSite(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto(`/?scenario&agui=${encodeURIComponent(AGUI)}${framing}`);
    await expect(chat.approvalMode.locator('aparte-select')).toBeVisible();
    return chat;
}

test.describe(agent, () => {
    test('pauses on an interrupt, asks in the page, and Approve runs the tool on the agent', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openAgUiSite(page);
        await chat.send('what is the weather?');

        const panel = page.locator(APPROVAL_PANEL);
        await expect(panel).toBeVisible();
        await expect(panel).toContainText('Allow Weather Lille?');
        await panel.locator(APPROVE).click();

        await expect(panel).toHaveCount(0);
        await expect(rows(chat, 'resolved')).toHaveCount(1);
        await expect(chat.lastReply).toContainText('Let me check');
        await expect(chat.lastReply).toContainText('Cloudy');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('Reject goes back in the resume batch, and the agent answers the refusal', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openAgUiSite(page);
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

    test('a frontend tool the agent calls runs in the page, and its answer goes back', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openAgUiSite(page);
        await chat.send('ask me a question');

        const panel = page.locator(QUESTION_PANEL);
        await expect(panel).toBeVisible();
        await expect(panel).toContainText('Which mood for your landing page?');
        await panel.getByText('Dark and quiet', { exact: false }).first().click();

        await expect(panel).toHaveCount(0);
        await expect(chat.lastReply.locator('.aparte-question-receipt')).toContainText('Dark and quiet');
        await expect(chat.lastReply).toContainText('Noted');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});
}

/*
 * An n8n chat workflow (`?n8n=`, `@aparte/runner-n8n`). `POST /n8n/<id>/chat` is a scripted
 * Chat Trigger that answers as n8n 2.35.7 does — newline-delimited JSON frames labelled
 * `application/json` — with a memory per session: the page sends only the new message, so the
 * second turn shows the workflow kept the first. `/n8n/whole/chat` answers once, as a trigger
 * that waits for its last node does.
 */
const N8N = 'http://localhost:5399/n8n/aparte/chat';
const N8N_WHOLE = 'http://localhost:5399/n8n/whole/chat';

async function openN8nSite(page: Page, webhookUrl = N8N): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto(`/?scenario&n8n=${encodeURIComponent(webhookUrl)}`);
    await expect(chat.approvalMode.locator('aparte-select')).toBeVisible();
    return chat;
}

test.describe('an n8n chat workflow', () => {
    test('streams the answer, and the workflow remembers the session from one turn to the next', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openN8nSite(page);
        await chat.send('bonjour');
        await expect(chat.lastReply).toContainText('n8n heard bonjour, message 1 of this session.');
        // The agent answers in Markdown, and the site's Markdown plugin draws it.
        await expect(chat.lastReply.locator('strong')).toHaveText('bonjour');

        await chat.send('encore');
        await expect(chat.lastReply).toContainText('n8n heard encore, message 2 of this session.');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('draws the whole answer of a workflow that waits for its last node', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openN8nSite(page, N8N_WHOLE);
        await chat.send('salut');
        await expect(chat.lastReply).toContainText('n8n heard salut, message 1 of this session.');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test("shows a plain sentence when the workflow fails mid-stream, and logs the workflow's own error", async ({ page }) => {
        const errors = collectPageErrors(page);
        const warnings: string[] = [];
        page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
        const chat = await openN8nSite(page);
        await chat.send('please fail');
        await expect(chat.lastReply.locator('.aparte-segment-error[data-error-code="PROVIDER_ERROR"]')).toBeVisible();
        await expect(chat.lastReply).not.toContainText('The model is down (scripted failure).');
        await expect.poll(() => warnings.some((w) => w.includes('The model is down (scripted failure).'))).toBe(true);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});
