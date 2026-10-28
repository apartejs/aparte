/**
 * Maths and diagrams, drawn while the reply streams — in a real engine, with real KaTeX
 * and real Mermaid.
 *
 * jsdom has no layout, so the unit suites can say a formula was handed to KaTeX but not
 * that it looks like one: that KaTeX's stylesheet is in (or every formula shows twice,
 * HTML and MathML), that a display formula takes its height, that a diagram's image
 * decodes. And "while it streams" is a claim about time: each test records, as the DOM
 * changes, whether the drawing existed while the turn was still streaming — reading it
 * after the turn ends would prove nothing about during.
 *
 * Each Markdown provider a site can choose recognises maths on its own (`?markdown=`):
 * marked redrawing the reply, marked's streaming entry, streaming-markdown.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { gatedViolations } from '../helpers/axe.js';

/** Watch, from now on, whether `selector` ever matched while a reply was streaming, and whether an error drawing ever showed. */
async function watch(page: Page, selector: string): Promise<() => Promise<{ whileStreaming: boolean; errorShown: boolean }>> {
    await page.evaluate((sel) => {
        const w = window as unknown as { __seen: { whileStreaming: boolean; errorShown: boolean } };
        w.__seen = { whileStreaming: false, errorShown: false };
        const check = (): void => {
            const streaming = document.querySelector('.aparte-message[data-streaming="true"]');
            if (streaming && streaming.querySelector(sel)) w.__seen.whileStreaming = true;
            if (document.querySelector('.katex-error')) w.__seen.errorShown = true;
        };
        new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true });
    }, selector);
    return () => page.evaluate(() => (window as unknown as { __seen: { whileStreaming: boolean; errorShown: boolean } }).__seen);
}

for (const markdown of ['', 'marked-streaming', 'smd']) {
    test(`maths is drawn while the reply streams${markdown ? ` (?markdown=${markdown})` : ''}`, async ({ page }) => {
        const errors = collectPageErrors(page);
        await installLlmMock(page, { scenario: 'math', pace: 60 });
        const chat = new ChatPage(page);
        await page.goto(markdown ? `/?markdown=${markdown}` : '/');
        const seen = await watch(page, '.aparte-code-drawing .katex-display');

        await chat.sendAndSettle('maths please');
        const reply = chat.lastReply;

        expect((await seen()).whileStreaming, 'the display formula was only drawn once the reply had ended').toBe(true);
        expect((await seen()).errorShown, 'a KaTeX error was on screen at some point').toBe(false);

        // Two formulas, an inline and a display one; the prices are text.
        await expect(reply.locator('.aparte-code-drawing .katex')).toHaveCount(2);
        await expect(reply.locator('p', { hasText: '$5 and $10' }).locator('.katex')).toHaveCount(0);

        // KaTeX's stylesheet is in: the MathML copy is visually hidden, and the display
        // formula takes the height of a fraction, not of a line of text.
        for (const mathml of await reply.locator('.katex-mathml').all()) {
            expect((await mathml.boundingBox())?.height ?? 0, 'the MathML copy shows: KaTeX\'s CSS is missing').toBeLessThanOrEqual(1);
        }
        const display = await reply.locator('.katex-display').boundingBox();
        const line = await reply.locator('p').first().evaluate((p) => parseFloat(getComputedStyle(p).lineHeight) || 24);
        expect(display?.height ?? 0).toBeGreaterThan(1.5 * line);

        if (!markdown) expect(await gatedViolations(page)).toEqual([]);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });
}

test('a formula cannot carry a link or a class, nor draw a line thousands of em tall', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'math-hostile' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('hostile maths');
    const reply = chat.lastReply;

    await expect(reply.locator('.katex')).not.toHaveCount(0);
    await expect(reply.locator('a[href^="javascript"]')).toHaveCount(0);
    await expect(reply.locator('.katex .aparte-btn')).toHaveCount(0);
    // The 10000em line shows as its TeX, and the reply keeps a reasonable height.
    await expect(reply.locator('.aparte-code-error', { hasText: 'raisebox{-10000em}' })).toHaveCount(1);
    expect((await reply.boundingBox())?.height ?? 0).toBeLessThan(1000);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a diagram is drawn while the reply streams, named, and redrawn with the theme', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'diagram', pace: 60 });
    const chat = new ChatPage(page);
    await page.goto('/');
    const seen = await watch(page, 'img.aparte-diagram');

    await chat.sendAndSettle('a diagram please');
    const img = chat.lastReply.locator('img.aparte-diagram');

    expect((await seen()).whileStreaming, 'the diagram was only drawn once the reply had ended').toBe(true);
    await expect(img).toHaveAttribute('alt', 'How a reply reaches the screen');
    await expect(img).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // The colours follow the chat's theme: switching it draws the diagram again.
    const before = await img.getAttribute('src');
    await page.evaluate(() => {
        const root = document.documentElement;
        root.setAttribute('data-aparte-theme', root.getAttribute('data-aparte-theme') === 'dark' ? 'light' : 'dark');
    });
    await expect.poll(() => chat.lastReply.locator('img.aparte-diagram').getAttribute('src')).not.toBe(before);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a diagram that does not parse shows a note and its source, once the fence has closed', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'diagram-broken' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('a broken diagram');
    const reply = chat.lastReply;

    await expect(reply.locator('[data-aparte-diagram-error]')).not.toBeEmpty();
    await expect(reply.locator('pre.aparte-code-error')).toContainText('not a node');
    await expect(reply.locator('img.aparte-diagram')).toHaveCount(0);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
