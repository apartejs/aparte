/**
 * Framework-boundary smoke suite — runs against react, vue, svelte, angular and
 * vanilla (one Playwright project per app, same assertions). Every M6 bug lived
 * in exactly these behaviours yet passed the jsdom unit tests; this is the net
 * that would have caught them in the browser.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK, MOCK_MODEL_ID, type LlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

let mock: LlmMock;

test.beforeEach(async ({ page }) => {
    mock = await installLlmMock(page);
});

test('mounts without runtime errors, and the idle status reserves no height', async ({ page }) => {
    // Catches the React-19 getter-only throw and the Angular double-`define`
    // crash — both surfaced as an uncaught error that blanked the page.
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);

    await page.goto('/');

    // Universal "the app rendered" markers — present whether the wrapper emits an
    // <aparte-chat> host (vanilla) or mounts the pieces directly (React/Vue/Svelte).
    await expect(chat.editor).toBeVisible();
    await expect(chat.viewport).toBeAttached();

    // The idle typing indicator must not reserve vertical space (an M6 regression
    // where aparte-chat-status stayed laid-out while invisible). Best-effort:
    // asserted wherever a status element is rendered.
    const idleStatus = page.locator('aparte-chat-status:not([visible])');
    if ((await idleStatus.count()) > 0) {
        const height = await idleStatus.first().evaluate((el) => (el as HTMLElement).offsetHeight);
        expect(height, 'idle aparte-chat-status must not reserve height').toBe(0);
    }

    // An EMPTY transcript must not scroll. The bottom spacer moved from host
    // padding into an ::after flex item (the sticky scroll button cannot enter
    // padding), and the pseudo paid the column's `gap` the padding never did:
    // 8px of overflow, a scrollbar beside the welcome state, and every geometry
    // spec green — they all measure with messages in, where the spacer recalc
    // absorbs the difference. Only the empty case shows it, so the empty case
    // is asserted.
    const emptyOverflow = await page.evaluate(() => {
        const host = document.querySelector('aparte-chat-viewport') as HTMLElement;
        const surface = (document.querySelector('.aparte-viewport-container') ?? host) as HTMLElement;
        return surface.scrollHeight - surface.clientHeight;
    });
    expect(emptyOverflow, 'an empty transcript must not overflow its box').toBeLessThanOrEqual(1);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('model selector populates and ungates the composer', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');

    // Options render (empty on the async-race bug where subscribe ran after the
    // provider notify).
    await expect(chat.modelOptions.first()).toBeAttached({ timeout: 20_000 });

    // The require-model gate opens only once a model auto-selects.
    await chat.waitUngated();
});

test('a gated composer blocks send until a model is selected', async ({ page }) => {
    // Empty model list → nothing auto-selects → the require-model gate stays shut.
    // Proves the NEGATIVE path (a no-op gate would leave the composer un-gated and
    // pass the positive test above) and the model-gate CSS fix (dimmed opacity).
    await page.unrouteAll();
    mock = await installLlmMock(page, { emptyModels: true });
    const chat = new ChatPage(page);
    await page.goto('/');

    await expect(chat.gatedComposer).toBeVisible({ timeout: 20_000 });
    // Asserted against the TOKEN, not a literal. This line used to read '0.55' and
    // broke the day the seven disabled states were unified behind one knob — which
    // is a design value moving, not a regression. What the test is actually for is
    // that the gate is dimmed AND that it dims by reading the token, so hardcoding
    // an opacity back into the rule still fails it.
    const dimmed = (await chat.gatedComposer.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--aparte-disabled-opacity'))).trim();
    expect(Number(dimmed)).toBeGreaterThan(0);
    expect(Number(dimmed)).toBeLessThan(1);
    await expect(chat.gatedComposer).toHaveCSS('opacity', dimmed);

    // Typing + Enter must NOT send: core's submit() bails on the gate, so no
    // bubble appears and the input is NOT cleared (a real send clears it).
    await chat.type('should stay blocked');
    await chat.editor.press('Enter');

    await expect(chat.bubbles()).toHaveCount(0);
    await expect(chat.editor).toContainText('should stay blocked');
});

test('a sent message streams a reply, ordered after the user bubble, with the selected model in the request', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('ordering probe', { expect: MOCK_REPLY_MARK });

    await expect(chat.bubbles('user')).toContainText('ordering probe');

    // The user bubble must precede the assistant bubble in the DOM (React once
    // appended the assistant first). No example seeds a chat bubble before the
    // first send, so indices 0/1 are user/assistant.
    const roles = await chat.roles();
    expect(roles[0]).toBe('user');
    expect(roles[1]).toBe('assistant');

    // Markdown ran: the mock's `**aparte e2e mock**` rendered as <strong>.
    await expect(chat.lastReply.locator('strong').first()).toContainText(MOCK_REPLY_MARK);

    // The REAL request half ran end to end: the auto-selected model id and the
    // typed message actually reached the transport (not just the canned reply).
    const request = mock.lastChatRequest();
    expect(request?.model, 'the auto-selected model id must be sent').toBe(MOCK_MODEL_ID);
    expect(JSON.stringify(request?.messages), 'the typed message must be sent').toContain('ordering probe');
});

test('the transcript scrolls once messages overflow', async ({ page }) => {
    // The only test here that drives SEVEN full turns; under WebKit + all six dev
    // servers in parallel it was measured at 41s against a 45s default, and failed
    // intermittently on whichever webkit project happened to be scheduled last.
    // `slow()` triples the budget instead of trimming turns (fewer turns might not
    // overflow the viewport, which is the whole assertion).
    test.slow();

    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to exceed the viewport height.
    for (let i = 0; i < 7; i++) await chat.sendAndSettle(`overflow turn ${i}`, { expect: MOCK_REPLY_MARK });

    // The scroll container differs by mode: framework-managed scrolls the
    // <aparte-chat-viewport> itself; the vanilla shell scrolls the inner
    // .aparte-viewport-container (the viewport is overflow:hidden).
    const metrics = await page.evaluate(() => {
        const el =
            document.querySelector('.aparte-viewport-container') ??
            document.querySelector('aparte-chat-viewport');
        if (!el) return { scrollHeight: 0, clientHeight: 0, overflowY: 'visible' };
        return {
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            overflowY: getComputedStyle(el).overflowY,
        };
    });

    // Genuinely SCROLLABLE (not merely clipped by overflow:hidden)…
    expect(['auto', 'scroll'], 'scroll container must be scrollable, not overflow:hidden')
        .toContain(metrics.overflowY);
    // …AND actually overflowing (the flex-shrink bug made scrollHeight == clientHeight).
    expect(metrics.scrollHeight, 'content should overflow the scroll container')
        .toBeGreaterThan(metrics.clientHeight + 4);
});
