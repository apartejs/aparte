/**
 * The elicitation panel, in a browser, on raw core.
 *
 * This surface had NO browser coverage at all, and the reason is worth writing
 * down: no tool ever reached the model, so nothing could make the panel appear.
 * `_toolsForCurrentModel()` gated on a capability that no preset provider could
 * ever declare, the two specs that drove it were `test.fixme`, and no example
 * registered a tool. Four from-scratch audits read this code and none of them ran
 * it — the defects it turned out to hold were about the composer's chrome, DOM
 * scoping and a11y, which reading finds only if you are looking for them.
 *
 * It runs on `vanilla` deliberately: raw core, hand-written markup, an attachment
 * picker actually in the DOM, and the app the first real test session used.
 */

import { test, expect } from '@playwright/test';
import {
    installLlmMock,
    MOCK_ASK_OPTIONS,
    MOCK_ASK_QUESTION,
    MOCK_REPLY_MARK,
} from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

const PANEL = '.aparte-elic-panel';

test('a tool that asks the user shows a panel with its options', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'ask-question' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.editor.fill('ask me something');
    await chat.sendButton.click();

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(MOCK_ASK_QUESTION);
    for (const option of MOCK_ASK_OPTIONS) {
        await expect(panel, `option "${option}" must be offered`).toContainText(option);
    }

    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('while a question is open, the composer offers nothing that leads nowhere', async ({ page }) => {
    await installLlmMock(page, { scenario: 'ask-question' });
    const chat = new ChatPage(page);
    await page.goto('/');

    // PRECONDITION: this app really does have an attachment picker, or the
    // assertion below is true for free.
    await expect(chat.attachButton, 'the picker exists before the question').toBeVisible();

    await chat.editor.fill('ask me something');
    await chat.sendButton.click();
    await expect(page.locator(PANEL)).toBeVisible();

    // THE assertion. The picker used to stay clickable through a whole elicitation:
    // there is nowhere for a file to go when the composer is answering a question,
    // and ratified decision #8 says an affordance nothing can honour is not
    // rendered. Reported from a real session.
    await expect(chat.attachButton, 'no attachment picker while answering a question').toBeHidden();
    await expect(chat.editor, 'and no text input either').toBeHidden();
    await expect(chat.composer).toHaveAttribute('data-panel-active', '');
});

test('answering restores the composer and resumes the turn', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { scenario: 'ask-question' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.editor.fill('ask me something');
    await chat.sendButton.click();

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await panel.getByText(MOCK_ASK_OPTIONS[0], { exact: false }).first().click();
    // The panel takes the composer's send button over while it is open.
    await chat.sendButton.click();

    await expect(panel).toHaveCount(0);
    await expect(chat.editor, 'the composer is a composer again').toBeVisible();
    await expect(chat.attachButton, 'and the picker comes back').toBeVisible();
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);

    // The answer reached the MODEL, not just the DOM.
    await expect(async () => {
        expect(mock.chatRequests.length, 'a second turn was sent').toBeGreaterThan(1);
        const messages = JSON.stringify(mock.chatRequests.at(-1)?.['messages'] ?? []);
        expect(messages, 'the tool result carries the chosen option').toContain(MOCK_ASK_OPTIONS[0]);
    }).toPass();

    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('an open question has no critical/serious axe violations', async ({ page }) => {
    // The a11y suite scans the idle chat, a streamed exchange and an open model
    // dropdown — never this, because nothing could make it appear.
    //
    // What it does NOT do, measured rather than assumed: catch the grouping defect
    // this panel actually had. Stripping `role="radiogroup"` and `aria-labelledby`
    // from the options leaves this scan GREEN — axe does not flag an unnamed radio
    // group at critical/serious. Four unit tests in `panel.test.ts` are the guard
    // for that; this scan is the regression net for everything else the panel puts
    // on screen (contrast, focus order, labels on the inputs themselves).
    await installLlmMock(page, { scenario: 'ask-question' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.editor.fill('ask me something');
    await chat.sendButton.click();
    await expect(page.locator(PANEL)).toBeVisible();

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('Skip declines, and the composer comes back', async ({ page }) => {
    await installLlmMock(page, { scenario: 'ask-question' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.editor.fill('ask me something');
    await chat.sendButton.click();

    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await panel.locator('.aparte-elic-skip').click();

    // MCP's `decline`: the user chose not to answer, which is not the same as the
    // turn being cancelled — the model is told, and the turn goes on.
    await expect(panel).toHaveCount(0);
    await expect(chat.editor).toBeVisible();
});
