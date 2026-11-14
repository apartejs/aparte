/**
 * The links a reply holds, on each example (#205): the scripted model writes a same-site link,
 * a link to another site and a link to a place in the page (`apps/examples/_shared/links.ts`).
 *
 * By default the first two open in a new tab that cannot reach back, so the same-site one no
 * longer replaces the page — in a single-page app or an Electron window, the whole app and the
 * conversation with it. Under `?links=route` the app's own handler, each framework's spelling of
 * `aparte-link-click`, keeps the same-site one: it is handed the `href`, and the page neither
 * moves nor opens a tab. Another site still opens its new tab, and `#…` stays in the page.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const PROMPT = 'Where are the setup notes?';
const SAME_SITE = 'docs/setup.md';
const ELSEWHERE = 'https://example.com/reference';

/** The page under `query`, the scripted reply with its three links settled. */
async function reply(page: Page, query: string): Promise<Locator> {
    const chat = new ChatPage(page);
    await page.goto(`/?scenario${query}`);
    await chat.sendAndSettle(PROMPT, { expect: 'the steps are' });
    return chat.lastReply;
}

/** What the app's handler was handed, oldest first. */
const routed = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { __aparteRoutedLinks: string[] }).__aparteRoutedLinks);

/** A mark on the page: a navigation, even to the same address, loses it. */
const stayed = (page: Page): Promise<boolean | undefined> =>
    page.evaluate(() => (window as unknown as { __e2eStayed?: boolean }).__e2eStayed);

test('a link the model wrote opens in a new tab, same-site or not; a link to the page stays', async ({ page }) => {
    const errors = collectPageErrors(page);
    const bubble = await reply(page, '');
    for (const href of [SAME_SITE, ELSEWHERE]) {
        const link = bubble.locator(`a[href="${href}"]`);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    const steps = bubble.locator('a[href="#steps"]');
    await expect(steps).toBeVisible();
    expect(await steps.getAttribute('target')).toBeNull();
    expect(errors).toEqual([]);
});

test("under ?links=route, the app's handler gets a same-site link and the page stays where it is", async ({ page }) => {
    const errors = collectPageErrors(page);
    const bubble = await reply(page, '&links=route');
    const address = page.url();
    await page.evaluate(() => { (window as unknown as { __e2eStayed: boolean }).__e2eStayed = true; });
    let popups = 0;
    page.on('popup', () => { popups++; });

    await bubble.locator(`a[href="${SAME_SITE}"]`).click();
    await expect.poll(() => routed(page)).toEqual([SAME_SITE]);
    expect(page.url()).toBe(address);
    expect(await stayed(page)).toBe(true);

    // A place in the page: the browser goes there, and the app has nothing to route.
    await bubble.locator('a[href="#steps"]').click();
    await expect.poll(() => page.url()).toBe(`${address}#steps`);
    expect(await stayed(page)).toBe(true);
    expect(await routed(page)).toEqual([SAME_SITE]);
    expect(popups).toBe(0);
    expect(errors).toEqual([]);
});

test('under ?links=route, another site still opens in a new tab that cannot reach back', async ({ page, context }) => {
    // The other site, answered here: the run needs no network.
    await context.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Reference</title>' }));
    const errors = collectPageErrors(page);
    const bubble = await reply(page, '&links=route');

    const [popup] = await Promise.all([page.waitForEvent('popup'), bubble.locator(`a[href="${ELSEWHERE}"]`).click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(ELSEWHERE);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(await routed(page)).toEqual([]);
    await popup.close();
    expect(errors).toEqual([]);
});
