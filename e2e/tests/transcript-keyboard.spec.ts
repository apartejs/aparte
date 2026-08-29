/**
 * The transcript can be read with a keyboard — which on WebKit it could not.
 *
 * Chromium and Firefox hand an unfocusable overflow box a keyboard scroll of their
 * own; WebKit does not. So on Safari a plain-text transcript — no links, no code
 * blocks, nothing focusable inside — stopped at the first screen for anyone not using
 * a pointer, with no error and nothing on screen to say why.
 *
 * This spec is the only place that is visible. jsdom has no layout and no scrolling
 * engine, so `transcript-is-focusable.test.ts` can only prove the attributes are on
 * the surface; whether pressing a key then moves it is an engine question. That is
 * also why it runs on `vanilla` — core raw, in the WEBKIT project list — rather than
 * on a wrapper: the DOM under test is core's own and identical everywhere, and the
 * engine is the variable that matters.
 *
 * Both halves are asserted, because either alone is satisfiable by accident: that the
 * surface is REACHED by Tab (a tab stop that exists only because a hidden scroll
 * button happens to sit inside the scroller is a coincidence, not an affordance), and
 * that a key pressed there actually scrolls.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** The node that scrolls in the vanilla shell. */
const SURFACE = '.aparte-viewport-container';

/** Enough turns that the transcript is genuinely taller than its box. */
async function fillPastTheFold(chat: ChatPage): Promise<void> {
    for (let i = 0; i < 7; i++) await chat.sendAndSettle(`keyboard turn ${i}`, { expect: MOCK_REPLY_MARK });
}

const metrics = (page: Page) =>
    page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    }, SURFACE);

test('the transcript is reachable by Tab and scrolls from the keyboard', async ({ page }) => {
    // Seven full turns under WebKit, alongside every other dev server.
    test.slow();
    const errors = collectPageErrors(page);
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await fillPastTheFold(chat);

    const before = await metrics(page);
    expect(before.scrollHeight, 'the transcript must overflow for any of this to mean anything')
        .toBeGreaterThan(before.clientHeight + 4);

    // ── it is in the tab order ───────────────────────────────────────────────
    // Walked from the top of the document rather than asserted on the attribute:
    // `tabindex="0"` on a node the browser never reaches (hidden, `display: none`,
    // inside an `inert` subtree) is not a tab stop, and the attribute alone cannot
    // tell those apart.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(
            (sel) => document.activeElement === document.querySelector(sel),
            SURFACE,
        );
    }
    expect(reached, 'Tab never lands on the transcript, so it cannot be read without a pointer').toBe(true);

    // ── and a key pressed there moves it ─────────────────────────────────────
    // Sent to the bottom first: the transcript sticks there while a reply streams,
    // so PageUp is the direction with somewhere to go.
    await page.evaluate((sel) => { const el = document.querySelector(sel)!; el.scrollTop = el.scrollHeight; }, SURFACE);
    const bottom = await metrics(page);
    expect(bottom.scrollTop, 'could not reach the bottom to scroll up from').toBeGreaterThan(0);

    // Pressed inside the poll, not once before it: the viewport keeps confirming its
    // bottom for a few hundred milliseconds after a scroll of its own (the settle
    // window), and under CI load a single PageUp landing inside that window is put
    // back — measured as one flaky run on vanilla-webkit. A reader presses again;
    // so does the test.
    await expect
        .poll(async () => {
            await page.keyboard.press('PageUp');
            return (await metrics(page)).scrollTop;
        }, { message: 'PageUp on the focused transcript did not scroll it — the WebKit defect' })
        .toBeLessThan(bottom.scrollTop);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the transcript carries a name for a screen reader', async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/');
    const surface = page.locator(SURFACE);
    // A focusable region with no accessible name is announced as an unnamed group,
    // which is a worse answer than no tab stop at all — so the name ships with it.
    await expect(surface).toHaveAttribute('tabindex', '0');
    await expect(surface).toHaveAttribute('aria-label', /\S/);
    await expect(surface).toHaveAttribute('role', 'log');
});
