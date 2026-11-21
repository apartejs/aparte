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

// The commonest Save closes its dialog in the same click. The toast waited for its region to
// settle inside the dialog, the dialog closed meanwhile, and it was put in a corner no longer
// on the page: never seen, never heard.
test('a toast shown by the button that closes its dialog is shown on the page', async ({ page }) => {
    await page.goto('/?harness=toast-in-dialog');
    await page.locator('#harness-open').click();
    await page.locator('#harness-save-close').click();
    await expect(page.locator('#harness-dialog')).toBeHidden();
    const toast = page.locator('.aparte-toasts > .aparte-alert', { hasText: 'Saved, and closed.' });
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((el) => el.isConnected && el.parentElement?.parentElement === document.body)).toBe(true);
});

// A dialog in a component's shadow root, its button slotted from the page: the focus is in the
// page's tree, so the dialog around it was not found, and the toast went under its backdrop.
test('a toast shown from a modal dialog in a shadow root is inside that dialog, above its backdrop', async ({ page }) => {
    await page.goto('/?harness=toast-in-dialog');
    await page.locator('#harness-shadow-open').click();
    await page.locator('#harness-shadow-save').click();
    const toast = page.locator('.aparte-toasts > .aparte-alert', { hasText: 'Saved in the shadow.' });
    await expect(toast).toBeVisible();
    // In the page's own tree, drawn by the dialog through its slot: the kit's stylesheet reaches it
    // there (in the component's shadow root it was drawn bare), and the dialog does not make it inert.
    const placed = await toast.evaluate((el) => ({
        lightDom: el.getRootNode() === document,
        fixed: getComputedStyle(el.parentElement!).position === 'fixed',
        inDialog: !!el.closest('#harness-shadow-host'),
    }));
    expect(placed).toEqual({ lightDom: true, fixed: true, inDialog: true });
    const dismiss = toast.locator('.aparte-alert__dismiss');
    const hit = await dismiss.evaluate((el) => {
        const box = el.getBoundingClientRect();
        let at: Element | null = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        while (at?.shadowRoot) {
            const inner = at.shadowRoot.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            if (!inner || inner === at) break;
            at = inner;
        }
        // A slotted node is hit through its slot: the composed path back to the button.
        return at === el || el.contains(at) || (at instanceof HTMLSlotElement && at.assignedElements({ flatten: true }).some((n) => n.contains(el)));
    });
    expect(hit, 'the dismiss button is what lies under the pointer, not the backdrop').toBe(true);
    await dismiss.click();
    await expect(toast).toHaveCount(0);
});
