/**
 * The approval gate, end to end, in a browser: a tool that must be approved, the four
 * modes, and what the model is told when a call does not run.
 *
 * Every piece of this chain existed and none of it had ever run together on a page.
 * Core owns the mechanism (a policy on the config, the gate in the loop, the panel at
 * the composer, the refusal appended as a `tool` message); `@aparte/plugin-approval`
 * owns the mode and the classification; the app owns the tool NAMES. The unit suites
 * cover each piece against a stub of the next one — which is exactly the shape that
 * cannot see a mode switching nothing, a panel that never opens, or a refusal the model
 * reads as a result.
 *
 * It runs on the SCRIPTED model (`?scenario`, no network mock): the examples' scenario
 * answers "the weather" with one gated call and "ship it" with a four-tool chain, so a
 * decision taken mid-chain — approve, refuse, refuse by policy — is observable without
 * inventing a wire fixture for it.
 */

import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

/** The panel core builds for an approval — the elicitation panel, in its approval shape. */
const PANEL = '.aparte-elic-panel.aparte-approval-panel';
/** The two options: `--affirm` / `--deny` name the MEANING, which is what to select on. */
const APPROVE = '.aparte-approval-option--affirm';
const REJECT = '.aparte-approval-option--deny';
/** What is being approved: the call's arguments, under the question. */
const ARGS = '.aparte-approval-args';
/** One row per tool call in the transcript; `data-status` is where it got to. */
const TOOL_ROW = '.aparte-segment-tool-call';
const rows = (chat: ChatPage, status?: string) =>
    chat.lastReply.locator(status ? `${TOOL_ROW}[data-status="${status}"]` : TOOL_ROW);

/** The scripted site, on its scripted model. `ask` is the mode it starts in. */
async function openSite(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    await expect(chat.approvalMode.locator('aparte-select')).toBeVisible();
    return chat;
}

test('a gated call asks before it runs, and Approve lets it through', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('what is the weather?');

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    // The tool the model chose, by the name it called — wire format, never translated.
    await expect(panel).toContainText('get_weather');
    // And the ARGUMENTS, which are the whole of what a person approves. They used to sit
    // in the transcript row behind a closed disclosure while the panel asked "Run this?".
    await expect(panel.locator(ARGS)).toContainText('Lille');
    // The transcript says the same thing, on the row for that call.
    await expect(rows(chat, 'awaiting-approval')).toHaveCount(1);

    await panel.locator(APPROVE).click();

    await expect(panel).toHaveCount(0);
    await expect(rows(chat, 'resolved')).toHaveCount(1);
    // The handler ran and the model answered on its result: the round trip, not just the
    // panel closing.
    await expect(chat.lastReply).toContainText('Cloudy');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('Reject stops the call, and the model answers the refusal', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);

    await chat.send('what is the weather?');
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await panel.locator(REJECT).click();

    await expect(panel).toHaveCount(0);
    await expect(rows(chat, 'rejected')).toHaveCount(1);
    // A refusal hands the model a TURN to read it in — this sentence is the scripted
    // model's answer to the `tool` message the loop appended, not a canned UI string.
    await expect(chat.lastReply).toContainText('I have not run it');
    // And the handler never ran: nothing in the bubble came from the tool.
    await expect(chat.lastReply).not.toContainText('Cloudy');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('auto never asks', async ({ page }) => {
    const chat = await openSite(page);
    await chat.setApprovalMode('auto');

    await chat.sendAndSettle('what is the weather?', { expect: 'Cloudy' });

    // `auto` is auto: an UNCLASSIFIED tool with its own `needsApproval` goes through too,
    // which is the one cell of the table a classification cannot express.
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(rows(chat, 'resolved')).toHaveCount(1);
});

test('plan runs the reads and refuses the write, without asking anyone', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.setApprovalMode('plan');

    await chat.send('ship it');

    // Two reads run — `search_docs` and `read_file` are classified `read`, and plan mode
    // allows a read. The write is refused on the spot.
    await expect(rows(chat, 'resolved')).toHaveCount(2);
    await expect(rows(chat, 'rejected')).toHaveCount(1);
    // A `deny` is a decision already made, so nobody is asked: announcing a pause for it
    // would paint `awaiting-approval` on a row nobody will ever answer.
    await expect(page.locator(PANEL)).toHaveCount(0);
    // The refusal the MODEL reads is the policy's own sentence, verbatim — the reason a
    // ruling carries one at all.
    await expect(chat.lastReply).toContainText('Plan mode:');
    await expect(chat.lastReply).toContainText('I have not run it');
    // The rest of the turn is skipped: refusing one call cannot license the ones after it.
    await expect(rows(chat)).toHaveCount(3);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a four-tool turn runs end to end under auto', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openSite(page);
    await chat.setApprovalMode('auto');

    await chat.sendAndSettle('ship it', { expect: 'Checklist done' });

    // THE measurement: four consecutive tool rows in one bubble. Nothing in this
    // repository could produce a multi-tool turn before the scripted chain, so the
    // question CLAUDE.md defers ("do consecutive calls make a transcript unreadable?")
    // had no page to be asked on. Four quiet rows, one per call.
    await expect(rows(chat)).toHaveCount(4);
    await expect(rows(chat, 'resolved')).toHaveCount(4);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('an open approval panel has no critical/serious axe violations', async ({ page }) => {
    // The a11y suite scans the idle chat, a streamed exchange and an open dropdown. This
    // panel is the highest-stakes control in the library — the one whose whole purpose is
    // to stop a model doing something — and it was never in a scan.
    const chat = await openSite(page);
    await chat.send('what is the weather?');
    await expect(page.locator(PANEL)).toBeVisible();

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});
