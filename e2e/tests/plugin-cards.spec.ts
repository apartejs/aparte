/**
 * A card of `@aparte/plugin-cards` in each example, in a real browser.
 *
 * Under `?plugin-card=stock` the scripted `get_weather` call is drawn by the stock card, whose
 * range buttons answer through the page's `onChange`. What `onChange` returned must outlive
 * what each framework does to a message once it is on screen: the turn ending, the
 * conversation saved (which redraws every segment core does not see a framework component
 * holding), and the conversation left and opened again. A redraw used to bring the card back
 * to the tool's first answer; the unit suites prove the kit against a bare renderer, this is
 * the whole chain on the chat site, in every framework.
 */

import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const LIST = 'aparte-conversation-list';
const PANEL = '.aparte-elic-panel.aparte-approval-panel';
const APPROVE = '.aparte-approval-option--affirm';
const CARD = '.aparte-stock-card';
const pressed = (range: string) => `${CARD} [data-card-key="range:${range}"][aria-pressed="true"]`;

test('a live card keeps what its onChange gave through a save and a follow-up turn', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario&plugin-card=stock');
    await chat.send('what is the weather?');
    await page.locator(PANEL).locator(APPROVE).click();

    const card = chat.lastReply.locator(CARD);
    await expect(page.locator(pressed('1D'))).toBeVisible();
    await expect(chat.streaming()).toHaveCount(0);

    // From the keyboard: the focus is what a redraw must not lose, and WebKit, like Safari, does
    // not focus a button on a click, so a click would leave nothing to keep.
    await card.locator('[data-card-key="range:1Y"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(pressed('1Y'))).toBeVisible();
    // Answered in place: the same card, the focus on the pressed button.
    await expect(card.locator('[data-card-key="range:1Y"]')).toBeFocused();

    // The next turn saves the conversation, which redraws the messages on screen.
    await chat.send('thanks');
    await expect(chat.streaming()).toHaveCount(0);
    await expect(page.locator(pressed('1Y'))).toHaveCount(1);
    await expect(page.locator(pressed('1D'))).toHaveCount(0);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a live card keeps its range when the conversation is left and opened again', async ({ page }) => {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&plugin-card=stock');
    await chat.send('what is the weather?');
    await page.locator(PANEL).locator(APPROVE).click();
    await expect(chat.lastReply.locator(CARD)).toBeVisible();
    await expect(chat.streaming()).toHaveCount(0);
    await chat.lastReply.locator(`${CARD} [data-card-key="range:1Y"]`).click();
    await expect(page.locator(pressed('1Y'))).toHaveCount(1);

    // Another conversation from the list, then back to this one.
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator(CARD)).toHaveCount(0);
    await page.locator(LIST).getByText('what is the weather?').click();

    await expect(page.locator(pressed('1Y'))).toHaveCount(1);
});
