/**
 * A toast shown from an action in a kit dialog can be read, reached and closed.
 *
 * A modal dialog makes everything outside it inert and draws it under its backdrop. A toast put in
 * the page's corner while one was open sat under the backdrop: no click reached it, the keyboard
 * could not, and assistive technology did not hear it. It now goes inside the topmost modal
 * dialog, and back to the page when the dialog closes. jsdom has no top layer and no inertness,
 * hence a browser.
 *
 * The page is the vanilla example's `?harness=toast-in-dialog`
 * (`apps/examples/_shared/toast-harness.ts`): a Settings dialog whose Save shows a toast that
 * stays until it is closed.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';

test('a toast shown from a modal dialog is above its backdrop, and its button takes the click', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?harness=toast-in-dialog');
    await page.locator('#harness-open').click();
    const dialog = page.locator('#harness-dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#harness-save').click();

    const toast = page.locator('.aparte-toasts > .aparte-alert', { hasText: 'Settings saved.' });
    await expect(toast).toBeVisible();
    // Inside the dialog, so not inert: the point at its button's centre is the button.
    expect(await toast.evaluate((el) => el.closest('dialog')?.id)).toBe('harness-dialog');
    const dismiss = toast.locator('.aparte-alert__dismiss');
    const hit = await dismiss.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return at === el || el.contains(at);
    });
    expect(hit, 'the dismiss button is what lies under the pointer, not the backdrop').toBe(true);
    // Reached from the keyboard: Tab moves through the dialog, the toast included.
    await dismiss.focus();
    await expect(dismiss).toBeFocused();
    await dismiss.click();
    await expect(toast).toHaveCount(0);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a toast still shown when its dialog closes goes back to the page', async ({ page }) => {
    await page.goto('/?harness=toast-in-dialog');
    await page.locator('#harness-open').click();
    await page.locator('#harness-save').click();
    const toast = page.locator('.aparte-toasts > .aparte-alert', { hasText: 'Settings saved.' });
    await expect(toast).toBeVisible();
    await page.locator('#harness-close').click();
    await expect(page.locator('#harness-dialog')).toBeHidden();
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((el) => el.parentElement?.parentElement === document.body)).toBe(true);
});
