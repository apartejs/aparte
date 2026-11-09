/**
 * The menu of `@aparte/plugin-triggers`, in a browser.
 *
 * jsdom has no layout, no caret that moves and no edit history. So this is the half that
 * needs them: the menu sits at the caret, the focus never leaves the field under a real
 * mouse, a pill behaves like one character, Undo works, and the commands of the other
 * plugins are there without anybody having wired them.
 */
import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const LIST = 'aparte-triggers [role="listbox"]';
const OPTION = `${LIST} [role="option"]`;
const TOKEN = '.aparte-inline-token';

async function open(page: Page, query = '?commands'): Promise<ChatPage> {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto(`/${query}`);
    await chat.waitUngated();
    await expect(page.locator('aparte-triggers')).toHaveCount(1);
    await chat.editor.click();
    return chat;
}

const focusIsInTheField = (page: Page): Promise<boolean> =>
    page.evaluate(() => document.activeElement?.classList.contains('aparte-ci-editor') ?? false);

test('without the element, a slash is only a slash', async ({ page }) => {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();
    await chat.editor.pressSequentially('/compact');
    await expect(page.locator(LIST)).toHaveCount(0);
});

test('a trigger opens a list at the caret, and narrows it as you type', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await open(page);
    await chat.editor.pressSequentially('hello @');
    await expect(page.locator(OPTION).first()).toBeVisible();

    const menu = (await page.locator(LIST).boundingBox())!;
    const field = (await chat.editor.boundingBox())!;
    expect(menu.y + menu.height, 'above the field').toBeLessThanOrEqual(field.y + field.height);
    expect(menu.x, 'at the trigger, not at the start of the field').toBeGreaterThan(field.x + 20);

    expect(await focusIsInTheField(page)).toBe(true);
    await chat.editor.pressSequentially('an');
    await expect(page.locator(OPTION)).toHaveCount(1);
    await expect(page.locator(OPTION)).toContainText('Anna');
    expect(errors).toEqual([]);
});

test('the keyboard chooses, and Enter sends once the menu is closed', async ({ page }) => {
    const chat = await open(page);
    const sent = await chat.recordEvents<{ content: string; tokens: Array<{ label: string; text: string; kind: string; data: unknown }> }>('aparte-send');
    await chat.editor.pressSequentially('@');
    await expect(page.locator(OPTION).first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(chat.editor).toHaveAttribute('aria-activedescendant', await page.locator(OPTION).nth(1).getAttribute('id') ?? '');
    await page.keyboard.press('Enter');

    await expect(page.locator(LIST)).toHaveCount(0);
    await expect(chat.editor.locator(TOKEN)).toHaveText('Anna');
    await expect(chat.bubbles('user')).toHaveCount(0);

    await chat.editor.pressSequentially('hi');
    await expect(chat.editor).toHaveText(/Anna\s+hi/);
    await page.keyboard.press('Enter');

    await expect(chat.bubbles('user')).toHaveCount(1);
    await expect(chat.bubbles('user').locator(TOKEN)).toHaveText('Anna');
    const [detail] = await sent();
    expect(detail!.content).toBe('@anna hi');
    expect(detail!.tokens[0]).toMatchObject({ label: 'Anna', text: '@anna', kind: 'mention', data: { id: 2 } });
});

test('a real press on a row keeps the focus and chooses it', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('@');
    const row = page.locator(OPTION).first();
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 8);
    await page.mouse.down();
    expect(await focusIsInTheField(page), 'still in the field during the press').toBe(true);
    await page.mouse.up();
    await expect(chat.editor.locator(TOKEN)).toHaveCount(1);
    expect(await focusIsInTheField(page)).toBe(true);
});

test('a pill goes in one Backspace, and Undo brings it back', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit does not take a scripted Undo from the keyboard in this harness');
    const chat = await open(page);
    // Words before it: a field emptied by hand is reset, and its history with it.
    await chat.editor.pressSequentially('hi @');
    await expect(page.locator(OPTION).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(chat.editor.locator(TOKEN)).toHaveCount(1);
    await page.keyboard.press('Backspace'); // the space the caret landed on
    await page.keyboard.press('Backspace'); // the pill
    await expect(chat.editor.locator(TOKEN)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(chat.editor.locator(TOKEN)).toHaveCount(1);
});

test('Escape closes it, and it stays closed until the caret leaves the trigger', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('@a');
    await expect(page.locator(OPTION).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(LIST)).toHaveCount(0);
    await chat.editor.pressSequentially('n');
    await expect(page.locator(LIST)).toHaveCount(0);
    await chat.editor.pressSequentially(' @');
    await expect(page.locator(OPTION).first()).toBeVisible();
});

test('Enter on a card that opens over the menu is the card\'s', async ({ page }) => {
    await open(page);
    await page.keyboard.type('/');
    await expect(page.locator(LIST)).toBeVisible();

    // An agent can ask while someone is typing the next message. The menu used to stay
    // open and take the Enter meant for Approve, and run its first command instead.
    await page.evaluate(() => {
        const composer = document.querySelector('aparte-composer') as HTMLElement & { showPanel(el: HTMLElement, o: object): symbol };
        const card = document.createElement('button');
        card.id = 'card';
        card.addEventListener('click', () => { card.dataset['pressed'] = 'yes'; });
        composer.showPanel(card, { mode: 'none' });
        card.focus();
    });
    await expect(page.locator(LIST)).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('#card')).toHaveAttribute('data-pressed', 'yes');
});

