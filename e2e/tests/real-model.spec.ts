/**
 * Un-mocked pipeline smoke — proves the REAL wiring end to end against a live
 * local model (LM Studio / Ollama on their OpenAI-compat `/v1`). No network
 * mock: the selector fetches real models, auto-selects one, and a real reply
 * streams back through provider → DirectTransport → client → bubbles.
 *
 * Opt-in (kept out of the deterministic default run): set E2E_REAL_MODEL=1 with
 * a local server running and CORS enabled, e.g.
 *   E2E_REAL_MODEL=1 E2E_ONLY=react pnpm e2e --project=react
 */

import { test, expect } from '@playwright/test';
import { waitUngated } from '../helpers/actions.js';

const RUN = process.env.E2E_REAL_MODEL === '1';

test.describe('real model (local server)', () => {
    test.skip(!RUN, 'Set E2E_REAL_MODEL=1 with LM Studio/Ollama serving locally (CORS enabled).');

    test('streams a genuine reply from the auto-selected local model', async ({ page }) => {
        test.setTimeout(120_000);

        await page.goto('/');

        // The selector fetched the real model list and auto-selected one → gate opens.
        await waitUngated(page);

        const editor = page.locator('aparte-composer-input [contenteditable="true"]').first();
        await editor.click();
        await editor.pressSequentially('In one short sentence, say hello and name a JavaScript framework.');
        await page.locator('aparte-composer-send button').first().click();

        // A real assistant reply streams in. Content is model-dependent, so we
        // measure GROWTH past the bubble's own name/timestamp chrome (a fixed
        // baseline captured once the bubble mounts) rather than a raw length that
        // could pass on chrome alone. Generous timeout: local models can be slow.
        const assistant = page.locator('aparte-chat-bubble[data-role="assistant"]').last();
        await expect(assistant).toBeVisible({ timeout: 90_000 });
        const baseline = (await assistant.textContent())?.trim().length ?? 0;
        await expect
            .poll(async () => (await assistant.textContent())?.trim().length ?? 0, { timeout: 90_000 })
            .toBeGreaterThan(baseline + 15);
    });
});
