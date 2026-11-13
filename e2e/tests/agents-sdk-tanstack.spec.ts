/**
 * A real TanStack AI agent's sub-agents, in a browser: `apps/examples/agents-sdk` under
 * `?tanstack` talks to `/tanstack`, TanStack AI 1.0's own server code (`server/tanstack.ts`):
 * `chat()` with a `subagents` router of two steps, each sub-agent a `chat()` of its own that
 * calls one real tool and answers, then the main model's reply — on TanStack's scripted model,
 * no key. Nothing on the wire is written by hand: `SUBAGENT_STARTED`/`FINISHED`, the router's
 * plan in their metadata, every sub-agent event tagged with its `subagentRunId`, as TanStack
 * sends them. `@aparte/runner-ag-ui` reads them, `@aparte/plugin-subagents` draws a line per
 * sub-agent (with an Open button, `setupSubagents({ open: 'event' })`), and the plan card
 * draws the router's plan (`setupPlanCard({ activity: 'plan' })`).
 */
import { test, expect } from '@playwright/test';
import { ChatPage } from '../helpers/chat.js';
import { collectPageErrors } from '../helpers/actions.js';

const ORDER_ANSWER = 'Order 1042 shipped with La Poste; it arrives in 2 days.';
const RETURNS_ANSWER = 'Returns are open for 30 days after delivery, so order 1042 can still go back.';
const REPLY = 'Order 1042 is on its way with La Poste and arrives in 2 days. Once it has, you have 30 days to send it back.';

test('a TanStack AI router’s two sub-agents get a line each, its plan is ticked, and a line opens its conversation', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?tanstack');
    const chat = new ChatPage(page);
    await chat.send('Where is order 1042, and can I still return it?', { gated: false });

    // The router's plan, drawn as soon as the first sub-agent starts: one step each, in its order.
    const card = chat.lastReply.locator('.aparte-plan-card');
    const steps = card.locator('.aparte-plan__step');
    await expect(steps).toHaveCount(2);
    await expect(steps.first()).toHaveAttribute('data-status', 'in-progress');
    await expect(steps.nth(1)).toHaveAttribute('data-status', 'pending');

    const tracker = chat.toolRow('Order tracker');
    const desk = chat.toolRow('Returns desk');
    await expect(tracker).toHaveAttribute('data-status', 'pending');
    await expect(chat.toolTarget(tracker)).toHaveText('Find where order 1042 is');

    await expect(chat.lastReply).toContainText(REPLY, { timeout: 30_000 });
    await expect(chat.streaming()).toHaveCount(0);
    await expect(chat.toolRows()).toHaveCount(2);
    await expect(tracker).toHaveAttribute('data-status', 'resolved');
    await expect(desk).toHaveAttribute('data-status', 'resolved');
    await expect(chat.toolTarget(desk)).toHaveText('Check whether order 1042 can still be returned');
    // Each called its one real tool.
    await expect(chat.toolActivity(tracker)).toHaveText(/^1 tool · \S/);
    await expect(chat.toolActivity(desk)).toHaveText(/^1 tool · \S/);
    // The plan, ticked: one card, both done.
    await expect(card).toHaveCount(1);
    await expect(steps.first()).toHaveAttribute('data-status', 'done');
    await expect(steps.nth(1)).toHaveAttribute('data-status', 'done');
    await expect(card.locator('.aparte-plan__count')).toHaveText('2 of 2 done');

    // Nothing a sub-agent said is in the reply.
    const text = await chat.lastReply.innerText();
    expect(text).not.toContain(ORDER_ANSWER);
    expect(text).not.toContain(RETURNS_ANSWER);

    // A line opens its sub-agent's conversation beside the chat: its call, its answer.
    const view = page.locator('aparte-subagent-view');
    await tracker.locator('.aparte-tool-open').click();
    await expect(view).toBeVisible();
    await expect(view.locator('.aparte-subagent-name')).toHaveText('Order tracker');
    await expect(view).toContainText(ORDER_ANSWER);
    await expect(view.locator('.aparte-tool-name', { hasText: 'get_order_status' })).toHaveCount(1);
    await expect(view).not.toContainText(RETURNS_ANSWER);
    await desk.locator('.aparte-tool-open').click();
    await expect(view.locator('.aparte-subagent-name')).toHaveText('Returns desk');
    await expect(view).toContainText(RETURNS_ANSWER);
    expect(errors, 'no uncaught page errors').toEqual([]);
});
