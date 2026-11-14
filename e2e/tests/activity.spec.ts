/**
 * An agent's activity, end to end on the vanilla example: the scripted model reports how many
 * sources it has read (`apps/examples/_shared/activity.ts`), the same activity sent again as it
 * reads, and the renderer the site registered for its type draws ONE line, updated in place —
 * the same element from the first report to the last — placed before the reply's text.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const PROMPT = 'Read the sources and show your progress.';

test('an activity is drawn by the renderer of its type and updated in place', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    await chat.send(PROMPT);

    const line = chat.lastReply.locator('.search-progress');
    await expect(line).toHaveText('Read 1 of 3 sources');
    // Mark the element: an update that rebuilt it would lose the mark.
    await line.evaluate((el) => el.setAttribute('data-e2e-first', ''));

    await expect(line).toHaveText('Read 3 of 3 sources');
    await expect(chat.lastReply).toContainText('All three sources agree');
    await expect(chat.lastReply.locator('.aparte-message-streaming')).toHaveCount(0);
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-e2e-first', '');

    // Where it first arrived: before the text the model wrote after it.
    const order = await chat.lastReply.evaluate((bubble) =>
        [...bubble.querySelectorAll('.search-progress, .aparte-segment-text')].map((el) => (el.classList.contains('search-progress') ? 'activity' : 'text')));
    expect(order).toEqual(['activity', 'text']);
    expect(errors).toEqual([]);
});

test('a plan reported as an activity is drawn by the plan card and ticked in place', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    await chat.send('Plan the release and tick it off as you go.');

    const card = chat.lastReply.locator('.aparte-plan-card');
    const steps = card.locator('.aparte-plan__step');
    await expect(steps).toHaveCount(3);
    await expect(steps.first()).toHaveAttribute('data-status', 'in-progress');
    // Mark the card's element (a property: the card keeps its attributes in step with its data):
    // an update that rebuilt it would lose the mark.
    await card.evaluate((el) => { (el as HTMLElement & { e2eFirst?: boolean }).e2eFirst = true; });

    await expect(steps.nth(1)).toHaveAttribute('data-status', 'in-progress');
    await expect(chat.lastReply).toContainText('Released: version bumped');
    await expect(steps.nth(2)).toHaveAttribute('data-status', 'done');
    await expect(card.locator('.aparte-plan__count')).toHaveText('3 of 3 done');
    await expect(card).toHaveCount(1);
    expect(await card.evaluate((el) => (el as HTMLElement & { e2eFirst?: boolean }).e2eFirst)).toBe(true);
    expect(errors).toEqual([]);
});
