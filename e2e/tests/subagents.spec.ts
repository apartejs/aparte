/**
 * Sub-agents, end to end, on every example: the scripted model delegates through one tool call
 * (`delegate`, `@aparte/provider-scenario`), each sub-agent runs as a nested loop on the site's
 * real tools, and `@aparte/plugin-subagents` gives each one its line.
 *
 * What a person sees: one line per sub-agent with its name and its task; several at once while
 * they work; "1 tool · 2s" once each is done; none of their words in the reply, which holds only
 * the model's own answer. One sub-agent is the delegate call's own row. A sub-agent whose call
 * needs approval is named by the panel. Stop leaves the lines reading stopped.
 *
 * The three paths are the examples' (`apps/examples/_shared/sub-agents.ts`), asked for in so
 * many words on the scripted model (`?scenario`).
 */
import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const TEAM = 'Get the release ready with three sub-agents.';
const ONE = 'Ask a sub-agent for the last release.';
const GATED = 'Have a sub-agent run the build.';

/** The three sub-agents of the team path, with the task each was given and what each answers. */
const TEAM_AGENTS = [
    { name: 'Checklist scout', task: 'Find what the release checklist asks for', says: 'The checklist asks for a changelog entry' },
    { name: 'Changelog reader', task: 'Find the last release in the changelog', says: 'The last entry is 0.16.11.' },
    { name: 'Version checker', task: 'Say which version number comes next', says: 'so it is a minor bump' },
];

/** "1 tool · 2s", on the line's second line once it is over: a count and a duration, in whatever unit the duration takes. */
const DONE_NOTE = /^1 tool · \S/;

const PANEL = '.aparte-elic-panel.aparte-approval-panel';
const APPROVE = '.aparte-approval-option--affirm';
const REJECT = '.aparte-approval-option--deny';

async function openSite(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    return chat;
}

/** The reply's own text, sub-agent lines excluded: what the model said, and nothing else. */
async function replyText(chat: ChatPage): Promise<string> {
    return chat.lastReply.evaluate((bubble) => [...bubble.querySelectorAll('.aparte-segment-text')].map((el) => el.textContent ?? '').join('\n'));
}

test('three sub-agents work side by side, each on its line, and the reply keeps only the model’s answer', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.send(TEAM);

    // While they work: three lines at once, each with its name and its task.
    for (const agent of TEAM_AGENTS) {
        const line = chat.toolRow(agent.name);
        await expect(line).toHaveCount(1);
        await expect(chat.toolTarget(line)).toHaveText(agent.task);
    }
    await expect(chat.toolRows().and(page.locator('[data-status="pending"]'))).toHaveCount(4);
    await expect(chat.toolRow('Delegating to 3 sub-agents…')).toHaveCount(1);
    const working = await chat.lastReply.innerText();
    for (const agent of TEAM_AGENTS) expect(working, `${agent.name}'s words stay out of the reply`).not.toContain(agent.says);
    // Heights while they work, to hold against the heights once they are done: a line that grew
    // a second line when its sub-agent began acting and lost it at its end moved every line
    // under it twice.
    const heightsOf = () => Promise.all(TEAM_AGENTS.map(async (agent) => Math.round((await chat.toolRow(agent.name).boundingBox())!.height)));
    const whileWorking = await heightsOf();

    // Once they are back: each line done, with its count and its duration, and the answer.
    await expect(chat.lastReply).toContainText('Ready to cut 0.17.0', { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    for (const agent of TEAM_AGENTS) {
        const line = chat.toolRow(agent.name);
        await expect(line).toHaveAttribute('data-status', 'resolved');
        await expect(chat.toolActivity(line)).toHaveText(DONE_NOTE);
    }
    expect(await heightsOf(), 'each line keeps its height from its start to its end').toEqual(whileWorking);
    await expect(chat.toolRow('Delegated to 3 sub-agents')).toHaveAttribute('data-status', 'resolved');
    // Four rows: the call and its three sub-agents. Their own calls are theirs, not the reply's.
    await expect(chat.toolRows()).toHaveCount(4);
    const text = await chat.lastReply.innerText();
    for (const agent of TEAM_AGENTS) expect(text).not.toContain(agent.says);
    expect(await replyText(chat)).toContain('Ready to cut 0.17.0');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('one sub-agent is the delegate call’s own row', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.send(ONE);

    const line = chat.toolRow('Changelog reader');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-tool-name', 'delegate');
    await expect(chat.toolTarget(line)).toHaveText('Find the last release in the changelog');

    await expect(chat.lastReply).toContainText('The last release was 0.16.11', { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    await expect(chat.toolRows()).toHaveCount(1);
    await expect(line).toHaveAttribute('data-status', 'resolved');
    await expect(chat.toolActivity(line)).toHaveText(DONE_NOTE);
    expect(await chat.lastReply.innerText()).not.toContain('The last entry is 0.16.11.');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('the approval panel names the sub-agent that asks, and approving lets the turn finish', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.send(GATED);

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    // The call as its row would name it, and who wants to run it.
    await expect(panel).toContainText('Run command');
    await expect(panel).toContainText('for Build runner?');
    const line = chat.toolRow('Build runner');
    await expect(line).toHaveCount(1);
    await expect(chat.toolActivity(line)).toContainText('Run command');

    await panel.locator(APPROVE).click();
    await expect(panel).toHaveCount(0);
    await expect(chat.lastReply).toContainText('The build is green', { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    await expect(line).toHaveAttribute('data-status', 'resolved');
    await expect(chat.toolActivity(line)).toHaveText(DONE_NOTE);
    expect(await chat.lastReply.innerText()).not.toContain('The build finished in 12.4 s with no errors.');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('rejecting the sub-agent’s command: the reply says it was refused, not that the build passed', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.send(GATED);

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await panel.locator(REJECT).click();
    await expect(panel).toHaveCount(0);

    await expect(chat.lastReply).toContainText('its command was refused', { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    const text = await replyText(chat);
    expect(text).not.toContain('The build is green');
    expect(text).not.toContain('12.4 s');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('Stop while sub-agents work leaves their lines stopped and the composer usable', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.send(TEAM);
    for (const agent of TEAM_AGENTS) await expect(chat.toolRow(agent.name)).toHaveAttribute('data-status', 'pending');

    await expect(chat.sendButton).toHaveClass(/aparte-is-streaming/);
    await chat.sendButton.click();
    await expect(chat.sendButton).not.toHaveClass(/aparte-is-streaming/, { timeout: 10_000 });

    for (const agent of TEAM_AGENTS) await expect(chat.toolRow(agent.name)).toHaveAttribute('data-status', 'aborted');
    await expect(chat.toolRows().and(page.locator('[data-status="pending"]'))).toHaveCount(0);
    const text = await chat.lastReply.innerText();
    for (const agent of TEAM_AGENTS) expect(text).not.toContain(agent.says);
    expect(text).not.toContain('Ready to cut');

    await chat.sendAndSettle('a haiku, please', { expect: 'Web components hum' });
    expect(errors, 'no uncaught page errors').toEqual([]);
});
