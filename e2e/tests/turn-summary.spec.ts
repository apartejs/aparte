/**
 * A turn's steps behind one line (`setTurnSummary`), on a real page.
 *
 * The unit suite proves which rows fold; what it cannot show is the real chain: the scripted
 * model's four tools, an approval that comes out of the fold while it waits, a Stop in the
 * middle, and a real click on a real disclosure.
 */
import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const FOLDED = '/?scenario&fast&turns=folded';
const TURN = '.aparte-turn';
const LABEL = '.aparte-turn__label';
const ROW = '.aparte-segment-tool-call';
const APPROVAL_PANEL = '.aparte-elic-panel.aparte-approval-panel';

test('the streaming caret is drawn after the last words, and only while they arrive', async ({ page }) => {
    await installLlmMock(page, { scenario: 'text', pace: 60 });
    const chat = new ChatPage(page);
    await page.goto('/?caret');
    await chat.waitUngated();
    await chat.send('hello');
    const drawn = () => page.evaluate(() => {
        const last = [...document.querySelectorAll('.aparte-message[data-caret] p')].pop();
        return last ? getComputedStyle(last, '::after').content : 'none';
    });
    await expect.poll(drawn, { intervals: [20] }).toBe('""');
    await expect(chat.lastReply.locator('.aparte-message-streaming')).toHaveCount(0, { timeout: 20_000 });
    expect(await drawn()).toBe('none');
});

test('off by default: the same chain draws no fold', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&fast');
    await chat.waitUngated();
    await chat.setApprovalMode('auto');
    await chat.sendAndSettle('ship it');
    await expect(chat.lastReply.locator(ROW)).toHaveCount(4);
    await expect(chat.lastReply.locator(TURN)).toHaveCount(0);
});

test('four calls fold behind one line, and open on a click', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto(FOLDED);
    await chat.waitUngated();
    await chat.setApprovalMode('auto');
    await chat.sendAndSettle('ship it');

    const turn = chat.lastReply.locator(TURN);
    await expect(turn).toHaveCount(1);
    await expect(turn.locator(LABEL)).toHaveText(/4 tools/);
    await expect(turn.locator(ROW).first()).toBeHidden();

    await turn.locator('.aparte-turn__summary').click();
    await expect(turn.locator(ROW)).toHaveCount(4);
    await expect(turn.locator(ROW).first()).toBeVisible();

    // The text the turn ended on is outside, where it can be read.
    await expect(chat.lastReply.locator(`${TURN} .aparte-segment-text`)).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('a call waiting for approval comes out of the fold', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto(FOLDED);
    await chat.waitUngated();
    await chat.setApprovalMode('ask');
    await chat.send('ship it');
    await expect(page.locator(APPROVAL_PANEL)).toBeVisible({ timeout: 20_000 });
    const waiting = chat.lastReply.locator(`${ROW}[data-status="awaiting-approval"]`);
    await expect(waiting).toBeVisible();
    await expect(chat.lastReply.locator(`${TURN} ${ROW}[data-status="awaiting-approval"]`)).toHaveCount(0);
});

test('Stop ends the line that says it is working', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&turns=folded');
    await chat.waitUngated();
    await chat.setApprovalMode('auto');
    // From inside the page: the chain lasts about a second, and a poll from here can miss it.
    await page.evaluate(() => {
        new MutationObserver((_, observer) => {
            if (document.querySelector('.aparte-turn__label')?.textContent !== 'Working…') return;
            observer.disconnect();
            (window as unknown as { __stopped: boolean }).__stopped = true;
            (document.querySelector('aparte-composer') as unknown as { cancel(): void }).cancel();
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await chat.send('ship it');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __stopped?: boolean }).__stopped), { timeout: 20_000 }).toBe(true);
    const label = chat.lastReply.locator(`${TURN} ${LABEL}`);
    await expect(label).not.toHaveText('Working…');
    await expect(chat.lastReply.locator('.aparte-message-streaming')).toHaveCount(0);
});
