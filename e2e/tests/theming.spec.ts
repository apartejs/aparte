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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('a dark chat derives from the DARK palette, not the light substitution', async ({ page }, testInfo) => {
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
    // pinned to a literal from an abandoned palette. It now tracks a dark surface — the
    // first, or the second when a skin lifts the composer one surface up, as the chat
    // site's does (measured on the product: the pill sits on #303030 over #212121).
    //
    // `vanilla-dist` carries no skin at all (a bare `<aparte-chat>`, core's own
    // default composition — see playwright.config.ts's `suiteFor`), so it is where
    // the ORIGINAL, exact assertion still applies: the first surface, and nothing
    // else. Only `vanilla` (which loads the chat site's skin) keeps the tolerant
    // either-surface form — accepting either there unconditionally is what let this
    // assertion stop measuring core's own derivation at all (RA-14).
    const inputBg = await cssVar(page, 'aparte-chat', '--aparte-input-bg');
    if (testInfo.project.name.startsWith('vanilla-dist')) {
        expect(inputBg).toBe(darkSurface1);
    } else {
        const darkSurface2 = await cssVar(page, 'aparte-chat', '--aparte-surface-2');
        expect([darkSurface1, darkSurface2]).toContain(inputBg);
    }
    expect(inputBg).not.toBe(lightInputBg);

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

/*
 * A THEMED CHAT PAINTS ITS OWN GROUND.
 *
 * The palette sets the text and the ground together, and the chat used to paint only the
 * text: its background was the host page's. So a dark chat on a white page wrote its
 * light text on white, and so did a chat on a light-only site seen from a dark OS — the
 * system default picks the dark palette there with no attribute at all. A light chat on a
 * dark page went the other way. Our examples and the docs paint `body` with
 * `--aparte-bg`, which is the only reason none of them showed it.
 *
 * Asserted as a relation: what the chat paints is what its own palette says, and the
 * page around it has the opposite ground.
 */
test('a themed chat paints its own ground and ink, whatever the page around it', async ({ page }) => {
    for (const [theme, pageBg] of [['dark', 'rgb(255, 255, 255)'], ['light', 'rgb(17, 17, 17)']] as const) {
        const painted = await page.evaluate(([t, bg]) => {
            document.documentElement.style.background = bg;
            document.body.style.background = bg;
            const chat = document.querySelector('aparte-chat')!;
            chat.setAttribute('data-aparte-theme', t);
            // A token resolved as a colour, through a probe inside the chat.
            const resolve = (token: string): string => {
                const probe = document.createElement('span');
                probe.style.color = `var(${token})`;
                chat.append(probe);
                const value = getComputedStyle(probe).color;
                probe.remove();
                return value;
            };
            const style = getComputedStyle(chat);
            return { background: style.backgroundColor, color: style.color, bg: resolve('--aparte-bg'), text: resolve('--aparte-text') };
        }, [theme, pageBg] as const);

        expect(painted.background, `a ${theme} chat paints its palette's ground`).toBe(painted.bg);
        expect(painted.background, `and not the page's`).not.toBe(pageBg);
        expect(painted.color, `its text inherits its palette's ink, not the page's`).toBe(painted.text);
    }
});

test("a host's own rule on the chat's ground wins", async ({ page }) => {
    // The documented way back to a page that shows through, at any stylesheet order.
    const background = await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = 'aparte-chat { background: none; }';
        document.head.prepend(style);
        return getComputedStyle(document.querySelector('aparte-chat')!).backgroundColor;
    });
    expect(background).toBe('rgba(0, 0, 0, 0)');
});

