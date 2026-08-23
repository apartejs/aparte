/**
 * Accessibility gate — axe-core scans on every app, in the two states users
 * actually meet: the idle chat and a streamed exchange. The gate starts at the
 * two severities that make a UI unusable (`critical` + `serious`); tighten to
 * `moderate`/`minor` once the surface is clean at this level.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

const GATED_IMPACTS = ['critical', 'serious'];

/**
 * Let CSS transitions land before scanning.
 *
 * axe computes contrast from the **composited** colors, so a scan taken mid-fade
 * sees a half-transparent foreground and reports a violation that does not exist
 * once the animation settles. That is what made the idle scan fail intermittently
 * on the welcome block's fade-in (`#878387 on #f7f3ea`, 3.37:1 — a blend, not a
 * declared colour).
 *
 * Infinite animations are skipped on purpose: the typing dots and the spinners
 * never finish, by design.
 */
async function settleTransitions(page: import('@playwright/test').Page) {
    await page.evaluate(() => Promise.all(
        document.getAnimations()
            .filter((a) => {
                const iterations = (a.effect as KeyframeEffect | null)?.getTiming?.().iterations;
                return a.playState === 'running' && iterations !== Infinity;
            })
            .map((a) => a.finished.catch(() => undefined)),
    ));
}

async function gatedViolations(page: import('@playwright/test').Page) {
    await settleTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations
        .filter((v) => v.impact && GATED_IMPACTS.includes(v.impact))
        .map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            // The summary names the exact attribute/child that is missing, which is
            // what makes a failure actionable instead of a puzzle.
            nodes: v.nodes.slice(0, 3).map((n) => ({
                target: n.target.join(' '),
                summary: n.failureSummary?.replace(/\s+/g, ' ').slice(0, 300),
            })),
        }));
}

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

test('idle chat has no critical/serious axe violations', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await expect(chat.editor).toBeVisible();

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('a streamed exchange has no critical/serious axe violations', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('accessibility probe', { expect: MOCK_REPLY_MARK });

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

// Scanning only the idle and settled states misses the ones with the most ARIA
// in them: an open combobox, a turn in flight, a failure, an inline editor.

test('an open model dropdown has no critical/serious axe violations', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();
    if ((await chat.modelTrigger.count()) === 0) test.skip(true, 'no model selector in this example');

    // Expanded, so the scan sees the options and their aria wiring, not just the
    // collapsed provider groups.
    await chat.openModelList();
    await expect(chat.modelDropdown).toBeVisible();

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('a turn in flight has no critical/serious axe violations', async ({ page }) => {
    await page.unrouteAll();
    await installLlmMock(page, { scenario: 'slow', delayMs: 6000 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('accessibility mid-stream');
    await expect(chat.streaming()).toHaveCount(1, { timeout: 15_000 });

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('a failed turn has no critical/serious axe violations', async ({ page }) => {
    await page.unrouteAll();
    await installLlmMock(page, { scenario: 'http-500' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('accessibility on failure');
    await expect(chat.segment('error').first()).toBeVisible({ timeout: 20_000 });

    const violations = await gatedViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('the composer is reachable and sendable by keyboard alone', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    // Tab must land in the editor within a few stops — a keyboard user should not
    // have to hunt through the page to type.
    let focusedEditor = false;
    for (let i = 0; i < 8 && !focusedEditor; i++) {
        await page.keyboard.press('Tab');
        focusedEditor = await page.evaluate(
            () => !!document.activeElement?.closest('aparte-composer-input'),
        );
    }
    expect(focusedEditor, 'the composer editor must be reachable with Tab').toBe(true);

    // And Enter sends from there, with no pointer involved.
    await page.keyboard.type('sent with the keyboard');
    await page.keyboard.press('Enter');
    await expect(chat.bubbles('user').last()).toContainText('sent with the keyboard', { timeout: 20_000 });
});
