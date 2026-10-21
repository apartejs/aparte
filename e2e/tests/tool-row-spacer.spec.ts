/**
 * Opening a tool row gives back the room it takes (#105).
 *
 * The bottom spacer lets the person's message rise to the top of the transcript; it is the
 * room the reply has not filled yet. A tool row is a `<details>`: opening it grows the reply
 * through an ATTRIBUTE, which neither of the viewport's observers saw, so the spacer kept its
 * closed-row size and a blank as tall as the opened row appeared under the reply.
 *
 * The spacer exists once the transcript overflows, so a few short exchanges come first; the
 * call's turn is then short against the view and the spacer large. What a reader sees is the
 * claim: while the spacer has room, opening the row does not make the transcript any longer.
 */

import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const ROW = '.aparte-segment-tool-call[data-status="resolved"]';

/** The scrollable length, the spacer in force (either mode) and the content without it. */
async function measure(page: Page): Promise<{ length: number; spacer: number; content: number }> {
    return page.evaluate(() => {
        const surface = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        const host = document.querySelector('aparte-chat-viewport') as HTMLElement;
        const fwSpacer = parseFloat(getComputedStyle(host).getPropertyValue('--aparte-fw-spacer')) || 0;
        const coreSpacer = (document.querySelector('.aparte-bottom-spacer') as HTMLElement | null)?.offsetHeight ?? 0;
        const spacer = Math.max(fwSpacer, coreSpacer);
        return { length: surface.scrollHeight, spacer, content: surface.scrollHeight - spacer };
    });
}

/** Wait until two reads a poll apart agree: the layout has stopped moving. */
async function settled(page: Page): Promise<{ length: number; spacer: number; content: number }> {
    let last = await measure(page);
    await expect.poll(async () => {
        const now = await measure(page);
        const still = Math.abs(now.length - last.length) < 1 && Math.abs(now.spacer - last.spacer) < 1;
        last = now;
        return still;
    }, { timeout: 5_000 }).toBe(true);
    return last;
}

test('opening a tool row does not lengthen the transcript while the spacer has room', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    await expect(chat.approvalMode.locator('aparte-select')).toBeVisible();
    // No panel in the way: the call runs, and the row settles on its result.
    await chat.setApprovalMode('auto');
    for (let i = 0; i < 5; i++) await chat.sendAndSettle(`filler turn ${i}`);

    await chat.send('what is the weather?');
    const row = chat.lastReply.locator(ROW);
    await expect(row).toHaveCount(1);
    await expect(chat.lastReply).toContainText('Cloudy');
    const before = await settled(page);

    await row.locator('summary.aparte-tool-summary').click();
    await expect(row).toHaveJSProperty('open', true);
    const after = await settled(page);

    const grew = after.content - before.content;
    expect(grew, 'opening the row grew the reply').toBeGreaterThan(8);
    expect(before.spacer, 'the spacer had room for it').toBeGreaterThan(grew);
    expect(Math.abs(after.length - before.length), `the transcript stays ${before.length}px long`).toBeLessThanOrEqual(2);
    expect(errors, 'no uncaught page errors').toEqual([]);
});
