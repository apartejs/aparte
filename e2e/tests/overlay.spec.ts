/**
 * `overlay-composer` — the geometry only a browser can prove.
 *
 * Four claims, each a thing the jsdom wiring test cannot see: the scroll surface
 * spans the shell (the scrollbar runs edge to edge instead of stopping at the
 * composer), the pinned transcript clears the floating stack, the scroll button
 * floats above the composer rather than behind it, and — the one every
 * hand-rolled overlay gets wrong — a composer that GROWS under a pinned reader
 * does not detach them: the inset is re-measured and the reader re-anchored in
 * the same observer pass, so the next frame cannot yank the view.
 *
 * Runs in the DEEP suites: vanilla (`?layout=page`, core mode — container
 * scrolls, absolute button) and react (`?view=overlay`, framework-managed —
 * host scrolls, sticky button), on Chromium and WebKit.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { waitForStill } from '../helpers/settle.js';

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

/** The overlay variant's URL for the app under test. */
function overlayUrl(projectName: string): string {
    return projectName.startsWith('vanilla') ? '/?layout=page' : '/?view=overlay';
}

interface OverlayGeometry {
    shell: { top: number; bottom: number };
    surface: { top: number; bottom: number };
    composerTop: number;
    lastBubbleBottom: number;
    fromMax: number;
    inset: number;
}

async function measure(page: Page): Promise<OverlayGeometry> {
    return page.evaluate(() => {
        const shell = document.querySelector('[overlay-composer]') as HTMLElement;
        const surface = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        const host = document.querySelector('aparte-chat-viewport') as HTMLElement;
        const composer = shell.querySelector('aparte-composer') as HTMLElement;
        const bubbles = document.querySelectorAll('aparte-chat-bubble');
        const last = bubbles[bubbles.length - 1] as HTMLElement | undefined;
        const r = (el: HTMLElement) => el.getBoundingClientRect();
        return {
            shell: { top: r(shell).top, bottom: r(shell).bottom },
            surface: { top: r(surface).top, bottom: r(surface).bottom },
            composerTop: r(composer).top,
            lastBubbleBottom: last ? r(last).bottom : Number.NaN,
            fromMax: surface.scrollHeight - surface.clientHeight - surface.scrollTop,
            inset: parseFloat(getComputedStyle(host).getPropertyValue('--aparte-bottom-inset')) || 0,
        };
    });
}

test('the scroll surface spans the shell, content clears the floating composer, and a growing composer keeps the reader pinned', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto(overlayUrl(testInfo.project.name));

    // Enough short exchanges to overflow, so "pinned at the bottom" means something.
    for (let i = 0; i < 5; i++) await chat.sendAndSettle(`filler turn ${i}`);

    // Establish the pinned state the next two claims are ABOUT. Read-then-write
    // per pass (`settleAtTheBottom`'s shape): core's settle keeps adjusting a few
    // px after a send lands, and WebKit surfaced it as the last bubble measured
    // 9px under the composer — a reading taken mid-settle, not a clearance bug.
    const settleToBottom = () => expect.poll(
        () => page.evaluate(() => {
            const s = (document.querySelector('.aparte-viewport-container')
                ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
            const gap = s.scrollHeight - s.clientHeight - s.scrollTop;
            s.scrollTop = s.scrollHeight;
            return gap;
        }),
        { message: 'settle pinned at the bottom' },
    ).toBeLessThanOrEqual(1);
    await settleToBottom();

    // ── 1. The whole point: the scroll surface spans the shell's full height ──
    const settled = await measure(page);
    expect(Math.abs(settled.surface.top - settled.shell.top),
        'the scroll surface starts at the shell\'s top edge').toBeLessThanOrEqual(1);
    expect(Math.abs(settled.surface.bottom - settled.shell.bottom),
        'the scroll surface reaches the shell\'s bottom edge — the scrollbar runs past the composer').toBeLessThanOrEqual(1);
    expect(settled.composerTop, 'the composer floats INSIDE the surface\'s box').toBeLessThan(settled.surface.bottom);

    // ── 2. Pinned, the transcript clears the stack ────────────────────────────
    expect(settled.inset, 'the viewport measured a real inset').toBeGreaterThan(20);
    expect(settled.lastBubbleBottom,
        `pinned at the bottom, the last bubble (${Math.round(settled.lastBubbleBottom)}) stays above the composer (${Math.round(settled.composerTop)})`)
        .toBeLessThanOrEqual(settled.composerTop + 1);

    // ── 3. The scroll button floats above the composer, not behind it ─────────
    await page.evaluate(() => {
        const s = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        s.scrollTop = 0;
    });
    const scrollBtn = page.locator('.aparte-scroll-btn').first();
    await expect(scrollBtn, 'scrolled up, the button shows').not.toHaveClass(/aparte-scroll-btn--hidden/);
    const btnGap = await page.evaluate(() => {
        const composer = (document.querySelector('[overlay-composer]') as HTMLElement).querySelector('aparte-composer') as HTMLElement;
        const btn = document.querySelector('.aparte-scroll-btn') as HTMLElement;
        return composer.getBoundingClientRect().top - btn.getBoundingClientRect().bottom;
    });
    expect(btnGap, 'the button\'s bottom edge sits above the composer\'s top').toBeGreaterThanOrEqual(0);

    // Back to the bottom for the growth probe.
    await settleToBottom();

    // ── 4. The composer grows under a pinned reader: no detach, no yank ───────
    // Enough lines that a detach is unmistakable: the inset grows well past the
    // 50px "at the bottom" threshold, so a reader left where they stood would
    // measure fromMax ≈ that growth — far outside it.
    const before = await measure(page);
    await chat.editor.click();
    await page.keyboard.type('one');
    for (let i = 0; i < 7; i++) {
        await page.keyboard.press('Shift+Enter');
        await page.keyboard.type(`line ${i}`);
    }
    await expect.poll(async () => (await measure(page)).inset, { message: 'the draft grew the composer, so the measured inset must grow' })
        .toBeGreaterThan(before.inset + 60);

    const grown = await measure(page);
    expect(grown.fromMax, "the reader is STILL pinned by core's own definition (the 50px threshold) — re-anchored in the same pass, not left the whole inset short")
        .toBeLessThan(50);
    expect(grown.lastBubbleBottom,
        `and the last bubble (${Math.round(grown.lastBubbleBottom)}) still clears the taller composer (${Math.round(grown.composerTop)})`)
        .toBeLessThanOrEqual(grown.composerTop + 1);

    expect(errors, 'no runtime errors across the probes').toEqual([]);
});

