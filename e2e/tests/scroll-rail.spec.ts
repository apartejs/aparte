/**
 * `<aparte-scroll-rail>` on a real transcript, in a real engine.
 *
 * Its unit suite mounts un-upgraded elements in jsdom with stubbed observers, so it
 * proves the rail's logic and nothing of its behaviour — which is how the rail shipped
 * rebuilding itself every frame (its mutation observer watched the host subtree, the
 * rail included, and each rebuild replaced every tick) and clipping past sixteen ticks
 * on the long thread it exists for. Measured on 2026-09-05: 61 rebuilds a second at rest
 * in Chromium, 146 in Firefox, a fresh IntersectionObserver each; focus on a tick gone
 * within a frame; the current mark invisible at the bottom of a 40-turn chat; a jump
 * landing up to 1,213px off its message. None of it visible to a unit test.
 *
 * Driven through the vanilla example, the one that mounts a rail. Every assertion is a
 * count, an attribute the element wrote, or a relation between two boxes — never a
 * pixel constant, since three engines round differently.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

// Enough turns that 24px targets do not fit the rail at this height, so the pitch has
// to tighten — the case the rail used to clip.
const TURNS = 16;

// Short on purpose: sixteen 24px targets do not fit the rail this leaves, so the pitch
// has to tighten — and the assertion below checks which case the engine is in.
test.use({ viewport: { width: 1000, height: 480 } });

interface RailGeometry {
    ticks: number;
    /** The message id of the tick marked current, and whether its box lies in the rail's. */
    current: string | null;
    currentInRail: boolean;
    /** How many tick boxes lie inside the rail's box — all of them, or the rail clips. */
    ticksInRail: number;
    /** Distance between the first two ticks: the pitch, tightened under 24 when they would not fit. */
    pitch: number;
    /** The pitch the element wrote on itself, '' when the stylesheet's default fits. */
    hitSize: string;
    /** The rail's bottom edge sits above the composer: it spans the transcript, not the host. */
    aboveComposer: boolean;
    /** With a classic scrollbar, the rail's end edge stays on the transcript's side of it. */
    clearOfScrollbar: boolean;
    scrollbar: number;
    /** How far the surface is from its maximum scroll: 0 at the bottom. */
    fromMax: number;
    /** The rail's own height, which decides whether 24px targets fit. */
    railHeight: number;
}

