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

async function gatedViolations(page: import('@playwright/test').Page) {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations
        .filter((v) => v.impact && GATED_IMPACTS.includes(v.impact))
        .map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
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
