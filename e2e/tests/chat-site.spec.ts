/**
 * The vanilla example is a chat SITE: a sidebar with the conversation list, a header
 * with the title, the chat. This suite drives the site's glue — opening a conversation
 * fills the transcript and the header, a new chat empties them, a send in a new chat
 * puts it at the top of the list under its message, and the sidebar folds into a
 * drawer on a phone. The chat itself is covered everywhere else.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions';

const LIST = 'aparte-conversation-list';
const TITLE = '#chat-title';

test('opening a conversation fills the transcript and the header title', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?scenario');
    await expect(page.locator(TITLE)).toHaveText('New conversation');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);

    await page.locator(LIST).getByText('Compare three frameworks').click();
    await expect(page.locator(TITLE)).toHaveText('Compare three frameworks');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
    // A table in the sample reply, rendered as one: the transcript is real markdown.
    await expect(page.locator('aparte-chat-bubble table')).toBeVisible();
    await expect(page.locator(`${LIST} [aria-current="page"]`)).toContainText('Compare three frameworks');
    expect(errors).toEqual([]);
});

test('a new chat empties the transcript, and a send creates the conversation at the top of the list', async ({ page }) => {
    await page.goto('/?scenario');
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);

    await page.getByRole('button', { name: 'New conversation' }).click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(page.locator(TITLE)).toHaveText('New conversation');
    await expect(page.locator('#welcome')).toBeVisible();

    const editor = page.locator('aparte-composer-input [contenteditable], aparte-composer-input textarea').first();
    await editor.fill('Write a haiku about web components.');
    await page.keyboard.press('Enter');
    await expect(page.locator(TITLE)).toHaveText('Write a haiku about web components.');
    // The new entry is the first row under "Today" — the pinned group stays above it.
    const today = page.locator(`${LIST} .aparte-conv-group`, { hasText: 'Today' });
    await expect(today.locator('[data-conv-id]').first()).toContainText('Write a haiku about web components.');
    await expect(page.locator('#welcome')).toBeHidden();
    // The scripted model answered.
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the sidebar is a drawer on a phone, opened by the header toggle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/?scenario');
    const sidebar = page.locator('aparte-sidebar');
    // A drawer, and closed: the element folds the list off screen (a transform, which a
    // visibility check does not see), so the attributes are what to assert.
    await expect(sidebar).toHaveAttribute('data-drawer', /.*/);
    await expect(sidebar).toHaveAttribute('collapsed', '');

    await page.locator('[data-aparte-sidebar-toggle]').click();
    await expect(sidebar).not.toHaveAttribute('collapsed', '');
    await expect(page.locator(LIST).getByText('Weather in Lille')).toBeVisible();
    // Picking a conversation from the drawer opens the thread.
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator(TITLE)).toHaveText('Weather in Lille');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the theme toggle flips the page between light and dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?scenario');
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the light theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the dark theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'dark');
});