/*
 * The top's counterpart. A header laid over an overlay transcript had no knob: the first message
 * started under it, and a jump to a message landed under it. `--aparte-top-inset`, set on the
 * shell by hand, is what both read — padding (core mode) or a spacer (framework mode), plus the
 * surface's scroll padding.
 */
test('a header over the transcript: the first message starts below it, and a jump lands below it', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto(overlayUrl(testInfo.project.name));
    for (let i = 0; i < 4; i++) await chat.sendAndSettle(`turn ${i}`);
    const INSET = 60;
    // Each move waits for the view to stop: the inset re-pins a reader at the bottom, and a
    // `scrollTop = 0` written while that re-pin is still landing measured the re-pin (the
    // first message 427px above the edge, under load) instead of the top of the transcript.
    const move = async (how: 'inset' | 'top' | 'bottom' | 'jump') => {
        await page.evaluate(([step, inset]) => {
            const surface = (document.querySelector('[overlay-composer] .aparte-viewport-container')
                ?? document.querySelector('[overlay-composer] aparte-chat-viewport')) as HTMLElement;
            if (step === 'inset') (document.querySelector('[overlay-composer]') as HTMLElement).style.setProperty('--aparte-top-inset', `${inset}px`);
            if (step === 'top') surface.scrollTop = 0;
            if (step === 'bottom') surface.scrollTop = surface.scrollHeight;
            if (step === 'jump') (surface.querySelectorAll('aparte-chat-bubble')[2] as HTMLElement).scrollIntoView({ block: 'start' });
        }, [how, INSET] as const);
        await waitForStill(page);
    };
    const offsetOf = (index: number) => page.evaluate((i) => {
        const surface = (document.querySelector('[overlay-composer] .aparte-viewport-container')
            ?? document.querySelector('[overlay-composer] aparte-chat-viewport')) as HTMLElement;
        return surface.querySelectorAll('aparte-chat-bubble')[i]!.getBoundingClientRect().top - surface.getBoundingClientRect().top;
    }, index);
    await move('inset');
    await move('top');
    const first = await offsetOf(0);
    await move('bottom');
    await move('jump');
    const offsets = { first, jump: await offsetOf(2) };
    expect(offsets.first, 'the first message starts below the header').toBeGreaterThanOrEqual(INSET);
    expect(Math.abs(offsets.jump - INSET), `a jump lands at the header's edge (${offsets.jump}px)`).toBeLessThanOrEqual(2);

    // The commonest landing of all: a send pins the question to the top of the view, which
    // is below the header too.
    await chat.sendAndSettle('one more short question');
    // Read once the surface has stopped moving: a glide passes the header's edge on its way
    // to wherever it lands, so a poll would accept the transit.
    await waitForStill(page, { frames: 10 });
    const pinned = await page.evaluate(() => {
        const surface = (document.querySelector('[overlay-composer] .aparte-viewport-container')
            ?? document.querySelector('[overlay-composer] aparte-chat-viewport')) as HTMLElement;
        const users = surface.querySelectorAll('aparte-chat-bubble[data-role="user"]');
        return Math.round(users[users.length - 1]!.getBoundingClientRect().top - surface.getBoundingClientRect().top);
    });
    expect(Math.abs(pinned - INSET), `a sent question is pinned at the header's edge (${pinned}px)`).toBeLessThanOrEqual(3);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

/*
 * The compact class under a framework. It declared the transcript's two-value padding on the chat
 * root, and the framework-managed viewport adds that variable into its bottom spacer's `calc()`:
 * two values made it invalid, and the spacer — the overlay clearance with it — collapsed.
 */
test('aparte-chat--compact keeps the bottom spacer', async ({ page }, testInfo) => {
    await page.goto(overlayUrl(testInfo.project.name));
    const chat = new ChatPage(page);
    await chat.sendAndSettle('one turn');
    const basis = () => page.evaluate(() => {
        const vp = document.querySelector('[overlay-composer] aparte-chat-viewport') as HTMLElement;
        const framework = vp.hasAttribute('framework-managed') || vp.classList.contains('aparte-viewport--framework');
        return framework ? getComputedStyle(vp, '::after').flexBasis : 'n/a (core mode: no spacer)';
    });
    const before = await basis();
    await page.evaluate(() => (document.querySelector('[overlay-composer]') as HTMLElement).classList.add('aparte-chat--compact'));
    const after = await basis();
    expect(after, `the spacer's basis was ${before}`).toEqual(before === 'n/a (core mode: no spacer)' ? before : expect.stringMatching(/px$/));
});
