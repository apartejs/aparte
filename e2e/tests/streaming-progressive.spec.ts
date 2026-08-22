/**
 * A reply ARRIVING OVER TIME, which nothing in the browser suite had ever seen.
 *
 * `route.fulfill` hands a body over atomically, so every other spec observes a
 * reply that was already complete when it appeared. That left the behaviours which
 * only exist DURING progressive arrival with no coverage at all — in the one suite
 * that drives a real engine:
 *
 *   - the transcript following the stream, and NOT stealing the scroll back once
 *     the user has scrolled up (a cold audit sabotage proved this had no unit test
 *     that bites: gutting `_scrollToBottom()` left all 784 core tests green)
 *   - Stop keeping the text already on screen (three abort defects lived here; the
 *     existing cancel test aborts before the first token, so it cannot see this)
 *
 * `pace` delivers the same bytes as the buffered path, one SSE frame at a time.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/**
 * Scroll geometry of whichever element actually scrolls.
 *
 * The viewport picks its scroller at runtime — `.aparte-viewport-container` when it
 * owns the DOM, or the host element itself in framework-managed mode — so the test
 * asks the DOM which one overflows rather than assuming a class name. Guessing one
 * is how the first version of this test "passed" by measuring a container that
 * never scrolls.
 */
async function geometry(chat: ChatPage) {
    return chat.viewport.evaluate((vp) => {
        const candidates = [vp.querySelector('.aparte-viewport-container'), vp, vp.parentElement]
            .filter((el): el is HTMLElement => el instanceof HTMLElement);
        const scroller = candidates.find(el => el.scrollHeight - el.clientHeight > 4) ?? candidates[0]!;
        return {
            top: scroller.scrollTop,
            height: scroller.scrollHeight,
            client: scroller.clientHeight,
            which: scroller.className || scroller.tagName.toLowerCase(),
        };
    });
}

/**
 * Scroll up the way a person does — with the wheel, over the transcript.
 *
 * The first version assigned `scroller.scrollTop = 0` directly. That is not the
 * interaction being tested: the product decides "the user wants to read back"
 * from the `scroll` event, and a programmatic assignment races the auto-scroll
 * frame differently than real input does. It made the test fail on WebKit while
 * saying "the arriving reply stole the scroll back" — blaming the reply for a
 * gesture that had been undone before it ever took effect.
 *
 * Wheel events also exercise the real path end to end, including the passive
 * scroll listener that arms and disarms auto-follow.
 */
async function scrollUp(page: Page, chat: ChatPage): Promise<void> {
    await chat.viewport.hover();
    // Several notches rather than one big delta: a single huge wheel event can be
    // coalesced, and a person scrolls in strokes anyway.
    for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -400);
    }
}

const distanceFromBottom = (g: { top: number; height: number; client: number }) =>
    g.height - g.client - g.top;

