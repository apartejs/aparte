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
    // Every sentence the line says, and every line element, recorded as they land. A poll can miss
    // one: each stays half a second, and the poll backs off to a second between its looks. Each
    // update replaces the line's text node, so a replaced node still holds what it said.
    await page.evaluate(() => {
        const said: string[] = [];
        const lines = new Set<Element>();
        (window as unknown as { e2eProgress: { said: string[]; lines: Set<Element> } }).e2eProgress = { said, lines };
        const say = (text: string | null | undefined): void => {
            if (text && said.at(-1) !== text) said.push(text);
        };
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) {
                        const found = node.matches('.search-progress') ? [node] : [...node.querySelectorAll('.search-progress')];
                        for (const line of found) lines.add(line);
                    }
                }
                if (!(record.target instanceof Element) || !record.target.matches('.search-progress')) continue;
                for (const node of record.removedNodes) say(node.textContent);
                for (const node of record.addedNodes) say(node.textContent);
            }
        }).observe(document.body, { subtree: true, childList: true });
    });
    await chat.send(PROMPT);

    const line = chat.lastReply.locator('.search-progress');
    await expect(line).toHaveText('Read 3 of 3 sources');
    await expect(chat.lastReply).toContainText('All three sources agree');
    await expect(chat.lastReply.locator('.aparte-message-streaming')).toHaveCount(0);
    await expect(line).toHaveCount(1);
    // Every report said in turn, by one element patched in place: an update that rebuilt the
    // line would have added a second one.
    const progress = await page.evaluate(() => {
        const { said, lines } = (window as unknown as { e2eProgress: { said: string[]; lines: Set<Element> } }).e2eProgress;
        return { said, lines: lines.size };
    });
    expect(progress.said).toEqual(['Read 0 of 3 sources', 'Read 1 of 3 sources', 'Read 2 of 3 sources', 'Read 3 of 3 sources']);
    expect(progress.lines).toBe(1);

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
    // Every drawing of the steps, recorded as it lands. A poll can miss a step's run: on a loaded
    // runner two updates land in one task, and nothing paints between them. Each update draws
    // the card's inside afresh, and a drawing is never touched again once in: its statuses,
    // read later, are the ones it came with.
    await page.evaluate(() => {
        const drawn: string[][] = [];
        (window as unknown as { e2eStepsDrawn: string[][] }).e2eStepsDrawn = drawn;
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    const steps = [...node.querySelectorAll('.aparte-plan__step[data-status]')];
                    if (node.matches('.aparte-plan__step[data-status]')) steps.unshift(node);
                    if (steps.length) drawn.push(steps.map((step) => step.getAttribute('data-status')!));
                }
            }
        }).observe(document.body, { subtree: true, childList: true });
    });
    await chat.send('Plan the release and tick it off as you go.');

    const card = chat.lastReply.locator('.aparte-plan-card');
    const steps = card.locator('.aparte-plan__step');
    await expect(steps).toHaveCount(3);
    // Mark the card's element (a property: the card keeps its attributes in step with its data):
    // an update that rebuilt it would lose the mark.
    await card.evaluate((el) => { (el as HTMLElement & { e2eFirst?: boolean }).e2eFirst = true; });

    await expect(chat.lastReply).toContainText('Released: version bumped');
    await expect(card.locator('.aparte-plan__count')).toHaveText('3 of 3 done');
    // Each step ran, then was done, in turn: its status in each drawing, repeats dropped.
    const lived = await page.evaluate(() => {
        const drawn = (window as unknown as { e2eStepsDrawn: string[][] }).e2eStepsDrawn;
        return [0, 1, 2].map((i) => drawn.map((statuses) => statuses[i]).filter((s, j, all) => s !== undefined && s !== all[j - 1]));
    });
    expect(lived).toEqual([
        ['in-progress', 'done'],
        ['pending', 'in-progress', 'done'],
        ['pending', 'in-progress', 'done'],
    ]);
    await expect(card).toHaveCount(1);
    expect(await card.evaluate((el) => (el as HTMLElement & { e2eFirst?: boolean }).e2eFirst)).toBe(true);
    expect(errors).toEqual([]);
});
