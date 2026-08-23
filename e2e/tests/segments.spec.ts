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
    MOCK_THINKING_LAST_LINE,
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
    await expect(thinking.locator('.thinking-content')).toHaveText(MOCK_THINKING_FULL);
    // A labelled summary is what makes it discoverable.
    await expect(thinking.locator('.thinking-label')).not.toBeEmpty();

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
 * A long reasoning trace has to follow itself down.
 *
 * `.thinking-content` is its own scroll container (`max-height: 300px`), and the
 * renderer's `update()` replaced its text without ever touching `scrollTop` — so a
 * trace longer than one screenful sat frozen on its first lines while the newest
 * reasoning piled up below the fold. Reported from a real session against a local
 * model, which is the only place a trace gets long enough to notice.
 *
 * In the browser rather than only in jsdom because the whole behaviour is layout:
 * jsdom reports every metric as 0, so the unit test has to fake the three of them.
 * Here they are real, and the precondition below is what makes the assertion mean
 * something — the previous version of this project's scroll tests accused the
 * product of losing a position in a box that was never scrollable in the first
 * place.
 */
test('a long reasoning trace scrolls to follow itself', async ({ page }) => {
    const errors = collectPageErrors(page);
    // Paced, so the deltas actually arrive one after another — a buffered body
    // renders once, which is the one case that cannot exhibit the defect.
    await installLlmMock(page, { scenario: 'long-thinking', pace: 8 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('think hard about it', { expect: MOCK_REPLY_MARK });

    // The block ships COLLAPSED — a <details> without `open` — so its content has
    // no layout at all until someone opens it. That is also how the defect was
    // seen: you open the reasoning to read it, and it stops following.
    const thinking = chat.segment('thinking').first();
    await expect(thinking).toBeAttached();
    if (!(await thinking.evaluate((el) => (el as HTMLDetailsElement).open))) {
        await thinking.locator('summary').click();
    }

    const content = thinking.locator('.thinking-content');
    await expect(content).toBeVisible();

    const geometry = () => content.evaluate((el) => ({
        top: el.scrollTop,
        height: el.scrollHeight,
        client: el.clientHeight,
    }));

    // PRECONDITION: the box must actually overflow, or "it is at the bottom" is
    // true for free and this test proves nothing.
    const g = await geometry();
    expect(g.height, 'the trace must be taller than the box').toBeGreaterThan(g.client + 50);

    // THE assertion: the newest reasoning is what the reader sees.
    expect(g.height - g.top - g.client, 'the block must be anchored at the bottom').toBeLessThanOrEqual(24);
    await expect(content).toContainText(MOCK_THINKING_LAST_LINE);

    // And the reasoning is PROSE: it used to render its own Markdown as literal
    // characters in a pre-wrap box. `**bold**` has to be a <strong>, not asterisks.
    // (Highlighting a fence inside reasoning is covered by the unit test, where the
    // provider can be mocked — no example registers a highlight provider.)
    await expect(
        content.locator('strong'),
        'the reasoning must render markdown, not print it',
    ).toHaveText(MOCK_THINKING_BOLD);
    await expect(content).not.toContainText('**');

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

    await code.locator('.code-copy').click();
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
