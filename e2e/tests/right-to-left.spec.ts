/**
 * The chat under `dir="rtl"`, measured in a browser.
 *
 * The logical-properties unit test reads the stylesheets; jsdom resolves neither `dir` nor
 * layout, so what a person sees in a right-to-left page was never checked. The first real
 * pass (2026-11-01) found four things wrong, each pinned here: code laid out from the right
 * (a JSON tool input's `{` at the end of its line), a formula drawn mirrored, the version
 * arrows pointing the wrong way, and an English reply in an Arabic page with its full stop
 * at the start of the line. An Arabic message stays right-to-left throughout.
 */
import { test, expect, type Page } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK, MOCK_CODE_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const ARABIC = 'مرحبا، أريد مساعدة في طلبي';

/** The page right-to-left from its first node, as a host app sets `<html dir="rtl">`. */
async function rightToLeft(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const set = () => document.documentElement?.setAttribute('dir', 'rtl');
        set();
        new MutationObserver(set).observe(document, { childList: true });
    });
}

/**
 * Which edge of its box a node's text sits against: `left` or `right`. Measured on its first
 * text node — a range over a block element is the whole line box in WebKit.
 */
const textSide = (page: Page, selector: string) => page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const box = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const text = walker.nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const first = range.getClientRects()[0]!;
    return first.left - box.left < box.right - first.right ? 'left' : 'right';
}, selector);

test('an Arabic message reads right to left, an English reply left to right, in a right-to-left page', async ({ page }) => {
    const errors = collectPageErrors(page);
    await rightToLeft(page);
    await installLlmMock(page, { scenario: 'text' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle(ARABIC, { expect: MOCK_REPLY_MARK });

    const dirOf = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => getComputedStyle(el).direction);
    await expect.poll(() => dirOf(chat.lastReply.locator('.aparte-segment-content').first())).toBe('ltr');
    const userText = page.locator('aparte-chat-bubble[data-role="user"] :is(.aparte-segment-content, .aparte-content)').filter({ hasText: ARABIC }).first();
    expect(await dirOf(userText)).toBe('rtl');
    expect(errors).toEqual([]);
});

test('code reads left to right in a right-to-left page', async ({ page }) => {
    await rightToLeft(page);
    await installLlmMock(page, { scenario: 'code' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle(ARABIC, { expect: 'That is all' });

    const code = chat.segment('code').first().locator('code').first();
    await expect(code).toContainText(MOCK_CODE_MARK);
    expect(await code.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    expect(await textSide(page, 'aparte-chat-bubble .aparte-segment-code code')).toBe('left');
});

test('an Arabic reply opening with a formula and code stays right to left, its formula and code left to right', async ({ page }) => {
    await rightToLeft(page);
    await installLlmMock(page, { scenario: 'rtl-mixed' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle(ARABIC, { expect: 'هذا كل شيء' });

    const dirOf = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => getComputedStyle(el).direction);
    // The message: its first letters are a formula's (and its hidden source), then `npm` —
    // none of which may decide the direction of an Arabic reply.
    await expect.poll(() => dirOf(chat.lastReply.locator('.aparte-segment-content').first())).toBe('rtl');
    const display = chat.lastReply.locator('.aparte-code-drawing[data-aparte-display]').first();
    await expect(display).toBeVisible({ timeout: 15_000 });
    expect(await dirOf(display)).toBe('ltr');
    expect(await dirOf(chat.lastReply.locator('code', { hasText: 'npm install' }).first())).toBe('ltr');
});

test('the version arrows point to the start and the end of a right-to-left row', async ({ page }) => {
    await rightToLeft(page);
    await installLlmMock(page, { scenario: 'text' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle(ARABIC, { expect: MOCK_REPLY_MARK });
    await chat.lastReply.hover();
    await chat.action(chat.lastReply, 'retry').click();
    const prev = chat.lastReply.locator('.aparte-branch-prev');
    await expect(prev).toBeVisible({ timeout: 15_000 });

    // "Previous" sits at the start of the row (the right, by the row's own mirroring); its
    // arrow is turned to point there, and so is "next"'s.
    expect(await prev.locator('> *').first().evaluate((el) => getComputedStyle(el).scale)).toBe('-1 1');
    expect(await chat.lastReply.locator('.aparte-branch-next > *').first().evaluate((el) => getComputedStyle(el).scale)).toBe('-1 1');
});

test('a conversation titled in English keeps its own direction in a right-to-left list', async ({ page }) => {
    await rightToLeft(page);
    await page.goto('/?scenario&fast');
    const title = page.locator('aparte-conversation-list .aparte-conv-item__title').filter({ hasText: 'Compare three frameworks' });
    await expect(title).toBeVisible();
    expect(await title.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    expect(await page.locator('aparte-conversation-list').evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
});

test('the input follows what is typed in it, and an empty one the page', async ({ page }) => {
    await rightToLeft(page);
    await installLlmMock(page, { scenario: 'text' });
    await page.goto('/');
    const editor = page.locator('aparte-composer-input .aparte-ci-editor').first();
    await expect(editor).toBeVisible();
    expect(await editor.evaluate((el) => getComputedStyle(el).unicodeBidi)).toBe('plaintext');
    expect(await editor.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');

    await editor.click();
    await page.keyboard.type('Hello there.');
    expect(await textSide(page, 'aparte-composer-input .aparte-ci-editor')).toBe('left');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(ARABIC);
    expect(await textSide(page, 'aparte-composer-input .aparte-ci-editor')).toBe('right');
});