/*
 * THE INK ON A SOLID FILL IS READABLE — on every intent, in both themes, and on a
 * palette this repo has never seen.
 *
 * This is the assertion the library was missing, and its absence cost twice. Core used
 * to write the ink down as a constant (`--aparte-on-intent: #14100a`), chosen by
 * measuring against this repo's own five fills. Two things followed, neither visible to
 * any existing check:
 *
 *   - `--neutral` needed a hardcoded white to escape that constant, and the escape was
 *     pinned while the FILL flipped with the theme — so the solid neutral button, badge
 *     and checkbox all shipped at 2.62:1 in dark mode, on the stock palette;
 *   - a consumer who followed our own theming guide (an eight-line rebrand, or
 *     `<aparte-chat style="--aparte-primary: …">`) got that constant painted on their
 *     own fill: 1.11:1 measured on a dark navy.
 *
 * The ink is now derived from the fill, so this test asserts the PROPERTY rather than
 * any value: whatever the fill, the label clears AA. Only the derivation breaking should
 * redden it — a palette change must not.
 *
 * It has to run in a browser: `oklch(from …)` is resolved by the engine, and jsdom
 * returns the unsubstituted token stream, so this passes there on a broken stylesheet.
 */
const INTENTS = ['primary', 'secondary', 'neutral', 'info', 'success', 'warning', 'danger'] as const;

/** Contrast of each solid control's own label against its own fill, read from pixels. */
async function solidContrasts(page: import('@playwright/test').Page): Promise<Record<string, number>> {
    return page.evaluate((intents) => {
        const host = document.querySelector('aparte-chat') ?? document.body;
        let probe = document.getElementById('ink-probe');
        if (!probe) {
            probe = document.createElement('div');
            probe.id = 'ink-probe';
            probe.innerHTML = intents
                .map((i) => `<button class="aparte-btn aparte-btn--${i} aparte-btn--solid" data-i="${i}">Ok</button>`)
                .join('');
            host.appendChild(probe);
        }
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const cx = cv.getContext('2d', { willReadFrequently: true })!;
        const rgb = (c: string): number[] => {
            cx.clearRect(0, 0, 1, 1);
            cx.fillStyle = c;
            cx.fillRect(0, 0, 1, 1);
            const d = cx.getImageData(0, 0, 1, 1).data;
            return [d[0]!, d[1]!, d[2]!];
        };
        const lum = (c: number[]): number => {
            const [r, g, b] = c.map((v) => {
                const s = v / 255;
                return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            }) as [number, number, number];
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const out: Record<string, number> = {};
        for (const el of probe.querySelectorAll<HTMLElement>('[data-i]')) {
            const s = getComputedStyle(el);
            const a = lum(rgb(s.color));
            const b = lum(rgb(s.backgroundColor));
            const [hi, lo] = a > b ? [a, b] : [b, a];
            out[el.dataset['i']!] = (hi + 0.05) / (lo + 0.05);
        }
        return out;
    }, INTENTS as unknown as string[]);
}

for (const theme of ['light', 'dark'] as const) {
    test(`every solid intent clears AA in the ${theme} theme`, async ({ page }) => {
        if (theme === 'dark') {
            await page.evaluate(() => document.documentElement.setAttribute('data-aparte-theme', 'dark'));
        }
        const ratios = await solidContrasts(page);
        for (const intent of INTENTS) {
            expect(ratios[intent], `${intent} label on its own fill`).toBeGreaterThanOrEqual(4.5);
        }
    });
}

test('a consumer palette core has never seen is readable too', async ({ page }) => {
    // The exact gesture guides/theming.mdx teaches, with a brand colour far from ours.
    // Against the old constant this measured 1.11:1 and nothing said so.
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--aparte-primary', '#1a1a2e');
        document.documentElement.style.setProperty('--aparte-neutral', '#0f172a');
    });
    const ratios = await solidContrasts(page);
    expect(ratios['primary'], 'a dark navy brand primary').toBeGreaterThanOrEqual(4.5);
    expect(ratios['neutral'], 'a near-black neutral').toBeGreaterThanOrEqual(4.5);
});

