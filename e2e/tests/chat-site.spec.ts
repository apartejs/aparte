/**
 * The vanilla example is a chat SITE: a sidebar with the conversation list, a header,
 * the chat — over the library's conversation chain and a store that answers after a
 * delay. This suite drives the site's glue: the list says it is on its way and then
 * fills, opening a conversation shows the wait and then the transcript, a new chat
 * empties it, a send in a new chat puts it at the top of the list under its message,
 * and the sidebar folds into a drawer on a phone. The chat itself is covered
 * everywhere else.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions';

const LIST = 'aparte-conversation-list';
const VIEWPORT = 'aparte-chat-viewport';

test('the list is on its way, then fills; opening a conversation shows the wait, then the transcript', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?scenario');
    // The store answers after a delay: the list draws its wait first, and says so.
    await expect(page.locator(LIST)).toHaveAttribute('loading', '');
    await expect(page.locator(LIST)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator(`${LIST} .aparte-conv-list-loading`)).toBeVisible();
    await expect(page.locator(LIST)).not.toHaveAttribute('loading', '');
    await expect(page).toHaveTitle('aparté');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);

    await page.locator(LIST).getByText('Compare three frameworks').click();
    // The messages come through `loadFull()`: the viewport wears `loading` in between,
    // the row is already the current one, and the welcome screen does not show.
    await expect(page.locator(VIEWPORT)).toHaveAttribute('loading', '');
    await expect(page.locator('aparte-chat')).not.toHaveAttribute('data-empty', '');
    await expect(page.locator(`${LIST} [aria-current="page"]`)).toContainText('Compare three frameworks');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
    await expect(page.locator(VIEWPORT)).not.toHaveAttribute('loading', '');
    await expect(page).toHaveTitle('Compare three frameworks · aparté');
    // A table in the sample reply, rendered as one: the transcript is real markdown.
    await expect(page.locator('aparte-chat-bubble table')).toBeVisible();
    expect(errors).toEqual([]);
});

test('a new chat empties the transcript, and a send creates the conversation at the top of the list', async ({ page }) => {
    await page.goto('/?scenario&fast');
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);

    await page.locator('#new-chat').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(page).toHaveTitle('aparté');
    await expect(page.locator('#welcome')).toBeVisible();

    const editor = page.locator('aparte-composer-input [contenteditable], aparte-composer-input textarea').first();
    await editor.fill('Write a haiku about web components.');
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('Write a haiku about web components. · aparté');
    // The new entry is the first row under "Today" — the pinned group stays above it.
    const today = page.locator(`${LIST} .aparte-conv-group`, { hasText: 'Today' });
    await expect(today.locator('[data-conv-id]').first()).toContainText('Write a haiku about web components.');
    await expect(page.locator('#welcome')).toBeHidden();
    // The scripted model answered.
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the sidebar is a drawer on a phone, opened by the header toggle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/?scenario&fast');
    const sidebar = page.locator('aparte-sidebar');
    // A drawer, and closed: the element folds the list off screen (a transform, which a
    // visibility check does not see), so the attributes are what to assert.
    await expect(sidebar).toHaveAttribute('data-drawer', /.*/);
    await expect(sidebar).toHaveAttribute('collapsed', '');

    await page.locator('[data-aparte-sidebar-toggle]').last().click();
    await expect(sidebar).not.toHaveAttribute('collapsed', '');
    await expect(page.locator(LIST).getByText('Weather in Lille')).toBeVisible();
    // Picking a conversation from the drawer opens the thread.
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page).toHaveTitle('Weather in Lille · aparté');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the theme toggle flips the page between light and dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?scenario&fast');
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the light theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the dark theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'dark');
});

test('a sidebar collapsed on a desktop opens again from the header', async ({ page }) => {
    await page.goto('/?scenario&fast');
    const sidebar = page.locator('aparte-sidebar');
    const headerToggle = page.locator('.aparte-app-header__toggle');
    // Wide: the sidebar is a column, and the header's toggle stays out of the way.
    await expect(sidebar).not.toHaveAttribute('data-drawer', /.*/);
    await expect(headerToggle).toBeHidden();

    await sidebar.locator('[data-aparte-sidebar-toggle]').click();
    await expect(sidebar).toHaveAttribute('collapsed', '');
    // Collapsed, the sidebar's own toggle went with it (inert, 0px): the header's shows.
    await expect(headerToggle).toBeVisible();
    await headerToggle.click();
    await expect(sidebar).not.toHaveAttribute('collapsed', '');
    await expect(headerToggle).toBeHidden();
});
