/**
 * The scroll-to-bottom button's GEOMETRY — the one assertion no other layer can
 * make. jsdom computes no layout, the `check:*` guards read CSS as text, and
 * `bubble-actions.spec.ts` asserts the button's `--hidden` class and clicks it at
 * the centre of its own box — wherever that box is. So the button had been driven
 * hundreds of times and located zero times, which is how it floated the whole
 * `padding + spacer` above the bottom edge in framework-managed mode (sticky is
 * clamped to the parent's CONTENT box; the spacer was carried as padding) without
 * a single red anywhere.
 *
 * Two probes, because the two failure modes lived at different scroll positions:
 * far from the bottom (the padding clamp held it high at every distance) and near
 * it (a button whose FLOW position sits before the spacer detaches from its
 * sticky line and rides up as the reader approaches — the `order: 1` half of the
 * fix). The expected offset is read from the button's own computed `bottom`, so
 * the assertion follows the token and never hard-codes an engine's rounding.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

interface ButtonGeometry {
    /** Distance from the button's bottom edge to the HOST's bottom edge, px. */
    gap: number;
    /** The button's computed `bottom` offset — what the stylesheet asked for. */
    asked: number;
    /** The spacer in force, for the failure message: a big spacer is the regressing input. */
    spacer: number;
    /** How far the reader is from the maximum scroll, for the failure message. */
    fromMax: number;
}

async function measure(page: Page): Promise<ButtonGeometry> {
    return page.evaluate(() => {
        const surface = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        const host = document.querySelector('aparte-chat-viewport') as HTMLElement;
        const btn = document.querySelector('.aparte-scroll-btn') as HTMLElement;
        const hostRect = host.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const fwSpacer = parseFloat(getComputedStyle(host).getPropertyValue('--aparte-fw-spacer')) || 0;
        const coreSpacer = (document.querySelector('.aparte-bottom-spacer') as HTMLElement | null)?.offsetHeight ?? 0;
        return {
            gap: hostRect.bottom - btnRect.bottom,
            asked: parseFloat(getComputedStyle(btn).bottom),
            spacer: Math.max(fwSpacer, coreSpacer),
            fromMax: surface.scrollHeight - surface.clientHeight - surface.scrollTop,
        };
    });
}

test('the visible button floats at its asked offset from the bottom edge — far from the bottom and near it', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough short exchanges to overflow the transcript. Short replies keep the
    // "pin the last user message to the top" spacer LARGE — the regressing input:
    // the broken geometry floated the button by exactly `padding + spacer`.
    for (let i = 0; i < 5; i++) await chat.sendAndSettle(`filler turn ${i}`);

    const scrollBtn = page.locator('.aparte-scroll-btn').first();

    // The transcript must actually scroll, or neither probe means anything.
    await expect.poll(
        () => page.evaluate(() => {
            const s = (document.querySelector('.aparte-viewport-container')
                ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
            return s.scrollHeight - s.clientHeight;
        }),
        { message: 'the transcript never overflowed' },
    ).toBeGreaterThan(200);

    // ── Probe 1: far from the bottom ─────────────────────────────────────────
    await page.evaluate(() => {
        const s = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        s.scrollTop = 0;
    });
    await expect(scrollBtn, 'scrolled to the top, the button must show').not.toHaveClass(/aparte-scroll-btn--hidden/);

    const far = await measure(page);
    expect(
        Math.abs(far.gap - far.asked),
        `far probe: the button sits ${Math.round(far.gap)}px above the bottom edge, its stylesheet asked ${far.asked}px `
        + `(spacer=${Math.round(far.spacer)}px, fromMax=${Math.round(far.fromMax)}px)`,
    ).toBeLessThanOrEqual(3);

    // ── Probe 2: near the bottom, still past the hide threshold ──────────────
    await page.evaluate(() => {
        const s = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        s.scrollTop = s.scrollHeight - s.clientHeight - 80; // 80 > the component's 50px threshold
    });
    await expect(scrollBtn, '80px from the bottom is past the 50px hide threshold — the button must still show')
        .not.toHaveClass(/aparte-scroll-btn--hidden/);

    const near = await measure(page);
    expect(
        Math.abs(near.gap - near.asked),
        `near probe: the button sits ${Math.round(near.gap)}px above the bottom edge, its stylesheet asked ${near.asked}px `
        + `(spacer=${Math.round(near.spacer)}px, fromMax=${Math.round(near.fromMax)}px — a drift here is the flow-position bug)`,
    ).toBeLessThanOrEqual(3);

    expect(errors, 'no runtime errors while probing').toEqual([]);
});
