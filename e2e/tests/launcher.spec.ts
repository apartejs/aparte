/**
 * `<aparte-launcher>` — the chat that floats in a corner of the window.
 *
 * Driven through the vanilla example's `?layout=launcher`, which moves the page's chat
 * into a launcher. What only a browser shows: the button fixed at the window's bottom
 * inline-end corner, the card opening above it, the focus going into the composer and
 * back, a whole turn answered inside the card, and on a phone the open chat filling the
 * window. Geometry is compared with the viewport, never with a pixel constant.
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

    test('has no serious accessibility violation, closed or open', async ({ page }) => {
        await open(page);
        expect(await gatedViolations(page)).toEqual([]);
        await button(page).click();
        await expect(card(page)).toBeVisible();
        expect(await gatedViolations(page)).toEqual([]);
    });
});

test.describe('the launcher, on a phone', () => {
    test.use({ viewport: PHONE });

    test('fills the window with the open chat, and closes from the button in the top corner', async ({ page }) => {
        const { errors } = await open(page);
        await expect(page.locator('aparte-launcher')).toHaveAttribute('data-sheet', '');
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
