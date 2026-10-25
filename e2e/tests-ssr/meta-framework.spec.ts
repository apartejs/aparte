/**
 * One page, rendered on a server by each meta-framework, then hydrated and used in a browser.
 *
 * Every fixture under `e2e/ssr/` serves the same page: the chat with an empty state ("Ask me
 * anything…"), the scripted model, and the `get_weather` card declared with the framework's
 * `AparteToolUI` (`aparteToolUI` in Angular). The same four checks run against each.
 */
import { test, expect, type Page } from '@playwright/test';

const EDITOR = 'aparte-composer-input [contenteditable], aparte-composer-input textarea';
const ASSISTANT = 'aparte-chat-bubble[data-role="assistant"]';

async function send(page: Page, text: string): Promise<void> {
    const editor = page.locator(EDITOR).first();
    await editor.click();
    await editor.fill(text);
    await page.keyboard.press('Enter');
}

/**
 * The page the server rendered — checked, since a framework that cannot render falls back to a
 * client render and every check after this would pass on no server render at all (Angular 21
 * does, for a host it was not told about) — then live: the elements defined, the client running.
 */
async function openHydrated(page: Page): Promise<void> {
    const response = await page.goto('/');
    expect(await response!.text(), 'the HTML the server sent has the chat in it').toContain('<aparte-composer');
    await page.waitForFunction(() => !!customElements.get('aparte-composer'));
    await expect(page.locator(EDITOR).first()).toBeVisible();
}

test('the server sends the chat shell', async ({ request, baseURL }) => {
    const html = await (await request.get(baseURL!)).text();
    expect(html).toMatch(/data-aparte-chat|<aparte-chat/);
    expect(html).toContain('<aparte-composer');
    expect(html).toContain('Ask me anything');
});

test('the page hydrates with no hydration warning or error', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
        if ((m.type() === 'error' || m.type() === 'warning') && /hydrat|NG0500|NG05\d\d|mismatch/i.test(m.text())) problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await openHydrated(page);
    // What the server drew is still there once the framework has taken the page over.
    await expect(page.getByText('Ask me anything')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
});

test('a plugin element in the server-rendered toolbar waits for hydration, then draws', async ({ page }, testInfo) => {
    // Next only: React is the framework that throws the server's HTML away when an element
    // draws into its tree before hydration (error 418), which the check above then catches.
    test.skip(testInfo.project.name !== 'next', 'the toolbar plugin is in the Next fixture');
    const response = await page.goto('/');
    const html = await response!.text();
    expect(html, 'the server sent the tag, empty').toMatch(/<aparte-approval-mode><\/aparte-approval-mode>/);
    await expect(page.locator('aparte-approval-mode aparte-select')).toHaveCount(1);
});

test('a send streams a reply', async ({ page }) => {
    await openHydrated(page);
    await send(page, 'Hello there');
    await expect(page.locator(ASSISTANT).last()).toContainText('Hello from a server-rendered page.');
});

test('the get_weather card is drawn by the framework component', async ({ page }) => {
    await openHydrated(page);
    await send(page, 'what is the weather?');
    const card = page.locator(ASSISTANT).last().locator('[data-testid="framework-weather-card"]');
    await expect(card).toContainText('Lille');
    await expect(card).toContainText('Cloudy');
    await expect(page.locator('.aparte-segment-tool-call')).toHaveCount(0);
});