/*
 * Issue #95: a host's rebrand wins on the selectors a host writes anyway, whatever order the
 * sheets load in. The reporter's `[data-aparte-theme="dark"]` block lost to core's
 * prefers-color-scheme block on a dark OS, and a `:root` rebrand loaded before core (a
 * `<link>` in index.html, under Vite) lost in light too. And the other half: a rebrand that
 * only knows light stays light-only. On a dark OS it gets core's whole dark palette, not its
 * light masters mixed into core's dark inks.
 * Measured on a blank page with core's own theme.css and nothing else: the examples wear a
 * skin of their own, which would be what the test measured.
 */
const CORE_THEME = readFileSync(fileURLToPath(new URL('../../packages/core/src/styles/theme.css', import.meta.url)), 'utf8');
/** The reporter's stylesheet, plus the guide's block for a host that follows the OS. */
const HOST_REBRAND = `
  :root { --aparte-primary: rgb(8, 126, 164); }
  [data-aparte-theme="dark"] { --aparte-primary: rgb(88, 196, 220); }
  @media (prefers-color-scheme: dark) {
    :root:not([data-aparte-theme="light"]) { --aparte-primary: rgb(88, 196, 220); }
  }
`;
/** A light rebrand and nothing else. */
const HOST_LIGHT_ONLY = ':root { --aparte-primary: rgb(8, 126, 164); --aparte-surface-1: rgb(255, 255, 255); }';
const HOST_LIGHT = 'rgb(8, 126, 164)';
const HOST_DARK = 'rgb(88, 196, 220)';

async function themedPage(page: import('@playwright/test').Page, host: string, order: string, os: 'light' | 'dark', attribute: string | null) {
    const sheets = order === 'host after core' ? [CORE_THEME, host] : [host, CORE_THEME];
    await page.setContent(`<!doctype html><html${attribute ? ` data-aparte-theme="${attribute}"` : ''}><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head><body><aparte-chat></aparte-chat></body></html>`);
    await page.emulateMedia({ colorScheme: os });
}

for (const order of ['host after core', 'host before core (Vite dev)'] as const) {
    for (const [os, attribute, expected] of [
        ['light', null, HOST_LIGHT],
        ['light', 'dark', HOST_DARK],
        ['dark', null, HOST_DARK],
        ['dark', 'dark', HOST_DARK],
        ['dark', 'light', HOST_LIGHT],
        ['light', 'light', HOST_LIGHT],
    ] as const) {
        test(`a host's rebrand wins: ${order}, OS ${os}, attribute ${attribute ?? 'none'}`, async ({ page }) => {
            await themedPage(page, HOST_REBRAND, order, os, attribute);
            // The chat reads the root's value: core's derived layer does not redeclare a master.
            expect(await cssVar(page, ':root', '--aparte-primary')).toBe(expected);
            expect(await cssVar(page, 'aparte-chat', '--aparte-primary')).toBe(expected);
        });
    }

    for (const [os, attribute, primary, surface] of [
        ['light', null, HOST_LIGHT, 'rgb(255, 255, 255)'],
        ['dark', null, '#d9a24b', '#211b28'],
        ['dark', 'light', HOST_LIGHT, 'rgb(255, 255, 255)'],
    ] as const) {
        test(`a light-only rebrand stays light-only: ${order}, OS ${os}, attribute ${attribute ?? 'none'}`, async ({ page }) => {
            await themedPage(page, HOST_LIGHT_ONLY, order, os, attribute);
            expect(await cssVar(page, 'aparte-chat', '--aparte-primary')).toBe(primary);
            expect(await cssVar(page, 'aparte-chat', '--aparte-surface-1')).toBe(surface);
        });
    }
}

/*
 * A forced-light element inside the page. `data-aparte-theme="light"` puts core's light palette
 * ON the element that carries it, so a rebrand written on `:root` alone is replaced there — the
 * guide's rule is to name `[data-aparte-theme="light"]` beside `:root`. This holds that rule for a
 * panel that is not the root, whichever sheet loads first and whatever the system says.
 */
