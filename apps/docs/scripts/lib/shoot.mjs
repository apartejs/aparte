/**
 * What the picture scripts (`shoot-cards.mjs`, `shoot-pictures.mjs`) share: one browser set up
 * the same way, a demo opened and left to settle, and the element alone shot with room around it.
 *
 * Playwright comes from the e2e workspace, which installs it with its browsers.
 */
// The functions passed to `page.evaluate` and `waitForFunction` run in the page.
/* global document, window, performance */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(DOCS, '../../e2e/package.json'));
export const { chromium } = require('@playwright/test');

// A weekday afternoon, just after the hour.
export const SHOT_AT = new Date('2026-11-03T14:05:00+01:00');

/** Room around the element, so its shadow is in the picture rather than cut at the border. */
export const MARGIN = 24;

/**
 * A page that draws the same whatever the machine: English dates and numbers, one time zone, and
 * one moment, whenever it runs. The demos date everything from `Date.now()`, and a run at 23:00
 * drew a forecast of night hours under a sun. Timers keep running, so a demo still settles.
 */
export async function newShotPage(browser, viewport = { width: 720, height: 1000 }) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Europe/Paris' });
    await page.clock.setFixedTime(SHOT_AT);
    return page;
}

/** The demo's own page, in one colour scheme, with motion off. */
export async function openDemo(page, base, demo, scheme) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(`${base}/preview/demo/${demo}/`, { waitUntil: 'networkidle' });
}

/**
 * Waits for the last match of `target` to exist, to hold no skeleton, and to stay unchanged for a
 * second. `ready` is an extra selector that must be inside it first (the `svg` of a diagram that
 * is still loading its library). Returns the locator.
 */
export async function settle(page, target, ready = '') {
    const el = page.locator(target).last();
    await el.waitFor();
    await page.waitForFunction(({ sel, ready }) => {
        const el = [...document.querySelectorAll(sel)].pop();
        if (!el || el.querySelector('.aparte-skeleton')) return false;
        if (ready && !el.querySelector(ready)) return false;
        const now = el.innerHTML;
        const settled = window.__shotLast === now && performance.now() - window.__shotSince > 1000;
        if (window.__shotLast !== now) Object.assign(window, { __shotLast: now, __shotSince: performance.now() });
        return settled;
    }, { sel: target, ready }, { polling: 200, timeout: 30_000 });
    return el;
}

/**
 * The element alone: everything else on the page hidden (the message's name and time around a
 * card would date the picture), the pictures and fonts loaded, then a shot of the element with
 * MARGIN around it. `include` lists selectors inside the page whose boxes the shot must hold
 * too, for something that opens beyond its parent (a menu); `css` is added to the page.
 */
export async function shootElement(page, target, { css = '', include = [] } = {}) {
    const el = page.locator(target).last();
    await page.addStyleTag({ content: `body * { visibility: hidden } :is(${target}), :is(${target}) * { visibility: visible } ${css}` });
    // Pictures (a map's tiles, a product's photo) and the fonts, before the shutter.
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
    });
    await page.waitForTimeout(400);
    let box = await el.boundingBox();
    if (!box) throw new Error(`${target}: no box`);
    for (const sel of include) {
        const other = await page.locator(sel).last().boundingBox();
        if (!other) throw new Error(`${sel}: no box`);
        const x = Math.min(box.x, other.x);
        const y = Math.min(box.y, other.y);
        box = { x, y, width: Math.max(box.x + box.width, other.x + other.width) - x, height: Math.max(box.y + box.height, other.y + other.height) - y };
    }
    // The whole page, so an element taller than the window is not cut at its bottom edge.
    return page.screenshot({
        fullPage: true,
        clip: { x: Math.max(0, box.x - MARGIN), y: Math.max(0, box.y - MARGIN), width: box.width + 2 * MARGIN, height: box.height + 2 * MARGIN },
    });
}
