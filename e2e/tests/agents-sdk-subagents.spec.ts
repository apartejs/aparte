/**
 * An AG-UI agent's sub-agents, in a browser: `apps/examples/agents-sdk` under `?subagents`
 * replays a scripted AG-UI 1.0 run (`server/subagents.ts`) — the support agent opens the order
 * tracker through its `delegate` call (`parentToolCallId`) and the returns desk on its own, their
 * events interleaved, each tagged with its `subagentRunId`. `@aparte/runner-ag-ui` reads it and
 * `@aparte/plugin-subagents` draws it: two lines, and a reply that holds the agent's words only.
 */
import { test, expect } from '@playwright/test';
import { ChatPage } from '../helpers/chat.js';
import { collectPageErrors } from '../helpers/actions.js';

const ORDER_ANSWER = 'Order 1042 shipped with La Poste; it arrives in 2 days.';
const RETURNS_ANSWER = 'Returns are open for 30 days after delivery';
const REPLY = 'Once it has, you have 30 days to send it back.';

test('two sub-agents of an AG-UI agent get a line each, and stay out of the reply', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?subagents');
    const chat = new ChatPage(page);
    await chat.send('Where is order 1042, and can I still return it?', { gated: false });

    // Both at once while they work: the one the call opened is the call's row.
    const tracker = chat.toolRow('Order tracker');
    const desk = chat.toolRow('Returns desk');
    await expect(tracker).toHaveAttribute('data-status', 'pending');
    await expect(desk).toHaveAttribute('data-status', 'pending');
    await expect(tracker).toHaveAttribute('data-tool-name', 'delegate');
    await expect(chat.toolTarget(tracker)).toHaveText('Find where order 1042 is');
    await expect(chat.toolTarget(desk)).toHaveText('Check whether order 1042 can still be returned');

    await expect(chat.lastReply).toContainText(REPLY, { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    await expect(chat.toolRows()).toHaveCount(2);
    await expect(tracker).toHaveAttribute('data-status', 'resolved');
    await expect(desk).toHaveAttribute('data-status', 'resolved');
    await expect(chat.toolNote(tracker)).toHaveText(/^1 tool · \S/);
    await expect(chat.toolNote(desk)).toHaveText(/^1 tool · \S/);

    const text = await chat.lastReply.innerText();
    expect(text).toContain('Two things to check, so two sub-agents');
    expect(text).not.toContain(ORDER_ANSWER);
    expect(text).not.toContain(RETURNS_ANSWER);
    expect(errors, 'no uncaught page errors').toEqual([]);
});
