/**
 * `<aparte-launcher>` — the chat that floats in a corner of the window.
 *
 * Driven through the vanilla example's `?layout=launcher`, which moves the page's chat
 * into a launcher, with the header it draws and its maximize button. What only a browser
 * shows: the button fixed at the window's bottom inline-end corner, the card opening above
 * it under its header, the focus going into the composer and back, a whole turn answered
 * inside the card, the card enlarged and brought back, and on a phone the open chat filling
 * the window. Geometry is compared with the viewport, never with a pixel constant.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

/** The same phone box `responsive.spec.ts` uses, under the launcher's 30rem breakpoint. */
const PHONE = { width: 390, height: 844 };

async function open(page: Page): Promise<{ errors: string[]; chat: ChatPage }> {
    const errors = collectPageErrors(page);
    await installLlmMock(page);
    await page.goto('/?layout=launcher');
    await expect(page.locator('aparte-launcher .aparte-launcher__button')).toBeVisible();
    return { errors, chat: new ChatPage(page) };
}

const button = (page: Page) => page.locator('aparte-launcher .aparte-launcher__button');
const card = (page: Page) => page.locator('aparte-launcher > aparte-chat');
const header = (page: Page) => page.locator('aparte-launcher > .aparte-launcher__header');

/** The card's opening slide finished: measured during it, the card sits a few pixels low. */
async function settled(page: Page): Promise<void> {
    await card(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

test.describe('the launcher, at desktop width', () => {
    test('floats its button in the bottom inline-end corner, and keeps the chat out of sight', async ({ page }) => {
        const { errors } = await open(page);
        await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(button(page)).toHaveText('Help');
        await expect(card(page)).toBeHidden();
        const box = (await button(page).boundingBox())!;
        const view = page.viewportSize()!;
        // Within a couple of offsets of the corner, wherever the config puts the viewport.
        expect(view.width - (box.x + box.width)).toBeGreaterThan(0);
        expect(view.width - (box.x + box.width)).toBeLessThan(48);
        expect(view.height - (box.y + box.height)).toBeGreaterThan(0);
        expect(view.height - (box.y + box.height)).toBeLessThan(48);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('opens the card above its button, with the focus in the composer, and answers a turn there', async ({ page }) => {
        const { errors, chat } = await open(page);
        await button(page).click();
        await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
        await expect(card(page)).toBeVisible();
        await expect(page.locator('aparte-launcher [role="textbox"]').first()).toBeFocused();

        await settled(page);
        const cardBox = (await card(page).boundingBox())!;
        const buttonBox = (await button(page).boundingBox())!;
        expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(buttonBox.y);
        expect(cardBox.width).toBeLessThan(page.viewportSize()!.width);

        await chat.sendAndSettle('hello from the corner');
        await expect(chat.bubbles('assistant').last()).toBeVisible();
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('heads the card with its header, joined to it, and closes from its ✕ or the button', async ({ page }) => {
        await open(page);
        await button(page).click();
        await settled(page);
        await expect(header(page)).toBeVisible();
        // No heading: the button's label titles it.
        await expect(header(page).locator('.aparte-launcher__title')).toHaveText('Help');
        const headerBox = (await header(page).boundingBox())!;
        const cardBox = (await card(page).boundingBox())!;
        // One card: the same column, the header's lower edge on the chat's upper one.
        expect(Math.abs(headerBox.x - cardBox.x)).toBeLessThan(1);
        expect(Math.abs(headerBox.width - cardBox.width)).toBeLessThan(1);
        expect(Math.abs(headerBox.y + headerBox.height - cardBox.y)).toBeLessThan(1);
        // Open, the button is a close control, as a launcher's is everywhere.
        await expect(button(page)).toHaveAttribute('aria-label', 'Close the chat');
        await header(page).locator('.aparte-launcher__close').click();
        await expect(card(page)).toBeHidden();
        await expect(button(page)).toBeFocused();
    });

    test('gives a taller header its room from the card, and keeps the window its height', async ({ page }) => {
        // A theme that makes the header taller — n8n's, a 2em title over a line that wraps —
        // must not push the window past its height: the card under it gives up the room.
        await open(page);
        await button(page).click();
        await settled(page);
        const measure = async () => {
            const h = (await header(page).boundingBox())!;
            const c = (await card(page).boundingBox())!;
            return { header: h.height, total: c.y + c.height - h.y };
        };
        const before = await measure();
        await page.addStyleTag({ content: 'aparte-launcher > .aparte-launcher__header { padding: 1rem } .aparte-launcher__title { font-size: 2em }' });
        await expect.poll(async () => (await measure()).header).toBeGreaterThan(before.header + 10);
        const after = await measure();
        expect(Math.abs(after.total - before.total)).toBeLessThan(1);
        const cardBottom = (await card(page).boundingBox())!;
        expect(cardBottom.y + cardBottom.height).toBeLessThanOrEqual((await button(page).boundingBox())!.y);
    });

    test('maximizes to the whole window, keeps Tab inside, and brings the card back', async ({ page }) => {
        const { errors } = await open(page);
        await button(page).click();
        await settled(page);
        const before = (await card(page).boundingBox())!;
        const maximize = header(page).locator('.aparte-launcher__maximize');
        await expect(maximize).toHaveAttribute('aria-label', 'Expand the chat');
        // Pressed and read in one task: `getAnimations()` flushes the style, so the animation
        // the attribute starts is there to see whatever the machine's frame rate.
        const growing = await page.evaluate(() => {
            document.querySelector<HTMLElement>('aparte-launcher .aparte-launcher__maximize')!.click();
            const chat = document.querySelector('aparte-launcher > aparte-chat')!;
            return chat.getAnimations().some((a) => a instanceof CSSAnimation && a.animationName === 'aparte-fade-in');
        });
        expect(growing, 'the maximized chat fades in').toBe(true);
        await expect(page.locator('aparte-launcher')).toHaveAttribute('maximized', '');
        await settled(page);
        const view = page.viewportSize()!;
        const headerBox = (await header(page).boundingBox())!;
        const after = (await card(page).boundingBox())!;
        expect(Math.round(headerBox.x)).toBe(0);
        expect(Math.round(headerBox.y)).toBe(0);
        expect(Math.round(headerBox.width)).toBe(view.width);
        expect(Math.round(after.y)).toBe(Math.round(headerBox.y + headerBox.height));
        expect(Math.round(after.y + after.height)).toBe(view.height);
        // The header holds the ✕, so the button goes, and the page behind is out of reach.
        await expect(button(page)).toBeHidden();
        expect(await page.locator('aparte-launcher').evaluate((el) => (el as HTMLElement & { covers: boolean }).covers)).toBe(true);
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
            const inside = await page.evaluate(() => !!document.activeElement?.closest('aparte-launcher'));
            expect(inside, `focus left the maximized chat after ${i + 1} Tab presses`).toBe(true);
        }
        await expect(maximize).toHaveAttribute('aria-label', 'Shrink the chat');
        await maximize.click();
        await expect(page.locator('aparte-launcher')).not.toHaveAttribute('maximized', '');
        await expect(maximize).toBeFocused();
        await settled(page);
        const back = (await card(page).boundingBox())!;
        expect(Math.round(back.width)).toBe(Math.round(before.width));
        expect(Math.round(back.height)).toBe(Math.round(before.height));
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('maximizes to a panel beside the page with maximizable="panel", and leaves the page in reach', async ({ page }) => {
        await open(page);
        await page.locator('aparte-launcher').evaluate((el) => el.setAttribute('maximizable', 'panel'));
        await button(page).click();
        await settled(page);
        await header(page).locator('.aparte-launcher__maximize').click();
        await settled(page);
        const view = page.viewportSize()!;
        const panel = (await page.locator('aparte-launcher').boundingBox())!;
        // Along the inline-end edge, the window's height, narrower than the window.
        expect(Math.round(panel.x + panel.width)).toBe(view.width);
        expect(Math.round(panel.y)).toBe(0);
        expect(Math.round(panel.height)).toBe(view.height);
        expect(panel.width).toBeLessThan(view.width);
        expect(await page.locator('aparte-launcher').evaluate((el) => (el as HTMLElement & { covers: boolean }).covers)).toBe(false);
        // Tab is free: the page beside the panel is still in reach.
        await header(page).locator('.aparte-launcher__close').focus();
        let left = false;
        for (let i = 0; i < 40 && !left; i++) {
            await page.keyboard.press('Tab');
            left = await page.evaluate(() => !document.activeElement?.closest('aparte-launcher'));
        }
        expect(left, 'Tab reaches the page beside the panel').toBe(true);
    });

    test('closes on Escape and on its button, handing the focus back to the button', async ({ page }) => {
        await open(page);
        await button(page).click();
        await expect(card(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(card(page)).toBeHidden();
        await expect(button(page)).toBeFocused();
        await expect(button(page)).toHaveAttribute('aria-expanded', 'false');

        await button(page).click();
        await expect(card(page)).toBeVisible();
        await button(page).click();
        await expect(card(page)).toBeHidden();
    });

    test('keeps the conversation while it is closed', async ({ page }) => {
        const { chat } = await open(page);
        await button(page).click();
        await chat.sendAndSettle('remember me');
        await button(page).click();
        await button(page).click();
        await expect(chat.bubbles('user').filter({ hasText: 'remember me' })).toHaveCount(1);
    });

    test('opens a card added after it connected above its button, as a framework renders it', async ({ page }) => {
        // React appends a conditional child with appendChild, so it lands AFTER the button
        // the launcher added on connect. The card must still open above the button.
        const errors = collectPageErrors(page);
        await page.goto('/');
        await page.evaluate(() => {
            const launcher = document.createElement('aparte-launcher');
            launcher.id = 'late';
            launcher.setAttribute('breakpoint', 'none');
            document.body.append(launcher);
            const card = document.createElement('section');
            card.textContent = 'A card rendered after the launcher connected';
            launcher.append(card);
        });
        const late = page.locator('#late');
        await late.locator('.aparte-launcher__button').click();
        const lateCard = late.locator('section');
        await expect(lateCard).toBeVisible();
        await lateCard.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const cardBox = (await lateCard.boundingBox())!;
        const buttonBox = (await late.locator('.aparte-launcher__button').boundingBox())!;
        expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(buttonBox.y);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('stays closed against a card that sets its own display, inline or by a rule', async ({ page }) => {
        // `style={{ display: 'flex' }}` (the docs' own "Your own card") and an `#id` rule both
        // outweigh the selector that hides a closed chat. It has to hold anyway — and what a
        // reader sees is not the whole of it: the card must also leave the tab order and the
        // accessibility tree, which is what a `display` that wins would have kept.
        const errors = collectPageErrors(page);
        await page.goto('/');
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '#ruled { display: flex }';
            document.head.append(style);
            const launcher = document.createElement('aparte-launcher');
            launcher.id = 'stubborn';
            launcher.setAttribute('breakpoint', 'none');
            launcher.innerHTML = '<section id="inline" style="display: flex"><button type="button">Inline control</button></section>'
                + '<section id="ruled"><button type="button">Ruled control</button></section>';
            document.body.append(launcher);
        });
        const launcher = page.locator('#stubborn');
        await expect(launcher.locator('.aparte-launcher__button')).toBeVisible();
        await expect(launcher.locator('#inline')).toBeHidden();
        await expect(launcher.locator('#ruled')).toBeHidden();
        await expect(page.getByRole('button', { name: /(Inline|Ruled) control/ })).toHaveCount(0);

        // Shift+Tab from the launcher's own button would land on the card's control, were it a tab stop.
        await launcher.locator('.aparte-launcher__button').focus();
        await page.keyboard.press('Shift+Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('aparte-launcher'))).toBe(false);

        await launcher.locator('.aparte-launcher__button').click();
        await expect(launcher.locator('#inline')).toBeVisible();
        await expect(launcher.locator('#ruled')).toBeVisible();
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('leaves Escape to a modal dialog open inside the card, and closes on the next press', async ({ page }) => {
        // A modal dialog closes on Escape unless the keydown was cancelled, and the launcher
        // cancels the one it answers. Pressed inside the dialog, the first Escape is the
        // dialog's; the launcher closes on the one after.
        const errors = collectPageErrors(page);
        await page.goto('/');
        await page.evaluate(() => {
            const launcher = document.createElement('aparte-launcher');
            launcher.id = 'asks';
            launcher.setAttribute('breakpoint', 'none');
            launcher.innerHTML = '<section><button type="button" id="ask" data-aparte-dialog-open="sure">Ask</button>'
                + '<dialog id="sure" class="aparte-dialog"><p>Sure?</p><button type="button" id="no" data-aparte-dialog-close>Cancel</button></dialog></section>';
            document.body.append(launcher);
        });
        const launcher = page.locator('#asks');
        await launcher.locator('.aparte-launcher__button').click();
        await expect(launcher).toHaveAttribute('open', '');
        await launcher.locator('#ask').click();
        await expect(launcher.locator('#sure')).toBeVisible();
        await expect(launcher.locator('#no')).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(launcher.locator('#sure')).toBeHidden();
        await expect(launcher).toHaveAttribute('open', '');
        await expect(launcher.locator('#ask')).toBeFocused();

        await page.keyboard.press('Escape');
        await expect(launcher).not.toHaveAttribute('open', '');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('still closes on Escape from a dialog opened without the modal, which closes on nothing', async ({ page }) => {
        // `show()` gives no top layer and no close request of its own: nothing else would
        // answer the key, so the launcher does.
        await page.goto('/');
        await page.evaluate(() => {
            const launcher = document.createElement('aparte-launcher');
            launcher.id = 'inline-dialog';
            launcher.setAttribute('breakpoint', 'none');
            launcher.innerHTML = '<section><dialog id="note"><button type="button" id="ok">OK</button></dialog></section>';
            document.body.append(launcher);
        });
        const launcher = page.locator('#inline-dialog');
        await launcher.locator('.aparte-launcher__button').click();
        await launcher.locator('#note').evaluate((el) => (el as HTMLDialogElement).show());
        await launcher.locator('#ok').focus();
        await page.keyboard.press('Escape');
        await expect(launcher).not.toHaveAttribute('open', '');
    });

    test('has no serious accessibility violation, closed or open', async ({ page }) => {
        await open(page);
        expect(await gatedViolations(page)).toEqual([]);
        await button(page).click();
        await expect(card(page)).toBeVisible();
        expect(await gatedViolations(page)).toEqual([]);
    });
});

test.describe('the launcher as a panel on a window narrower than the panel', () => {
    // Over the 30rem breakpoint, so a card; under the panel's 36rem, so the panel is the
    // whole window — and then it covers the page, Tab stays inside, and `covers` says so.
    test.use({ viewport: { width: 540, height: 800 } });

    test('covers the window, says so, and keeps Tab inside', async ({ page }) => {
        await open(page);
        await page.locator('aparte-launcher').evaluate((el) => el.setAttribute('maximizable', 'panel'));
        await button(page).click();
        await settled(page);
        await header(page).locator('.aparte-launcher__maximize').click();
        await settled(page);
        const panel = (await page.locator('aparte-launcher').boundingBox())!;
        expect(Math.round(panel.x)).toBe(0);
        expect(await page.locator('aparte-launcher').evaluate((el) => (el as HTMLElement & { covers: boolean }).covers)).toBe(true);
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
            const inside = await page.evaluate(() => !!document.activeElement?.closest('aparte-launcher'));
            expect(inside, `focus left the panel after ${i + 1} Tab presses`).toBe(true);
        }
    });
});

test.describe('the launcher, on a phone', () => {
    test.use({ viewport: PHONE });

    test("fills the window with its header and the chat, and closes from the header's ✕", async ({ page }) => {
        const { errors } = await open(page);
        await expect(page.locator('aparte-launcher')).toHaveAttribute('data-sheet', '');
        await button(page).click();
        await settled(page);
        const headerBox = (await header(page).boundingBox())!;
        const cardBox = (await card(page).boundingBox())!;
        expect(Math.round(headerBox.x)).toBe(0);
        expect(Math.round(headerBox.y)).toBe(0);
        expect(Math.round(headerBox.width)).toBe(PHONE.width);
        expect(Math.round(cardBox.y)).toBe(Math.round(headerBox.y + headerBox.height));
        expect(Math.round(cardBox.y + cardBox.height)).toBe(PHONE.height);
        // The composer keeps the chat's gap under it: the sheet used to erase it, and the
        // composer sat on the window's lower edge.
        const composerBox = (await page.locator('aparte-launcher aparte-composer').first().boundingBox())!;
        expect(PHONE.height - (composerBox.y + composerBox.height)).toBeGreaterThan(4);
        // Its header holds the ✕, so the button goes; and a sheet has nothing left to enlarge.
        await expect(button(page)).toBeHidden();
        await expect(header(page).locator('.aparte-launcher__maximize')).toBeHidden();
        await header(page).locator('.aparte-launcher__close').click();
        await expect(card(page)).toBeHidden();
        await expect(button(page)).toBeFocused();
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('without its header, fills the window and closes from the button in the top corner', async ({ page }) => {
        const { errors } = await open(page);
        await page.locator('aparte-launcher').evaluate((el) => {
            (el as HTMLElement & { header: boolean }).header = false;
        });
        await expect(header(page)).toHaveCount(0);
        await button(page).click();
        await settled(page);
        const cardBox = (await card(page).boundingBox())!;
        expect(Math.round(cardBox.x)).toBe(0);
        expect(Math.round(cardBox.y)).toBe(0);
        expect(Math.round(cardBox.width)).toBe(PHONE.width);
        expect(Math.round(cardBox.height)).toBe(PHONE.height);

        const buttonBox = (await button(page).boundingBox())!;
        expect(buttonBox.y).toBeLessThan(PHONE.height / 4);
        await button(page).click();
        await expect(card(page)).toBeHidden();
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('keeps Tab inside the sheet', async ({ page }) => {
        await open(page);
        await button(page).click();
        await expect(card(page)).toBeVisible();
        for (let i = 0; i < 25; i++) {
            await page.keyboard.press('Tab');
            const inside = await page.evaluate(() => !!document.activeElement?.closest('aparte-launcher'));
            expect(inside, `focus left the sheet after ${i + 1} Tab presses`).toBe(true);
        }
    });
});

// ─── The floating chat with a list of conversations ──────────────────────────────────────
//
// `?layout=launcher-shell` makes the page's whole shell (sidebar, header, chat) the launcher's
// card. A sidebar turns drawer under a WINDOW width and fixes its drawer to the window: in a
// card a few hundred pixels wide it stayed a column, and as a drawer it opened over the page
// the chat floats on. Geometry is compared between boxes, never with a pixel constant.
test.describe('the launcher, with a list of conversations in its card', () => {
    const shell = (page: Page) => page.locator('aparte-launcher > .aparte-app-shell');
    const sidebar = (page: Page) => page.locator('aparte-launcher aparte-sidebar');
    const scrim = (page: Page) => page.locator('aparte-launcher .aparte-sidebar__scrim');
    const rows = (page: Page) => page.locator('aparte-launcher aparte-conversation-list [data-conv-id]');

    type Box = { x: number; y: number; width: number; height: number };
    const within = (inner: Box, outer: Box): boolean =>
        inner.x >= outer.x - 1 && inner.y >= outer.y - 1
        && inner.x + inner.width <= outer.x + outer.width + 1
        && inner.y + inner.height <= outer.y + outer.height + 1;

    async function openCard(page: Page): Promise<string[]> {
        const errors = collectPageErrors(page);
        await installLlmMock(page);
        await page.goto('/?layout=launcher-shell&scenario&fast');
        await button(page).click();
        await expect(shell(page)).toBeVisible();
        await shell(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        return errors;
    }

    /** Open the drawer from the card's header and wait for its slide to end. */
    async function openDrawer(page: Page): Promise<void> {
        await page.locator('aparte-launcher .aparte-app-header [data-aparte-sidebar-toggle]').click();
        await expect(sidebar(page)).not.toHaveAttribute('collapsed', /.*/);
        await sidebar(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    }

    test('the list is a drawer inside the card, and its scrim covers the card and not the page', async ({ page }) => {
        const errors = await openCard(page);
        // A window wide enough for a column anywhere else.
        expect(page.viewportSize()!.width).toBeGreaterThan(768);
        await expect(sidebar(page)).toHaveAttribute('data-drawer', '');
        await expect(sidebar(page)).toHaveAttribute('collapsed', '');

        await openDrawer(page);
        const cardBox = (await shell(page).boundingBox())!;
        expect(within((await sidebar(page).boundingBox())!, cardBox), 'the drawer is inside the card').toBe(true);
        await expect(rows(page).first()).toBeVisible();

        // What the scrim shows of itself is the card: the page beside the card stays in reach.
        const dimmed = await scrim(page).evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const card = el.closest('aparte-launcher')!.querySelector(':scope > .aparte-app-shell')!.getBoundingClientRect();
            const hit = (x: number, y: number) => document.elementFromPoint(x, y);
            return {
                coversTheCard: rect.left <= card.left + 1 && rect.right >= card.right - 1 && rect.top <= card.top + 1 && rect.bottom >= card.bottom - 1,
                // A point of the page well outside the card, on the other side of the window.
                pageBesideIsFree: !hit(8, 8)?.closest('aparte-launcher'),
            };
        });
        expect(dimmed.coversTheCard, 'the scrim covers the card').toBe(true);
        expect(dimmed.pageBesideIsFree, 'the page beside the card is not under the launcher').toBe(true);

        // A click on the part of the scrim that shows closes the drawer.
        const side = (await sidebar(page).boundingBox())!;
        await page.mouse.click(Math.min(cardBox.x + cardBox.width - 8, side.x + side.width + 24), cardBox.y + cardBox.height / 2);
        await expect(sidebar(page)).toHaveAttribute('collapsed', '');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('a row\'s menu still opens at its row', async ({ page }) => {
        const errors = await openCard(page);
        await openDrawer(page);
        const more = rows(page).first().locator('.aparte-conv-item__more');
        await rows(page).first().hover();
        await more.click();
        const menu = page.locator('[role="menu"]');
        await expect(menu).toBeVisible();
        const moreBox = (await more.boundingBox())!;
        const menuBox = (await menu.boundingBox())!;
        // Placed against the window from the button's own box: it must be next to the button,
        // which it is not once an ancestor becomes the containing block of fixed descendants.
        const gapY = Math.max(0, menuBox.y - (moreBox.y + moreBox.height), moreBox.y - (menuBox.y + menuBox.height));
        const gapX = Math.max(0, menuBox.x - (moreBox.x + moreBox.width), moreBox.x - (menuBox.x + menuBox.width));
        expect(gapY, 'the menu touches its button vertically').toBeLessThan(16);
        expect(gapX, 'and horizontally').toBeLessThan(16);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('maximized, the list is a column beside the chat, and a drawer again in the card', async ({ page }) => {
        const errors = await openCard(page);
        await page.locator('aparte-launcher [data-aparte-launcher-maximize]').click();
        await expect(sidebar(page)).not.toHaveAttribute('data-drawer', /.*/);
        await expect(sidebar(page)).not.toHaveAttribute('collapsed', /.*/);
        const side = (await sidebar(page).boundingBox())!;
        const chat = (await page.locator('aparte-launcher aparte-chat').boundingBox())!;
        expect(side.width, 'a column').toBeGreaterThan(100);
        expect(chat.x, 'with the chat beside it').toBeGreaterThanOrEqual(side.x + side.width - 1);

        await page.locator('aparte-launcher [data-aparte-launcher-maximize]').click();
        await expect(sidebar(page)).toHaveAttribute('data-drawer', '');
        await expect(sidebar(page)).toHaveAttribute('collapsed', '');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});
