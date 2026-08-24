/**
 * The derived variable layer, in a real browser — because no unit test can see it.
 *
 * A CSS custom property is substituted where it is DECLARED. 79 of core's variables
 * read another variable, and all 79 were declared on `:root, :host` alone, so they
 * were computed once against the root palette and everything below merely inherited
 * the result. Two consequences, both invisible:
 *
 *   - setting `--aparte-primary` on one `<aparte-chat>` moved the send button and
 *     nothing else — the accent, the avatar and the focus ring kept the root's brass;
 *   - `[data-aparte-theme="dark"]` overrides eight masters and re-declared none of
 *     the derived layer, so dark mode kept light-substituted values (and 24 of them
 *     had been papered over with hardcoded literals from a palette the theme had
 *     since left).
 *
 * jsdom does not resolve `var()`, so `getComputedStyle` there returns the unsubstituted
 * token stream and every assertion below passes on a broken stylesheet. The source-shape
 * half is guarded by `scripts/check-derived-vars.mjs`; THIS is the behavioural half, and
 * it only exists in a browser.
 *
 * The assertions are RELATIONS, not hex codes — "the derived value equals its master",
 * not "the accent is #b07d33". A palette change should not redden this file; only the
 * derivation breaking should.
 *
 * `vanilla` only, same reasoning as the layout suite: this is core's own CSS, identical
 * under every wrapper. It does run under WebKit, which is where CSS-variable behaviour
 * is most likely to diverge — and that is the point of testing it in a browser at all.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/** Computed value of a custom property, substituted, on a selector's first match. */
async function cssVar(page: import('@playwright/test').Page, selector: string, name: string): Promise<string> {
    return (
        await page.evaluate(
            ([sel, prop]) => {
                const el = sel === ':root' ? document.documentElement : document.querySelector(sel);
                if (!el) throw new Error(`no element for ${sel}`);
                return getComputedStyle(el).getPropertyValue(prop);
            },
            [selector, name] as const,
        )
    ).trim();
}

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/');
    await expect(new ChatPage(page).editor).toBeVisible();
});

test('a derived value follows a master set on one chat — per-instance theming', async ({ page }) => {
    const rootAccentBefore = await cssVar(page, ':root', '--aparte-accent');
    expect(rootAccentBefore, 'the accent should resolve to a colour at the root').not.toBe('');

    await page.evaluate(() => {
        document.querySelector('aparte-chat')!.setAttribute('style', '--aparte-primary: rgb(1, 2, 3)');
    });

    // `--aparte-accent: var(--aparte-primary)`. Declared only on `:root`, it kept the
    // root's brass here no matter what this element said — the sentence the landing
    // page had to retract.
    expect(await cssVar(page, 'aparte-chat', '--aparte-accent')).toBe('rgb(1, 2, 3)');
    // And the override is LOCAL: a second chat on the page must not have moved.
    expect(await cssVar(page, ':root', '--aparte-accent')).toBe(rootAccentBefore);
});

test('a dark chat derives from the DARK palette, not the light substitution', async ({ page }) => {
    const lightAccent = await cssVar(page, 'aparte-chat', '--aparte-accent');
    const lightInputBg = await cssVar(page, 'aparte-chat', '--aparte-input-bg');
    const paintedLight = await page
        // The composer SHELL, not the contenteditable inside it: the editor is
        // transparent in both themes, so probing it measures nothing. `--aparte-input-bg`
        // paints this element.
        .locator('.aparte-composer-shell')
        .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.evaluate(() => {
        document.querySelector('aparte-chat')!.setAttribute('data-aparte-theme', 'dark');
    });

    const darkPrimary = await cssVar(page, 'aparte-chat', '--aparte-primary');
    const darkSurface1 = await cssVar(page, 'aparte-chat', '--aparte-surface-1');

    // The masters moved — that part always worked.
    expect(darkPrimary).not.toBe(await cssVar(page, ':root', '--aparte-primary'));

    // The derivation FOLLOWED them. This is the whole fix: equality with the master,
    // not a hardcoded dark hex, is what says the layer re-substituted here.
    expect(await cssVar(page, 'aparte-chat', '--aparte-accent')).toBe(darkPrimary);
    expect(await cssVar(page, 'aparte-chat', '--aparte-accent')).not.toBe(lightAccent);
    // `--aparte-input-bg: var(--aparte-surface-1)` was one of the 24 that dark had
    // pinned to a literal from an abandoned palette. It now tracks the dark surface.
    expect(await cssVar(page, 'aparte-chat', '--aparte-input-bg')).toBe(darkSurface1);
    expect(await cssVar(page, 'aparte-chat', '--aparte-input-bg')).not.toBe(lightInputBg);

    // Not only the variables: something is actually painted differently.
    const paintedDark = await page
        // The composer SHELL, not the contenteditable inside it: the editor is
        // transparent in both themes, so probing it measures nothing. `--aparte-input-bg`
        // paints this element.
        .locator('.aparte-composer-shell')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(paintedDark).not.toBe(paintedLight);
});

test('a chat nested in a dark wrapper stays dark', async ({ page }) => {
    // The regression that the OTHER half of the guard prevents. Widening the literal
    // block's selector list looks like the same fix and is not: it would re-declare
    // the light literals ON this element, where a local declaration beats the value
    // inherited from the dark ancestor, and the chat would silently go light.
    await page.evaluate(() => {
        document.body.setAttribute('data-aparte-theme', 'dark');
    });

    const onWrapper = await cssVar(page, 'body', '--aparte-bg');
    const onChat = await cssVar(page, 'aparte-chat', '--aparte-bg');

    expect(onChat).toBe(onWrapper);
    // And a derived value still resolves against the dark master it inherited.
    expect(await cssVar(page, 'aparte-chat', '--aparte-accent')).toBe(
        await cssVar(page, 'body', '--aparte-primary'),
    );
});