for (const order of ['host after core', 'host before core (Vite dev)'] as const) {
    for (const os of ['light', 'dark'] as const) {
        test(`a light rebrand reaches a chat in a forced-light panel when it names the attribute: ${order}, OS ${os}`, async ({ page }) => {
            const read = async (host: string) => {
                const sheets = order === 'host after core' ? [CORE_THEME, host] : [host, CORE_THEME];
                await page.setContent(`<!doctype html><html><head>${sheets.map((css) => `<style>${css}</style>`).join('')}</head><body><div data-aparte-theme="light"><aparte-chat></aparte-chat></div></body></html>`);
                await page.emulateMedia({ colorScheme: os });
                return cssVar(page, 'aparte-chat', '--aparte-primary');
            };
            expect(await read(`:root, [data-aparte-theme="light"] { --aparte-primary: ${HOST_LIGHT}; }`), 'the documented form').toBe(HOST_LIGHT);
            expect(await read(`:root { --aparte-primary: ${HOST_LIGHT}; }`), 'the root alone is replaced on the panel — why the guide names the attribute').not.toBe(HOST_LIGHT);
        });
    }
}

/*
 * The menu's check mark. Every item of a panel that holds a checkable one keeps a gutter,
 * as a hidden glyph, so the labels share one edge — and the rule that does it weighs
 * (0,4,1), because `:has()` takes the weight of its argument. The rule that shows the glyph
 * on the checked item weighed (0,2,1) and lost: no menu showed which item was checked, the
 * kit's own example included. Only a browser resolves that cascade.
 */
test('a checked menu item shows its check; the others keep the gutter', async ({ page }) => {
    const marks = await page.evaluate(() => {
        const menu = document.createElement('div');
        menu.className = 'aparte-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML =
            '<button class="aparte-menu__item" role="menuitemradio" aria-checked="true">Ask</button>' +
            '<button class="aparte-menu__item" role="menuitemradio" aria-checked="false">Auto</button>' +
            '<button class="aparte-menu__item" role="menuitem">Copy</button>';
        document.body.appendChild(menu);
        return [...menu.children].map((item) => {
            const mark = getComputedStyle(item, '::before');
            return { content: mark.content, visibility: mark.visibility };
        });
    });
    expect(marks[0]!.visibility, 'the checked item shows its check').toBe('visible');
    for (const mark of marks) expect(mark.content, 'every item keeps the gutter').not.toBe('none');
    expect(marks[1]!.visibility).toBe('hidden');
    expect(marks[2]!.visibility).toBe('hidden');
});

/*
 * A message's ink, on the words. `--aparte-message-content-text-user` coloured the user's
 * box, and the text inside painted `--aparte-content-color` over it, so the token reached no
 * word. The relation tested: the words take the role's token, and without it the content
 * colour wherever it is set, the message included.
 */
test("a role's ink reaches its words, and a content colour set on one message still does", async ({ page }) => {
    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'ink-u', role: 'user', content: 'mine', timestamp: Date.now() });
        vp.appendMessage({ id: 'ink-a', role: 'assistant', content: 'theirs', timestamp: Date.now() });
    });
    const words = (role: string) => page.evaluate((r) => {
        const el = document.querySelector(`aparte-chat-bubble[data-role="${r}"] .aparte-content`);
        if (!el) throw new Error(`no ${r} text`);
        return getComputedStyle(el).color;
    }, role);
    await expect.poll(() => words('user')).not.toBe('');
    const assistantBefore = await words('assistant');

    await page.evaluate(() => (document.querySelector('aparte-chat') as HTMLElement).style.setProperty('--aparte-message-content-text-user', 'rgb(1, 2, 3)'));
    expect(await words('user'), "the user's token reaches the user's words").toBe('rgb(1, 2, 3)');
    expect(await words('assistant'), "and only the user's").toBe(assistantBefore);

    await page.evaluate(() => {
        (document.querySelector('aparte-chat') as HTMLElement).style.removeProperty('--aparte-message-content-text-user');
        const message = document.querySelector('aparte-chat-bubble[data-role="user"] .aparte-message') as HTMLElement;
        // No role token here, whatever the page's skin says (the example's sets one): `initial`
        // is the guaranteed-invalid value, so the fallback is what the words read.
        message.style.setProperty('--aparte-message-content-text-user', 'initial');
        message.style.setProperty('--aparte-content-color', 'rgb(4, 5, 6)');
    });
    expect(await words('user'), 'a content colour scoped on one message still reaches its words').toBe('rgb(4, 5, 6)');
});

