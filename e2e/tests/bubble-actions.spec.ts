/**
 * The bubble action bar — copy, retry (which forks a branch) and edit.
 *
 * These are the buttons a user reaches for most, and not one of them had any
 * browser coverage: the unit tests assert the events fire, nothing proved the
 * click-to-outcome path works once a real client and a real transport are wired.
 *
 * What is under test is the OPT-IN, not a default: core ships `copy` alone, and
 * these examples call `setBubbleActions({ retry: true, edit: true })` because
 * they run an AparteClient that can honor both. `feedback` and the details (ⓘ)
 * button are never declared, so they must stay absent — even though the mocked
 * reply carries a `usage`, which is what would otherwise summon the ⓘ.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** The sibling label of a freshly forked reply, and of the version before it. */
const AT_SECOND = /2\s*\/\s*2/;
const BOTH_REACHABLE = /1\s*\/\s*2/;

/**
 * Press ‹ until the sibling label leaves `from`.
 *
 * A press on a branch arrow can be SWALLOWED, so one press is not a swap.
 * Measured, not guessed: 2 runs in 10 on `vanilla-webkit`, same signature every
 * time. Instrumenting `click` in the capture phase showed the failing runs
 * dispatching it on `div.aparte-messages-wrapper` and the passing ones on
 * `button.aparte-branch-prev`. That retargeting is what a browser does when
 * mousedown and mouseup have different targets: `_reRenderActivePath()` clears the
 * wrapper and rebuilds every bubble, so the button that received the press is
 * detached before the release and the engine dispatches the click on the surviving
 * common ancestor. The bubble's delegated handler finds no arrow under `closest()`
 * and returns — no `aparte-branch-navigate`, no swap, and nothing retries. Hence a
 * hard failure (43 polls on "2 / 2") rather than a slow one.
 *
 * Pressing again is what a person does. The lost-press window itself is a real
 * finding and is NOT fixed here: the fix is to stop destroying bubbles a re-render
 * did not change.
 *
 * The press keeps its full actionability wait on purpose — capping it broke `react`
 * and `react-webkit` outright, because the arrow is hidden while the forked reply
 * streams and React settles later than the native path. Only the assertion is
 * short, which is what makes the loop iterate.
 */
async function pressUntilSwapped(picker: Locator, from: RegExp): Promise<void> {
    await expect(async () => {
        if (from.test((await picker.textContent()) ?? '')) {
            await picker.locator('.aparte-branch-prev').click();
        }
        await expect(picker).not.toContainText(from, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
}

/**
 * A timestamped record of what the scroll surface did, armed before the swap below.
 *
 * The last assertion of that test went red on CI twice, first attempt only, on
 * `react-webkit` — green on retry, green twenty times locally, and the failure
 * screenshot showed the transcript a little short of the bottom. That is not noise,
 * it is a defect nobody can see from a screenshot: whether the surface really moved
 * (a settle after the rebuild, a resize) or the button's flag went stale while the
 * geometry stayed at the bottom. Each line is a scroll, a resize, a branch event or a
 * change of the button's class, with the surface's `scrollTop` against its maximum
 * at that instant. Attached to the report only when the assertion fails.
 */
async function armScrollLog(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as { __aparteScrollLog?: string[] };
        const log: string[] = (w.__aparteScrollLog = []);
        const t0 = performance.now();
        const surface = document.querySelector('.aparte-viewport-container') ?? document.querySelector('aparte-chat-viewport');
        const geometry = (): string =>
            surface ? `top=${Math.round(surface.scrollTop)} max=${Math.round(surface.scrollHeight - surface.clientHeight)}` : 'no surface';
        const line = (what: string): void => { log.push(`${(performance.now() - t0).toFixed(1)}ms ${what} ${geometry()}`); };
        surface?.addEventListener('scroll', () => line('scroll'));
        // Capture on window: it sees an event dispatched anywhere below, bubbling or not.
        for (const name of ['aparte-branch-navigate', 'aparte-path-changed', 'aparte-reset-done']) {
            window.addEventListener(name, () => line(name), true);
        }
        const button = document.querySelector('.aparte-scroll-btn');
        if (button) {
            new MutationObserver(() => line(`button class="${button.className}"`))
                .observe(button, { attributes: true, attributeFilter: ['class'] });
        }
        if (surface) new ResizeObserver(() => line('resize')).observe(surface);
        line('armed');
    });
}

async function attachScrollLog(page: Page): Promise<void> {
    const log = await page.evaluate(() => {
        const w = window as unknown as { __aparteScrollLog?: string[] };
        const surface = document.querySelector('.aparte-viewport-container') ?? document.querySelector('aparte-chat-viewport');
        const geometry = surface ? `top=${surface.scrollTop} height=${surface.scrollHeight} client=${surface.clientHeight}` : 'no surface';
        return [...(w.__aparteScrollLog ?? []), `at failure: ${geometry}`].join('\n');
    });
    await test.info().attach('scroll-log', { body: log, contentType: 'text/plain' });
}

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('the settled reply offers copy + retry, and the user bubble offers copy + edit', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('action bar probe', { expect: MOCK_REPLY_MARK });

    await expect(chat.action(chat.lastReply, 'copy')).toBeVisible();
    await expect(chat.action(chat.lastReply, 'retry')).toBeVisible();
    // Undeclared actions must NOT be rendered — feedback, and the details button
    // even though this reply carries a usage payload. Nothing here listens for
    // `aparte-message-info`, so an ⓘ would open nothing.
    await expect(chat.action(chat.lastReply, 'feedback-positive')).toHaveCount(0);
    await expect(chat.action(chat.lastReply, 'info')).toHaveCount(0);

    const userBubble = chat.bubbles('user').last();
    await expect(chat.action(userBubble, 'copy')).toBeAttached();
    await expect(chat.action(userBubble, 'edit')).toBeAttached();
    // Retrying is an assistant-side affordance.
    await expect(chat.action(userBubble, 'retry')).toHaveCount(0);
});