test('the reply text grows over time instead of appearing at once', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { pace: 120 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('paced arrival probe');

    // Three readings, each strictly at least the previous one, and at least one
    // strictly bigger — that is what "arrived over time" means.
    const lengths: number[] = [];
    for (let i = 0; i < 6 && lengths.length < 3; i++) {
        const text = (await chat.lastReply.textContent()) ?? '';
        if (text.length > 0) lengths.push(text.length);
        await page.waitForTimeout(150);
    }

    expect(lengths.length, 'the reply never rendered').toBeGreaterThanOrEqual(2);
    for (let i = 1; i < lengths.length; i++) {
        expect(lengths[i]!, `text shrank between polls: ${lengths.join(' → ')}`).toBeGreaterThanOrEqual(lengths[i - 1]!);
    }
    expect(
        Math.max(...lengths),
        `the whole reply was already there on the first poll: ${lengths.join(' → ')}`,
    ).toBeGreaterThan(Math.min(...lengths));

    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK, { timeout: 15_000 });

    // The request half still ran through the real provider + transport.
    const requests = await mock.pacedRequests();
    expect(requests.length, 'no request reached the shim').toBeGreaterThan(0);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the transcript is anchored at the bottom once a streamed reply lands', async ({ page }, info) => {
    // KNOWN PRODUCT BUG, not a flaky test: in framework mode on WebKit the
    // transcript settles a deterministic 31px short of the bottom and stays there.
    //
    // Measured, three runs, bit-identical: top 603, scrollHeight 1152,
    // clientHeight 518 — so scrollTop was set when scrollHeight was 1121 and the
    // content then grew by 31px with nothing re-anchoring it. Ruled out: load
    // (passes with two apps, fails with seven), settling (retrying for 10s never
    // corrects it), and smooth scrolling (forcing `prefers-reduced-motion: reduce`,
    // i.e. the instant `scrollTop = scrollHeight` path, gives the same 31px).
    //
    // MECHANISM NOT ESTABLISHED. Four explanations were tried and measurement
    // refuted each one. They are recorded so the next attempt does not pay twice:
    //
    //   1. "WebKit counts a scroll container's bottom padding differently, so
    //      `scrollTop = scrollHeight` cannot reach the bottom." Refuted: a probe
    //      writing `scrollTop = 1e7` read back exactly `scrollHeight -
    //      clientHeight` (634 == 634). The scroller CAN reach the bottom — the
    //      product stops early and never looks again.
    //   2. "Framework mode never re-anchors on text growth, because a framework
    //      patches text via characterData while the observer watches childList
    //      only." Adding `characterData: true` made it WORSE (31px → 59px).
    //      Reverted.
    //   3. "Verify and correct on the next frame." Also 59px — and a shortfall that
    //      size exceeds `_scrollThreshold` (50), at which point `_handleScroll`
    //      reads the product's OWN imperfect scroll as the user scrolling away and
    //      disarms auto-follow for the rest of the turn. Reverted.
    //   4. "Mark programmatic scrolls so they are not read as user intent."
    //      Reverted: engines coalesce scroll events, the counter over-counted and
    //      started swallowing real gestures — this suite caught it stealing the
    //      scroll back. A fix must identify the scroll by POSITION, not by counting.
    //
    // What IS established: the scroller can reach the bottom, the product stops
    // short, and its own shortfall can then disarm the very mechanism that would
    // correct it. That last point is the most promising thread.
    //
    // Why this matters beyond the test: framework mode is what every React / Vue /
    // Svelte / Angular consumer runs, and this is Safari. `vanilla-webkit` passes.
    //
    // `test.fail` rather than a skip, and rather than widening the 4px tolerance:
    // the assertion stays honest, and the day the product is fixed this test goes
    // red and tells whoever fixed it to delete these lines.
    if (info.project.name === 'react-webkit') test.fail();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 60 });
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to overflow, so "at the bottom" is a real claim.
    for (const text of ['fill one', 'fill two', 'fill three', 'fill four']) {
        await chat.sendAndSettle(text, { expect: MOCK_REPLY_MARK });
    }

    const overflow = await geometry(chat);
    expect(
        overflow.height - overflow.client,
        `nothing overflowed (measured ${overflow.which}: ${overflow.height} vs ${overflow.client})`
        + ' — this would prove nothing',
    ).toBeGreaterThan(4);

    // RETRY until anchored, rather than measuring once at an arbitrary moment.
    //
    // The first version read the geometry a single time and failed on WebKit under
    // the full seven-app suite — 31px from the bottom against a 4px tolerance —
    // while passing on Chromium and passing on WebKit when only two apps ran. It
    // was never a WebKit semantics difference: it was a slower engine, under load,
    // still settling its scroll when the one and only measurement happened.
    //
    // Which makes the original a duration masquerading as a synchronisation
    // primitive — the exact thing this remediation removed from the unit tests, put
    // back by hand in its own new browser spec. `toPass` keeps the assertion (the
    // transcript MUST end up anchored) and drops the bet on when.
    await expect(async () => {
        const g = await geometry(chat);
        expect(
            distanceFromBottom(g),
            `the transcript did not follow the stream: ${distanceFromBottom(g)}px from the bottom`
            + ` (measured ${g.which} — top ${g.top}, scrollHeight ${g.height}, clientHeight ${g.client})`,
        ).toBeLessThanOrEqual(4);
    }).toPass({ timeout: 10_000 });

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('scrolling up mid-stream is not overridden by the arriving reply', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 90 });
    const chat = new ChatPage(page);
    await page.goto('/');

    for (const text of ['fill one', 'fill two', 'fill three', 'fill four']) {
        await chat.sendAndSettle(text, { expect: MOCK_REPLY_MARK });
    }

    // A new turn, then the user reads back while it streams.
    await chat.send('one more, and I will scroll away');
    await expect(chat.sendButton).toHaveClass(/is-streaming/, { timeout: 10_000 });

    await scrollUp(page, chat);

    // PRECONDITION: the gesture actually moved the scroller.
    //
    // Without this the test lies when it fails. The scroller is picked by
    // a heuristic (first candidate that overflows); if it ever picks one that is
    // not the real scroller, the position never changes and the later assertion
    // reports "the arriving reply stole the scroll back" — blaming the product for
    // a gesture that never happened. That is what the first WebKit failure looked
    // like, and it cost real time to rule out.
    const afterScroll = await geometry(chat);
    expect(
        afterScroll.top,
        `the scroll-up gesture did not take: top is still ${afterScroll.top}px`
        + ` (measured ${afterScroll.which}) — the test cannot say anything about`
        + ' auto-scroll until the user has actually scrolled away',
    ).toBeLessThan(Math.max(60, afterScroll.client / 2));

    // Now prove frames KEPT ARRIVING while the user stayed put, and check the
    // position on every poll instead of once after a fixed 500ms. Under load the
    // old wait could expire before another frame landed, which made the assertion
    // weaker exactly when the machine was busiest.
    const lengthNow = () => chat.viewport.evaluate(vp => (vp.textContent ?? '').length);
    const before = await lengthNow();
    let grew = false;
    for (let i = 0; i < 20 && !grew; i++) {
        await page.waitForTimeout(100);
        const g = await geometry(chat);
        expect(
            g.top,
            `the arriving reply stole the scroll back: top is ${g.top}px, expected to stay near 0`
            + ` (measured ${g.which} — scrollHeight ${g.height}, clientHeight ${g.client})`,
        ).toBeLessThan(Math.max(60, g.client / 2));
        grew = (await lengthNow()) > before;
    }
    expect(grew, 'no further frames arrived, so nothing could have stolen the scroll').toBe(true);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Stop keeps the text that had already arrived', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { pace: 200 });
    const chat = new ChatPage(page);
    await page.goto('/');

    const readErrorEvents = await chat.recordEvents('aparte-message-error');
    await chat.send('stop me halfway');

    // Wait for SOME text, so there is a partial answer to lose.
    await expect.poll(
        async () => ((await chat.lastReply.textContent()) ?? '').length,
        { timeout: 15_000, message: 'no text arrived before the stop' },
    ).toBeGreaterThan(3);
    const partial = ((await chat.lastReply.textContent()) ?? '').trim();

    await chat.sendButton.click();   // the stop button, mid-stream
    await expect(chat.sendButton).not.toHaveClass(/is-streaming/, { timeout: 10_000 });

    // The answer the user was reading is still there, and no failure is claimed.
    await expect(chat.lastReply).toContainText(partial.slice(0, Math.min(12, partial.length)));
    await expect(chat.lastReply.locator('.aparte-message[data-error]')).toHaveCount(0);
    await expect(chat.segment('error')).toHaveCount(0);
    expect(await readErrorEvents()).toEqual([]);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
