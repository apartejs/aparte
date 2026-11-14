/**
 * `hidden` on a kit element, in a real browser (apartejs/aparte#207).
 *
 * `hidden-means-hidden.test.ts` reads base.css's selectors as text, and it was green the whole
 * time an element whose class list had a tab or a newline before our class stayed painted.
 * What can be wrong is what an engine does with the selector: a CSS escape that reads as
 * another character (`\9aparte-` is U+009A then "parte-", because `a` is a hex digit), a
 * minifier that rewrites it, a state — `hidden="until-found"` — the UA treats on its own
 * terms. Only an engine can say, so this builds elements in the page and asks what it painted.
 *
 * Runs on `vanilla-dist` only: the stylesheet as published and minified, the one a consumer's
 * page has, on a page with no skin of its own. The `vanilla` example's shared stylesheet has
 * a bare `[hidden] { display: none }`, under which every case here is hidden whatever core's
 * rule says. It needs no chat, only the kit's CSS being on the page — which every case proves
 * first, with a control that is NOT hidden and must paint the recipe's own `display`. Without
 * the control, a page with no stylesheet would pass: the browser hides `[hidden]` by itself.
 */

import { test, expect, type Page } from '@playwright/test';

/** The five characters HTML allows between two class names: ASCII whitespace. */
const SEPARATORS: Record<string, string> = {
    space: ' ',
    tab: '\t',
    'line feed': '\n',
    'form feed': '\f',
    'carriage return': '\r',
};

/** `.aparte-card__footer { display: flex }` — a recipe that sets `display`, so `hidden` has to outrank it. */
const RECIPE = 'aparte-card__footer';

/** `display` of an element built with exactly this `class` value and `hidden` attribute (`null`: none). */
async function displayOf(page: Page, klass: string, hidden: string | null): Promise<string> {
    return page.evaluate(
        ([value, attribute]) => {
            const el = document.createElement('div');
            el.setAttribute('class', value!);
            if (attribute !== null) el.setAttribute('hidden', attribute);
            document.body.append(el);
            const display = getComputedStyle(el).display;
            el.remove();
            return display;
        },
        [klass, hidden] as const,
    );
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The kit's stylesheet is on the page once the recipe paints: a Vite dev server injects it
    // after the app's module has run.
    await expect.poll(() => displayOf(page, RECIPE, null), { message: 'core\'s stylesheet is on the page' }).toBe('flex');
});

test('hidden hides a kit element whatever whitespace separates its classes', async ({ page }) => {
    for (const [name, separator] of Object.entries(SEPARATORS)) {
        for (const [where, klass] of [
            ['after another class', `my-footer${separator}${RECIPE}`],
            ['at the start of the value', `${separator}${RECIPE}`],
        ] as const) {
            // The control: same class list, not hidden. The separator must not stop the recipe applying.
            expect(await displayOf(page, klass, null), `${name} ${where}, not hidden`).toBe('flex');
            expect(await displayOf(page, klass, ''), `${name} ${where}, hidden`).toBe('none');
        }
    }
});

test('hidden hides a kit element whose class comes first', async ({ page }) => {
    expect(await displayOf(page, RECIPE, '')).toBe('none');
    expect(await displayOf(page, `${RECIPE} my-footer`, '')).toBe('none');
});

test('hidden="until-found" is left to the browser, so find-in-page can still reveal it', async ({ page }) => {
    // The recipe's own `display` shows through: the browser hides this state with
    // `content-visibility: hidden`, not `display: none`, and the kit must not force it.
    expect(await displayOf(page, RECIPE, 'until-found')).not.toBe('none');
    expect(await displayOf(page, `my-footer\n${RECIPE}`, 'UNTIL-FOUND')).not.toBe('none');
});

test('hidden leaves a host element alone when our prefix is only part of its class name', async ({ page }) => {
    // `my-aparte-card` is not ours: no whitespace precedes `aparte-`, so the kit's rule must not
    // reach it, and the host's own `display` stands over the browser's `[hidden]`.
    const display = await page.evaluate(() => {
        const el = document.createElement('div');
        el.setAttribute('class', 'my-aparte-card');
        el.setAttribute('style', 'display: block');
        el.hidden = true;
        document.body.append(el);
        const value = getComputedStyle(el).display;
        el.remove();
        return value;
    });
    expect(display).toBe('block');
});