test('several lines stay several lines when a row inserts them', async ({ page }) => {
    await open(page);
    const value = await page.evaluate(() => {
        const input = document.querySelector('aparte-composer-input') as HTMLElement & { replaceRange(a: number, b: number, t: string): void; getValue(): string };
        input.replaceRange(0, 0, 'Best regards,\nPaul');
        return input.getValue();
    });
    expect(value).toBe('Best regards,\nPaul');
});

test('several lines stay several lines when they are pasted', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit ignores clipboardData on a synthetic paste');
    const chat = await open(page);
    await chat.editor.evaluate((editor) => {
        const data = new DataTransfer();
        data.setData('text/plain', 'one\n  two\n\nthree');
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    const value = await page.evaluate(() => (document.querySelector('aparte-composer-input') as HTMLElement & { getValue(): string }).getValue());
    expect(value).toBe('one\n  two\n\nthree');
});

test('an email address opens nothing', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('paul@example');
    await expect(page.locator(LIST)).toHaveCount(0);
});

test('a submenu opens beside its row, by keyboard and by pointer', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('#');
    const files = page.locator(OPTION).filter({ hasText: 'Files' });
    await expect(files).toBeVisible();
    await expect(files.locator('.aparte-menu__chevron')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    const panels = page.locator(LIST);
    await expect(panels).toHaveCount(2);
    const parent = (await panels.first().boundingBox())!;
    const child = (await panels.last().boundingBox())!;
    expect(child.x, 'beside its parent').toBeGreaterThanOrEqual(parent.x + parent.width - 1);

    await page.keyboard.press('ArrowLeft');
    await expect(panels).toHaveCount(1);

    await files.hover();
    await page.mouse.move((await files.boundingBox())!.x + 12, (await files.boundingBox())!.y + 12);
    await expect(panels).toHaveCount(2);
    await panels.last().locator('[role="option"]').first().click();
    await expect(chat.editor.locator(TOKEN)).toHaveText('report.pdf');
    expect(await focusIsInTheField(page)).toBe(true);
});

test('a search looks inside the submenus and says where a row comes from', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('#rep');
    await expect(page.locator(OPTION)).toHaveCount(1);
    await expect(page.locator(OPTION)).toContainText('report.pdf');
    await expect(page.locator(OPTION).locator('.aparte-menu__description')).toHaveText('Files');
});

test('the commands of the other plugins are there, and they act', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await open(page);
    await chat.editor.pressSequentially('/');
    await expect(page.locator(OPTION).filter({ hasText: '/compact' })).toBeVisible();
    await expect(page.locator(OPTION).filter({ hasText: '/approval' })).toBeVisible();
    await expect(page.locator(OPTION).filter({ hasText: '/new' })).toBeVisible();
    await expect(page.locator(OPTION).filter({ hasText: '/stop' }), 'nothing to stop').toHaveCount(0);

    await chat.editor.pressSequentially('appr');
    await expect(page.locator(OPTION)).toHaveCount(1);
    await page.keyboard.press('Enter');
    const modes = page.locator(LIST).last().locator('[role="option"]');
    await expect(modes).toHaveCount(4);
    await modes.filter({ hasText: 'Plan' }).click();
    await expect(page.locator(LIST)).toHaveCount(0);
    await expect(chat.editor).toHaveText('');
    await expect(chat.approvalMode.locator('aparte-select')).toHaveJSProperty('value', 'plan');
    expect(errors).toEqual([]);
});

test('/compact on an empty chat says so', async ({ page }) => {
    const chat = await open(page);
    await chat.editor.pressSequentially('/compact');
    await page.keyboard.press('Enter');
    await expect(page.locator('aparte-triggers [role="status"]')).toContainText(/nothing to compact|does not say/);
});

test('/new empties the conversation', async ({ page }) => {
    const chat = await open(page);
    await chat.sendAndSettle('first');
    await chat.editor.click();
    await chat.editor.pressSequentially('/new');
    await page.keyboard.press('Enter');
    await expect(chat.bubbles('user')).toHaveCount(0);
});

test('on a phone, one panel at a time and a way back', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    const chat = await open(page);
    await chat.editor.pressSequentially('#');
    await expect(page.locator(OPTION).first()).toBeVisible();
    const composer = (await chat.composer.boundingBox())!;
    const menu = (await page.locator(LIST).boundingBox())!;
    expect(Math.abs(menu.width - composer.width), 'as wide as the composer').toBeLessThan(2);

    await page.locator(OPTION).filter({ hasText: 'Files' }).click();
    const panels = page.locator(LIST);
    await expect(panels).toHaveCount(2);
    await expect(panels.first()).toBeHidden();
    await panels.last().locator('[role="option"]').filter({ hasText: 'Back' }).click();
    await expect(panels).toHaveCount(1);
    await expect(panels.first()).toBeVisible();
});

test('right to left: the menu lines up on the right and the arrows swap', async ({ page }) => {
    await page.addInitScript(() => {
        const set = () => document.documentElement?.setAttribute('dir', 'rtl');
        set();
        new MutationObserver(set).observe(document, { childList: true });
    });
    const chat = await open(page);
    // Arabic first, so the line runs from the right and the submenu has room on its left.
    await chat.editor.pressSequentially('مرحبا #');
    await expect(page.locator(OPTION).first()).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    const panels = page.locator(LIST);
    await expect(panels).toHaveCount(2);
    const parent = (await panels.first().boundingBox())!;
    const child = (await panels.last().boundingBox())!;
    expect(child.x + child.width, 'on the left of its parent').toBeLessThanOrEqual(parent.x + 1);
    await page.keyboard.press('ArrowRight');
    await expect(panels).toHaveCount(1);
});
