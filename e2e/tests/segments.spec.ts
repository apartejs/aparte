/**
 * Typed segments, rendered from a real stream.
 *
 * The deterministic suite only ever fed plain markdown, so no segment renderer
 * had browser coverage — including the two that carry interaction: the thinking
 * block (a native `<details>` a user opens) and the code block (with its copy
 * button). Both are streamed here through the wire shapes openai-compat parses.
 */

import { test, expect } from '@playwright/test';
import {
    installLlmMock,
    MOCK_CODE_MARK,
    MOCK_REPLY_MARK,
    MOCK_THINKING_FULL,
    MOCK_THINKING_BOLD,
} from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test('reasoning deltas render a thinking block the user can open and close', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'thinking' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('think about it', { expect: MOCK_REPLY_MARK });

    const thinking = chat.segment('thinking').first();
    await expect(thinking).toBeAttached();
    // EXACT, not `toContainText`: the reasoning arrives in three deltas, and a
    // substring assertion stayed green while every chunk was being written twice.
    await expect(thinking.locator('.aparte-thinking-content')).toHaveText(MOCK_THINKING_FULL);
    // A labelled summary is what makes it discoverable.
    await expect(thinking.locator('.aparte-thinking-label')).not.toBeEmpty();

    // It is a native <details>, so opening/closing needs no JS from the host.
    const isOpen = () => thinking.evaluate((el) => (el as HTMLDetailsElement).open);
    const openBefore = await isOpen();
    await thinking.locator('summary').click();
    expect(await isOpen()).toBe(!openBefore);
    await thinking.locator('summary').click();
    expect(await isOpen()).toBe(openBefore);

    // The visible answer is still rendered alongside the reasoning.
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

/**
 * A long reasoning trace has to follow itself down WHILE IT ARRIVES.
 *
 * `.aparte-thinking-content` is its own scroll container (`max-height: 300px`) and the
 * renderer replaced its text without ever touching `scrollTop`, so an open block
 * stayed frozen on its first lines while the newest reasoning piled up below the
 * fold. Reported from a real session with the block open, watching text arrive.
 *
 * The anchoring is a STREAMING behaviour, and this test earns its name by measuring
 * during the stream. The first version measured after `sendAndSettle` and passed on
 * Chromium by luck: a settled message re-renders its segments through `render()`,
 * which does not anchor — so on WebKit the same assertion found the box back at the
 * top, 461px from the bottom. That reset is not a defect: once the trace is complete,
 * the beginning is where you want to start reading. It only has to follow while it
 * grows.
 *
 * In the browser rather than only in jsdom because the whole behaviour is layout:
 * jsdom reports every metric as 0.
 */
test('a long reasoning trace follows itself while it streams', async ({ page }) => {
    const errors = collectPageErrors(page);
    // Slow enough that "during the stream" is a real window and not a coin toss —
    // 31 frames at 40ms. The pace is the point of the test, so it is generous.
    await installLlmMock(page, { scenario: 'long-thinking', pace: 40 });
    const chat = new ChatPage(page);
    await page.goto('/');

    // NOT sendAndSettle: the reply has to still be arriving.
    await chat.send('think hard about it');

    // The block ships COLLAPSED, and the reported case is a reader who opened it to
    // watch. Its content has no layout at all until then.
    const thinking = chat.segment('thinking').first();
    await expect(thinking).toBeAttached();
    if (!(await thinking.evaluate((el) => (el as HTMLDetailsElement).open))) {
        await thinking.locator('summary').click();
    }
    const content = thinking.locator('.aparte-thinking-content');

    const geometry = () => content.evaluate((el) => ({
        top: el.scrollTop,
        height: el.scrollHeight,
        client: el.clientHeight,
    }));

    // PRECONDITION then ASSERTION, polled together: the box must actually overflow —
    // otherwise "it is at the bottom" is true for free — and while it does, the
    // newest reasoning must be the part in view.
    await expect(async () => {
        const g = await geometry();
        expect(g.height, 'the trace must be taller than the box').toBeGreaterThan(g.client + 50);
        expect(g.height - g.top - g.client, 'the block must follow the stream down').toBeLessThanOrEqual(24);
    }).toPass({ timeout: 5000 });

    // And the reasoning is PROSE: it used to render its own Markdown as literal
    // characters in a pre-wrap box. `**bold**` has to be a <strong>, not asterisks.
    // (Highlighting a fence inside reasoning is covered by the unit test, where the
    // provider can be mocked — no example registers a highlight provider.)
    await expect(
        content.locator('strong'),
        'the reasoning must render markdown, not print it',
    ).toHaveText(MOCK_THINKING_BOLD);
    await expect(content).not.toContainText('**');

    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);
    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a fenced block renders as a code segment whose copy button yields the source', async ({ page, context, browserName }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'code' });
    const chat = new ChatPage(page);
    const canReadClipboard = browserName === 'chromium';
    if (canReadClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await chat.sendAndSettle('show me code', { expect: 'That is all' });

    const code = chat.segment('code').first();
    await expect(code).toBeAttached();
    await expect(code).toContainText(MOCK_CODE_MARK);

    await code.locator('.aparte-code-copy').click();
    if (canReadClipboard) {
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        // The SOURCE, not the highlighted markup.
        expect(clipboard).toContain(`export const ${MOCK_CODE_MARK} = 42;`);
        expect(clipboard).not.toContain('<span');
    }

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a long code block scrolls inside itself instead of widening the page', async ({ page }) => {
    await installLlmMock(page, { scenario: 'code' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('show me code', { expect: 'That is all' });

    // Nothing may make the document scroll sideways — the classic overflow leak.
    const bodyOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(bodyOverflows, 'the page must not scroll horizontally').toBe(false);
});