test('copy puts the reply on the clipboard and confirms it in the button', async ({ page, context, browserName }) => {
    const chat = new ChatPage(page);
    // Reading the clipboard needs a permission Chromium supports and WebKit doesn't.
    const canReadClipboard = browserName === 'chromium';
    if (canReadClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await chat.sendAndSettle('copy me', { expect: MOCK_REPLY_MARK });

    const copy = chat.action(chat.lastReply, 'copy');
    await copy.click();

    // The button confirms — the feedback every user relies on. Asserted on the state the
    // bubble sets (`data-copied`, and the label that goes with it), not on the shape of
    // the checkmark: this used to look for `svg polyline`, and the glyph being redrawn
    // as a path made the test fail while the confirmation was right there on screen.
    await expect(copy).toHaveAttribute('data-copied', '', { timeout: 5_000 });
    await expect(copy).toHaveAttribute('aria-label', /copied/i);

    if (canReadClipboard) {
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toContain(MOCK_REPLY_MARK);
    }
});

test('retry forks a branch and the ‹1/2› picker navigates between versions', async ({ page }) => {
    /*
     * FIXED, and this assertion is why it stays fixed. It ran on native mode only while
     * framework-managed mode was known broken: navigating back landed on "1 / 1", the
     * picker hid itself, and the other version was unreachable.
     *
     * The mechanism turned out not to be the suspected one. It was not
     * `syncRepoFromMessages` losing the tree — that call only adds and updates, it never
     * deletes. It was `_applyPendingSiblings` in the host: it `continue`d past a bubble
     * that was not on the page yet and then cleared `_pendingSiblings` unconditionally, so
     * a callback running one tick early DISCARDED the branch counts with nothing to retry.
     * React's `afterRender` is `requestAnimationFrame(() => cb())`, a bet that the next
     * paint lands after React's commit — which is a bet this repo has lost before
     * (`25f356b`). Reproduced without a browser in
     * `packages/core/src/host/__tests__/pending-siblings-race.test.ts`, then fixed in the
     * host so all four wrappers get it rather than React's rAF call being special-cased.
     *
     * The assertion history is the other half of the lesson. It used to be
     * `toContainText('1')`, which "1 / 1" satisfies exactly as well as "1 / 2" — so it
     * never distinguished "back to version 1 of 2" from "lost a branch", and the defect sat
     * under a green suite through four cold audits. A substring assertion on a counter is
     * not an assertion.
     */

    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('retry probe', { expect: MOCK_REPLY_MARK });

    const readRetries = await chat.recordEvents<{ messageId: string }>('aparte-retry');
    await chat.action(chat.lastReply, 'retry').click();

    // The client picked the event up (not just a DOM dispatch into the void).
    await expect.poll(async () => (await readRetries()).length, { timeout: 10_000 }).toBeGreaterThan(0);

    // A retry must FORK, not overwrite: the sibling picker appears on the reply…
    const picker = chat.branchPicker(chat.lastReply);
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await expect(picker).toContainText('2');

    // …and the transcript still holds exactly one visible reply (the active branch).
    await expect(chat.bubbles('assistant')).toHaveCount(1);

    // Navigating back shows version 1 — and, natively, BOTH versions stay reachable.
    await pressUntilSwapped(picker, AT_SECOND);
    await expect(picker, 'going back must not discard the other version').toContainText(BOTH_REACHABLE);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('editing a user message re-sends it and reports the new text', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('first wording', { expect: MOCK_REPLY_MARK });

    const readEdits = await chat.recordEvents<{ messageId: string; content: string }>('aparte-edit');
    const userBubble = chat.bubbles('user').last();
    await chat.action(userBubble, 'edit').click();

    // Edit mode swaps in the composer primitive, seeded with the original text.
    const inlineEditor = userBubble.locator('[contenteditable="true"]').first();
    await expect(inlineEditor).toBeVisible({ timeout: 10_000 });
    await expect(inlineEditor).toContainText('first wording');

    await inlineEditor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await inlineEditor.pressSequentially('second wording');
    await userBubble.locator('.aparte-action-btn[data-action="edit-save"]').click();

    // The edit reached the app with the NEW content…
    await expect.poll(async () => (await readEdits()).at(-1)?.content, { timeout: 10_000 })
        .toContain('second wording');
    // …the bubble shows it, and the inline editor is gone.
    await expect(userBubble).toContainText('second wording');
    await expect(inlineEditor).toBeHidden();

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('swapping a branch at the bottom of a scrollable transcript leaves no scroll button', async ({ page }) => {
    // Reported from a consumer: on a conversation long enough to scroll, navigating a
    // branch on the LAST message showed the scroll-to-bottom button even though the
    // user was already at the bottom. Cause: `navigateBranch` deliberately turns
    // auto-scroll off (so the rebuild doesn't yank the view), and in
    // framework-managed mode the post-swap geometry re-derive never ran - no scroll
    // event fires when a swap rebuilds the DOM, so the flag and the button stayed
    // stale. Needs a real browser: the whole thing is scroll geometry.
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to overflow the viewport, so the button is even possible.
    for (let i = 0; i < 6; i++) await chat.sendAndSettle(`filler turn ${i}`, { expect: MOCK_REPLY_MARK });

    const scrollBtn = page.locator('.aparte-scroll-btn').first();
    await expect(scrollBtn, 'settled at the bottom: no button before we start')
        .toHaveClass(/aparte-scroll-btn--hidden/);

    // Fork the last reply, then swap between the two versions.
    await chat.action(chat.lastReply, 'retry').click();
    const picker = chat.branchPicker(chat.lastReply);
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await armScrollLog(page);

    // The swap: press until the label moves. This test's subject is the BUTTON, so
    // it asserts only that a swap happened — which version is on screen belongs to
    // the branch-navigation test above, where React's flattening is recorded.
    await pressUntilSwapped(picker, AT_SECOND);

    // Still at the bottom → still nothing to offer. (The class is re-derived a
    // couple of frames after the swap, hence the retrying assertion.) On failure the
    // scroll log is attached: see `armScrollLog` for what it is looking for.
    try {
        await expect(scrollBtn, 'a branch swap must not invent a scroll-to-bottom button')
            .toHaveClass(/aparte-scroll-btn--hidden/);
    } catch (error) {
        await attachScrollLog(page);
        throw error;
    }

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

