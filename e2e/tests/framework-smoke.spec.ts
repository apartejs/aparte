/**
 * Framework-boundary smoke suite — runs against react, vue, svelte, angular and
 * vanilla (one Playwright project per app, same assertions). Every M6 bug lived
 * in exactly these behaviours yet passed the jsdom unit tests; this is the net
 * that would have caught them in the browser.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK, MOCK_MODEL_ID, type LlmMock } from '../helpers/mock-llm.js';
import { sendMessage, bubbleRoles, collectPageErrors } from '../helpers/actions.js';

let mock: LlmMock;

test.beforeEach(async ({ page }) => {
    mock = await installLlmMock(page);
});

test('mounts without runtime errors, and the idle status reserves no height', async ({ page }) => {
    // Catches the React-19 getter-only throw and the Angular double-`define`
    // crash — both surfaced as an uncaught error that blanked the page.
    const errors = collectPageErrors(page);

    await page.goto('/');

    // Universal "the app rendered" markers — present whether the wrapper emits an
    // <aparte-chat> host (vanilla) or mounts the pieces directly (React/Vue/Svelte).
    await expect(page.locator('aparte-composer-input')).toBeVisible();
    await expect(page.locator('aparte-chat-viewport')).toBeAttached();

    // The idle typing indicator must not reserve vertical space (an M6 regression
    // where aparte-chat-status stayed laid-out while invisible). Best-effort:
    // asserted wherever a status element is rendered.
    const idleStatus = page.locator('aparte-chat-status:not([visible])');
    if ((await idleStatus.count()) > 0) {
        const height = await idleStatus.first().evaluate((el) => (el as HTMLElement).offsetHeight);
        expect(height, 'idle aparte-chat-status must not reserve height').toBe(0);
    }

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('model selector populates and ungates the composer', async ({ page }) => {
    await page.goto('/');

    // Options render (empty on the async-race bug where subscribe ran after the
    // provider notify).
    await expect(page.locator('aparte-model-selector aparte-option').first()).toBeAttached({ timeout: 20_000 });

    // The require-model gate opens only once a model auto-selects.
    await expect(page.locator('aparte-composer:not([data-model-gated])').first()).toBeAttached({ timeout: 20_000 });
});

test('a gated composer blocks send until a model is selected', async ({ page }) => {
    // Empty model list → nothing auto-selects → the require-model gate stays shut.
    // Proves the NEGATIVE path (a no-op gate would leave the composer un-gated and
    // pass the positive test above) and the model-gate CSS fix (dimmed opacity).
    await page.unrouteAll();
    mock = await installLlmMock(page, { emptyModels: true });
    await page.goto('/');

    const gated = page.locator('aparte-composer[data-model-gated]').first();
    await expect(gated).toBeVisible({ timeout: 20_000 });
    await expect(gated).toHaveCSS('opacity', '0.55');

    // Typing + Enter must NOT send: core's submit() bails on the gate, so no
    // bubble appears and the input is NOT cleared (a real send clears it).
    const editor = page.locator('aparte-composer-input [contenteditable="true"]').first();
    await editor.click();
    await editor.pressSequentially('should stay blocked');
    await editor.press('Enter');

    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(editor).toContainText('should stay blocked');
});

test('a sent message streams a reply, ordered after the user bubble, with the selected model in the request', async ({ page }) => {
    await page.goto('/');
    await sendMessage(page, 'ordering probe');

    await expect(page.locator('aparte-chat-bubble[data-role="user"]')).toContainText('ordering probe');

    // The user bubble must precede the assistant bubble in the DOM (React once
    // appended the assistant first). No playground seeds a chat bubble before the
    // first send, so indices 0/1 are user/assistant.
    const roles = await bubbleRoles(page);
    expect(roles[0]).toBe('user');
    expect(roles[1]).toBe('assistant');

    // Markdown ran: the mock's `**aparte e2e mock**` rendered as <strong>.
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"] strong').first())
        .toContainText(MOCK_REPLY_MARK);

    // The REAL request half ran end to end: the auto-selected model id and the
    // typed message actually reached the transport (not just the canned reply).
    const request = mock.lastChatRequest();
    expect(request?.model, 'the auto-selected model id must be sent').toBe(MOCK_MODEL_ID);
    expect(JSON.stringify(request?.messages), 'the typed message must be sent').toContain('ordering probe');
});

test('the transcript scrolls once messages overflow', async ({ page }) => {
    await page.goto('/');

    // Enough turns to exceed the viewport height.
    for (let i = 0; i < 7; i++) await sendMessage(page, `overflow turn ${i}`);

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