async function geometry(page: Page): Promise<RailGeometry> {
    return page.evaluate(() => {
        const rail = document.querySelector('aparte-scroll-rail') as HTMLElement;
        const ticks = Array.from(rail.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick'));
        const surface = document.querySelector('.aparte-viewport-container') as HTMLElement;
        const composer = document.querySelector('aparte-composer') as HTMLElement;
        const rb = rail.getBoundingClientRect();
        const inRail = (el: Element) => { const b = el.getBoundingClientRect(); return b.top >= rb.top - 1 && b.bottom <= rb.bottom + 1; };
        const current = rail.querySelector<HTMLElement>('[aria-current="true"]');
        const sb = surface.getBoundingClientRect();
        const bar = surface.offsetWidth - surface.clientWidth;
        return {
            ticks: ticks.length,
            current: current?.dataset['messageId'] ?? null,
            currentInRail: current ? inRail(current) : false,
            ticksInRail: ticks.filter(inRail).length,
            pitch: ticks.length > 1 ? ticks[1]!.getBoundingClientRect().top - ticks[0]!.getBoundingClientRect().top : 0,
            hitSize: rail.style.getPropertyValue('--aparte-scroll-rail-hit-size'),
            aboveComposer: rb.bottom <= composer.getBoundingClientRect().top + 1,
            clearOfScrollbar: bar === 0 || rb.right <= sb.right - bar + 0.5,
            scrollbar: bar,
            fromMax: surface.scrollHeight - surface.clientHeight - surface.scrollTop,
            railHeight: rb.height,
        };
    });
}

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('one tick per question, all of them in the rail, the current one visible — and the rail holds still', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    for (let i = 1; i <= TURNS; i++) await chat.sendAndSettle(`Question ${i}: what about topic ${i}?`);
    const rail = page.locator('aparte-scroll-rail');
    await expect(rail.locator('.aparte-scroll-rail__tick')).toHaveCount(TURNS);

    // The last question is the current one, and it is on screen: the rail did not clip it.
    // Polled, not read once: the mark comes from intersection observers, which report a
    // frame or two after the last turn landed — a one-shot read raced them on CI.
    const lastUserId = await chat.bubbles('user').last().getAttribute('message-id');
    await expect.poll(async () => (await geometry(page)).current, { message: 'at the end of the thread, the mark is the last question' }).toBe(lastUserId);
    const g = await geometry(page);
    expect(g.currentInRail).toBe(true);
    expect(g.ticksInRail, 'every tick lies in the rail: the pitch tightened rather than the rail clipping').toBe(TURNS);
    if (TURNS * 24 > g.railHeight) {
        expect(g.pitch, `${TURNS} targets of 24px in ${g.railHeight}px: the pitch tightened (hit-size written: '${g.hitSize}')`).toBeLessThan(24);
        expect(g.hitSize).not.toBe('');
    } else {
        expect(g.pitch, `${TURNS} targets of 24px fit ${g.railHeight}px: the stylesheet's pitch`).toBe(24);
        expect(g.hitSize).toBe('');
    }
    expect(g.aboveComposer, 'the rail spans the transcript, not the composer').toBe(true);
    expect(g.clearOfScrollbar, `the rail sits clear of a ${g.scrollbar}px scrollbar`).toBe(true);

    // At rest, the rail is not rebuilt: not one mutation in most of a second.
    const idle = await page.evaluate(async () => {
        const rail = document.querySelector('aparte-scroll-rail')!;
        let n = 0;
        const mo = new MutationObserver((records) => { n += records.length; });
        mo.observe(rail, { childList: true, subtree: true, attributes: true });
        await new Promise((r) => setTimeout(r, 700));
        mo.disconnect();
        return n;
    });
    expect(idle, 'rail mutations at rest').toBe(0);

    // Focus survives on a tick, and the arrows walk them.
    const third = rail.locator('.aparte-scroll-rail__tick').nth(2);
    await third.focus();
    await page.waitForTimeout(300);
    await expect(third).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rail.locator('.aparte-scroll-rail__tick').nth(3)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rail.locator('.aparte-scroll-rail__tick').last()).toBeFocused();

    expect(errors).toEqual([]);
});

test('a click lands the transcript on the message, marks its tick, and keeps the mark', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    for (let i = 1; i <= TURNS; i++) await chat.sendAndSettle(`Question ${i}: what about topic ${i}?`);

    const rail = page.locator('aparte-scroll-rail');
    const fifth = rail.locator('.aparte-scroll-rail__tick').nth(4);
    const targetId = await fifth.getAttribute('data-message-id');
    await fifth.click();

    // The jump is announced first, then the transcript settles on the message — the
    // rail re-aligns if `content-visibility` left it off — and the mark is the clicked tick.
    await expect.poll(async () => page.evaluate((id) => {
        const bubble = document.querySelector(`aparte-chat-bubble[message-id="${id}"]`)!;
        const surface = document.querySelector('.aparte-viewport-container')!;
        return Math.round(bubble.getBoundingClientRect().top - surface.getBoundingClientRect().top);
    }, targetId), { timeout: 6_000 }).toBeLessThanOrEqual(1);
    await expect(fifth).toHaveAttribute('aria-current', 'true');
    // And it stays: the observer's mid-scroll opinions do not move it once settled.
    await page.waitForTimeout(800);
    await expect(fifth).toHaveAttribute('aria-current', 'true');
    expect((await geometry(page)).currentInRail).toBe(true);

    expect(errors).toEqual([]);
});
