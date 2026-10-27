/**
 * Citations, end to end: an OpenAI-compatible stream carrying `url_citation` annotations,
 * read by the real provider, placed by core in the rendered Markdown, in a real engine.
 *
 * What jsdom cannot say: that the chip sits at the end of its paragraph as laid out, that
 * the card is on screen beside it (mounted outside the bubble, which clips what it paints),
 * that the keyboard reaches everything, and that axe is content.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, CITED_FIRST, CITED_SOURCES } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

test('a cited reply draws a chip at the end of each passage, a card, and its sources', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'citations', pace: 40 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('why is the sky blue?');
    const reply = chat.lastReply;
    const chips = reply.locator('.aparte-citation');

    // One chip per passage: the first cites two sources, the second one.
    // The label is drawn by the stylesheet, not written in the text a reader copies.
    await expect(chips).toHaveCount(2);
    expect(await chips.evaluateAll((all) => all.map((chip) => chip.getAttribute('data-label')))).toEqual(['en.wikipedia.org +1', 'britannica.com']);
    // Chromium and WebKit resolve the label in the computed value, Firefox keeps `attr()`: both draw it.
    expect(await chips.first().evaluate((chip) => getComputedStyle(chip, '::before').content)).toMatch(/^("en\.wikipedia\.org \+1"|attr\(data-label\))$/);
    await expect(chips.first()).toHaveText('');
    expect((await chips.first().boundingBox())!.width).toBeGreaterThan(40);
    // At the end of its passage, after its punctuation and outside the bold.
    const before = await chips.first().evaluate((chip) => {
        const range = document.createRange();
        range.setStart(chip.closest('p')!, 0);
        range.setEndBefore(chip);
        return { text: range.toString(), inBold: !!chip.closest('strong') };
    });
    expect(before).toEqual({ text: CITED_FIRST.replace(/\*\*/g, ''), inBold: false });

    // The card: opened by the keyboard, beside its chip and on screen, paged, closed by Escape.
    await chips.first().focus();
    await page.keyboard.press('Enter');
    const card = page.locator('.aparte-citation-card');
    await expect(card).toBeVisible();
    await expect(chips.first()).toHaveAttribute('aria-expanded', 'true');
    const [chipBox, cardBox, view] = await Promise.all([chips.first().boundingBox(), card.boundingBox(), page.viewportSize()]);
    expect(cardBox!.y).toBeGreaterThan(chipBox!.y);
    expect(cardBox!.y - (chipBox!.y + chipBox!.height)).toBeLessThan(40);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(view!.width);
    const link = card.locator('a.aparte-citation-card__title');
    await expect(link).toHaveAttribute('href', CITED_SOURCES[0].url);
    await expect(link).toBeFocused();
    await card.getByRole('button', { name: 'Next source' }).click();
    await expect(card.locator('a.aparte-citation-card__title')).toHaveAttribute('href', CITED_SOURCES[1].url);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(chips.first()).toBeFocused();

    // The list under the reply: closed, every source once, each a link.
    const list = reply.locator('.aparte-sources');
    await expect(list.locator('summary')).toHaveText('3 sources');
    await list.locator('summary').click();
    await expect(list.locator('li a')).toHaveCount(3);

    expect(await gatedViolations(page)).toEqual([]);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
