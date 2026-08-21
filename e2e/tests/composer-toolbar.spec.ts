/**
 * The composer toolbar — the row a mode picker or a model selector belongs in.
 *
 * This suite runs on **every** playground, which is the point: the row used to be
 * three positional slots per wrapper in three different syntaxes, and vanilla had only
 * a CSS class written by hand. What is asserted here is the contract that replaced
 * them — one element, and placement by DOM order plus `margin-inline-start: auto`.
 *
 * Scope, honestly: the unit suite already proves that a locale switch puts `dir` on
 * the composer (`locale-live-switch.test.ts`, sabotage-verified). What jsdom cannot
 * prove is the half that needs real layout — that the push is LOGICAL, so the control
 * changes sides with the reading direction. That is what the second test is for, and
 * it is a guard on the idiom we teach: it fails the moment the playgrounds (or the
 * docs they mirror) reach for `margin-left` instead.
 *
 * The mirror ("no toolbar ⇒ no row in the DOM") lives in the wrappers' unit tests,
 * where absence is assertable per framework without a playground that deliberately
 * renders nothing.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/** Free space on each side of the model selector, inside the toolbar row. */
async function gapsAroundSelector(chat: ChatPage): Promise<{ start: number; end: number }> {
    const row = await chat.composerToolbar.boundingBox();
    const control = await chat.composerToolbar.locator('aparte-model-selector').first().boundingBox();
    if (!row || !control) throw new Error('the toolbar or its control has no bounding box');
    return {
        start: control.x - row.x,
        end: row.x + row.width - (control.x + control.width),
    };
}

test('the toolbar renders, and its control is pushed to the end of the row', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await expect(chat.composerToolbar).toHaveCount(1);
    await expect(chat.composerToolbar).not.toHaveAttribute('data-empty', '');

    // The stylesheet REACHED the page. Checked first and named for what it is, because
    // this is how the row actually broke once: the built `dist/index.css` on disk was
    // stale (it is an nx cache output, so a `pnpm build` that "succeeds" can restore an
    // older one), the rule was missing, and an unstyled custom element falls back to
    // `display: inline` -- no flex container, no auto margin, the control back at the
    // start. The geometry assertions below did fail, but they failed with two numbers
    // that say nothing about the cause.
    await expect(chat.composerToolbar).toHaveCSS('display', 'flex');

    // The discriminating measurement: with the auto margin the free space is all on
    // the START side. Drop the margin and the control sits at the start instead, which
    // flips both numbers — so this fails on exactly the regression it is here for.
    const { start, end } = await gapsAroundSelector(chat);
    expect(start).toBeGreaterThan(40);
    expect(end).toBeLessThan(20);
});

test('the push is logical — the control changes sides with the reading direction', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    const ltr = await gapsAroundSelector(chat);
    expect(ltr.start).toBeGreaterThan(ltr.end);

    // `dir` is set directly rather than through a locale switch: the config → `dir`
    // half is a unit test's job, and there is no control in the page to click — a
    // playground shows the finished product, not a demo console.
    await chat.composer.evaluate((el) => el.setAttribute('dir', 'rtl'));

    const rtl = await gapsAroundSelector(chat);
    expect(rtl.end).toBeGreaterThan(rtl.start);
    expect(rtl.start).toBeLessThan(20);
});

test('the composer keeps its breathing room at the bottom edge', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    // Paul saw this in two live apps: as soon as a conversation starts, `center-empty`
    // stops centering the composer and it went flush against the bottom of the screen.
    // The viewport gives 16px between the last bubble and the composer and there was
    // nothing below it — an asymmetry in core's own spacing, not a layout choice, and one
    // an app cannot fix from outside without shrinking the scroll area.
    await chat.sendAndSettle('bottom gap probe');

    const measure = () => chat.composer.evaluate((composer) => {
        const shell = composer.closest('aparte-chat, [data-aparte-chat]');
        if (!shell) throw new Error('no chat shell around the composer');
        return Math.round(shell.getBoundingClientRect().bottom - composer.getBoundingClientRect().bottom);
    });

    // POLLED, not read once: `center-empty` animates `flex-grow` over 0.3s to slide the
    // composer down on the first message, and a single read lands mid-slide — the first
    // version of this test measured 168px on the four wrappers and looked like a layout
    // bug in them. It was the transition, caught at `flex-grow: 0.11`.
    //
    // The window is the token's default, with 1px for sub-pixel rounding and no upper
    // slack that would let the gap quietly vanish.
    await expect
        .poll(measure, { message: 'the composer should settle 16px above the shell edge' })
        .toBeLessThanOrEqual(17);
    expect(await measure()).toBeGreaterThanOrEqual(15);
});