test("the assistant's box takes its own padding token, none by default", async ({ page }) => {
    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'pad-a', role: 'assistant', content: 'theirs', timestamp: Date.now() });
    });
    const padding = () => page.evaluate(() => {
        const box = document.querySelector('aparte-chat-bubble[data-role="assistant"] .aparte-message-content');
        if (!box) throw new Error('no assistant box');
        return getComputedStyle(box).paddingTop;
    });
    await expect.poll(padding).toBe('0px');
    await page.evaluate(() => (document.querySelector('aparte-chat') as HTMLElement).style.setProperty('--aparte-message-content-padding-assistant', '7px'));
    expect(await padding()).toBe('7px');
});

/*
 * The compaction notice. Its ground and ink were properties on the box at (0,2,1), under the
 * role's rule at (0,3,0): the notice wore the user's bubble. Compared with probes that read the
 * intended tokens in the same chat, so a palette change does not redden it.
 */
test('the compaction notice is drawn muted, not as the user bubble', async ({ page }) => {
    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'cmp', role: 'user', content: 'Summary of the earlier turns.', timestamp: Date.now(), compaction: true });
    });
    await expect(page.locator('aparte-chat-bubble[data-kind="compaction"] .aparte-content')).toHaveText(/Summary/);
    const drawn = await page.evaluate(() => {
        const bubble = document.querySelector('aparte-chat-bubble[data-kind="compaction"]')!;
        const probe = document.createElement('div');
        probe.style.cssText = 'background: var(--aparte-surface-2); color: var(--aparte-text-muted); font-size: var(--aparte-font-size-sm)';
        document.querySelector('aparte-chat')!.appendChild(probe);
        const want = getComputedStyle(probe);
        const box = getComputedStyle(bubble.querySelector('.aparte-message-content')!);
        const words = getComputedStyle(bubble.querySelector('.aparte-content')!);
        const out = {
            bg: [box.backgroundColor, want.backgroundColor],
            ink: [words.color, want.color],
            size: [words.fontSize, want.fontSize],
        };
        probe.remove();
        return out;
    });
    expect(drawn.bg[0], 'the muted ground').toBe(drawn.bg[1]);
    expect(drawn.ink[0], 'the muted ink, on the words').toBe(drawn.ink[1]);
    expect(drawn.size[0], 'the small size, on the words').toBe(drawn.size[1]);
});

/*
 * The mark on a menu row. The row's own transparent ground (same weight, later sheet) erased the
 * mark's tint, and in a checkable menu the mark's bar and the check gutter shared `::before`:
 * the gutter left the flow and the marked row's label moved to the start edge.
 */
