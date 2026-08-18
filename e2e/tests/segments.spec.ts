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
    MOCK_THINKING_MARK,
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
    await expect(thinking.locator('.thinking-content')).toContainText(MOCK_THINKING_MARK);
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