test('a marked menu row shows the tint, and keeps the check gutter in a checkable menu', async ({ page }) => {
    const drawn = await page.evaluate(() => {
        const host = document.querySelector('aparte-chat')!;
        const reference = document.createElement('div');
        reference.className = 'aparte-mark';
        const plain = document.createElement('div');
        plain.className = 'aparte-menu';
        plain.setAttribute('role', 'menu');
        plain.innerHTML = '<button class="aparte-menu__item aparte-mark" role="menuitem">Here</button>';
        const checkable = document.createElement('div');
        checkable.className = 'aparte-menu';
        checkable.setAttribute('role', 'menu');
        checkable.innerHTML =
            '<button class="aparte-menu__item aparte-mark" role="menuitemradio" aria-checked="true"><span>Ask</span></button>' +
            '<button class="aparte-menu__item" role="menuitemradio" aria-checked="false"><span>Auto</span></button>' +
            // A quiet mark hides its bar (`::before { display: none }`) — not the check gutter.
            '<button class="aparte-menu__item aparte-mark aparte-mark--quiet" role="menuitemradio" aria-checked="false"><span>Plan</span></button>';
        host.append(reference, plain, checkable);
        const [marked, other, quiet] = [...checkable.querySelectorAll('span')].map((s) => s.getBoundingClientRect().left);
        const out = {
            tint: getComputedStyle(reference).backgroundColor,
            row: getComputedStyle(plain.firstElementChild!).backgroundColor,
            checkedRow: getComputedStyle(checkable.firstElementChild!).backgroundColor,
            labels: [marked, other, quiet],
            check: getComputedStyle(checkable.firstElementChild!, '::before').visibility,
        };
        reference.remove(); plain.remove(); checkable.remove();
        return out;
    });
    expect(drawn.tint, 'the mark has a tint to compare with').not.toBe('rgba(0, 0, 0, 0)');
    expect(drawn.row, 'a marked menu row wears it').toBe(drawn.tint);
    expect(drawn.checkedRow).toBe(drawn.tint);
    expect(drawn.labels[0], 'the marked row keeps the gutter: both labels share one edge').toBeCloseTo(drawn.labels[1]!, 0);
    expect(drawn.labels[2], 'a quiet marked row keeps it too').toBeCloseTo(drawn.labels[1]!, 0);
    expect(drawn.check, 'and shows its check').toBe('visible');
});

/*
 * A picture from the stylesheet alone. The slot is hidden while empty, so
 * `--aparte-avatar-image-assistant` painted nothing without a provider writing into it.
 */
test('an avatar picture named in the stylesheet alone shows, for its role only', async ({ page }, testInfo) => {
    // The example's skin hides every message avatar (the product it copies has none);
    // vanilla-dist wears no skin, so only there is the slot core's to show.
    test.skip(!testInfo.project.name.startsWith('vanilla-dist'), "the vanilla example's skin hides avatars");
    await page.evaluate(() => {
        (document.querySelector('aparte-chat') as HTMLElement).style.setProperty(
            '--aparte-avatar-image-assistant',
            `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E")`,
        );
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'av-u', role: 'user', content: 'mine', timestamp: Date.now() });
        vp.appendMessage({ id: 'av-a', role: 'assistant', content: 'theirs', timestamp: Date.now() });
    });
    const avatar = (role: string) => page.evaluate((r) => {
        const el = document.querySelector(`aparte-chat-bubble[data-role="${r}"] .aparte-avatar`);
        if (!el) throw new Error(`no ${r} avatar slot`);
        const s = getComputedStyle(el);
        return { display: s.display, width: el.getBoundingClientRect().width, image: s.backgroundImage };
    }, role);
    await expect.poll(async () => (await avatar('assistant')).display).not.toBe('none');
    const assistant = await avatar('assistant');
    expect(assistant.width, 'the slot takes its size').toBeGreaterThan(0);
    expect(assistant.image, 'and paints the picture').toContain('data:image/svg+xml');
    expect((await avatar('user')).display, "the user's token is none: no slot").toBe('none');
});

/*
 * The role's ink and the assistant's padding go through tokens, not heavier rules: a host's
 * one-class rule on the words, or its padding on the box, wins as it did before them.
 */
test("a host's own rule on the words and on the box still wins", async ({ page }) => {
    await page.evaluate(() => {
        // The padding BEFORE core's sheets (the Vite dev order), the colour after them.
        const early = document.createElement('style');
        early.textContent = 'aparte-chat .aparte-message-content { padding: 11px; }';
        document.head.prepend(early);
        const late = document.createElement('style');
        late.textContent = '.aparte-content { color: rgb(7, 8, 9); }';
        document.head.append(late);
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'own-u', role: 'user', content: 'mine', timestamp: Date.now() });
        vp.appendMessage({ id: 'own-a', role: 'assistant', content: 'theirs', timestamp: Date.now() });
    });
    await expect(page.locator('aparte-chat-bubble[data-role="assistant"] .aparte-content')).toHaveText(/theirs/);
    const drawn = await page.evaluate(() => {
        const of = (role: string, sel: string) => getComputedStyle(document.querySelector(`aparte-chat-bubble[data-role="${role}"] ${sel}`)!);
        return { user: of('user', '.aparte-content').color, assistant: of('assistant', '.aparte-content').color, pad: of('assistant', '.aparte-message-content').paddingTop };
    });
    expect(drawn.user, "the host's colour on the user's words").toBe('rgb(7, 8, 9)');
    expect(drawn.assistant, "and on the assistant's").toBe('rgb(7, 8, 9)');
    expect(drawn.pad, "the host's padding reaches the assistant's box").toBe('11px');
});

/*
 * Compact density on demand. The narrow container tightened the messages under 520px only, so
 * a widget wider than that had no switch for the same measures.
 */
test('aparte-chat--compact tightens the messages at any width', async ({ page }) => {
    const read = () => page.evaluate(() => {
        const chat = document.querySelector('aparte-chat') as HTMLElement;
        const message = chat.querySelector('aparte-chat-bubble .aparte-message') as HTMLElement;
        const probe = document.createElement('div');
        probe.style.cssText = 'padding-top: var(--aparte-space-6)';
        chat.appendChild(probe);
        const out = { message: getComputedStyle(message).paddingTop, compact: getComputedStyle(probe).paddingTop };
        probe.remove();
        return out;
    });
    await page.evaluate(() => {
        const vp = document.querySelector('aparte-chat-viewport') as unknown as { appendMessage(m: object): void };
        vp.appendMessage({ id: 'cmp-a', role: 'assistant', content: 'a reply', timestamp: Date.now() });
    });
    await expect(page.locator('aparte-chat-bubble .aparte-message').first()).toBeVisible();
    const before = await read();
    expect(before.message, 'the wide default first').not.toBe(before.compact);
    await page.evaluate(() => document.querySelector('aparte-chat')!.classList.add('aparte-chat--compact'));
    const after = await read();
    expect(after.message).toBe(after.compact);
});

/*
 * An option's second line goes under the label AND the status dot. The dot is appended as the
 * option's last child, after the meta line, so with the meta taking a whole line of its own
 * the dot fell alone onto a third one.
 */
test('an option with a meta line and a status dot keeps the dot beside its label', async ({ page }) => {
    const rows = await page.evaluate(async () => {
        const host = document.querySelector('aparte-chat')!;
        const option = document.createElement('aparte-option');
        option.setAttribute('value', 'x');
        option.innerHTML = 'Model name<span class="aparte-option__meta">Long documents · 128K context</span>';
        option.setAttribute('data-status', 'ready');
        option.style.width = '320px';
        host.append(option);
        await new Promise((r) => requestAnimationFrame(r));
        const dot = option.querySelector('.aparte-status-dot')!.getBoundingClientRect();
        const meta = option.querySelector('.aparte-option__meta')!.getBoundingClientRect();
        option.remove();
        return { dotTop: dot.top, dotBottom: dot.bottom, metaTop: meta.top };
    });
    expect(rows.dotBottom, 'the dot sits on the label line, above the meta line').toBeLessThanOrEqual(rows.metaTop + 1);
});
