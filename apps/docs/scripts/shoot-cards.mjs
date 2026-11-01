/**
 * Pictures of every card, taken from the live demos, for the places that cannot run one.
 *
 * Why: asked whether aparté draws weather cards, an assistant answered with image-search
 * results — other sites' widgets, under a badge saying "native to aparté". It found none of
 * ours. The card pages are live demos in frames (no `<img>` to index), their og:image was a
 * title card, and the plugin's README had no picture. This writes, per card page:
 *
 *   public/cards/<card>.png        light, the card alone — the page's poster, the README
 *   public/cards/<card>-dark.png   dark, the same
 *   public/cards/<card>-og.png     1200×630, the dark card on the brand's stage — the og:image
 *
 * and for the landing's `<Variant … poster="reply">`, the reply it draws (a card, a formula, a
 * chart) in public/cards/reply.png and reply-dark.png — the landing keeps its own og:image.
 *
 * The demo shot is the page's `<Variant … poster="<card>">`, the one the picture sits under, so
 * the two cannot disagree.
 *
 * Run it against a docs server (`pnpm run docs`, or a built site under `astro preview`) after a
 * card's look changes, and commit the pictures:
 *
 *   node apps/docs/scripts/shoot-cards.mjs [base-url]     (default http://localhost:4321)
 *
 * Playwright comes from the e2e workspace, which installs it with its browsers.
 */
// The functions passed to `page.evaluate` and `waitForFunction` run in the page.
/* global document, window, performance */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(DOCS, '../../e2e/package.json'));
const { chromium } = require('@playwright/test');

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const PAGES = join(DOCS, 'src/content/docs/components');
const OUT = join(DOCS, 'public/cards');

/** `[{ card: 'weather', title: 'Weather card', demo: 'card-weather' }]`, from the pages themselves. */
export function cardPages() {
    return readdirSync(PAGES)
        .filter((file) => file.endsWith('-card.mdx'))
        .map((file) => {
            const source = readFileSync(join(PAGES, file), 'utf8');
            const card = file.replace(/-card\.mdx$/, '');
            const demo = new RegExp(`<Variant id="([\\w-]+)" poster="${card}"`).exec(source)?.[1];
            const title = /^title:\s*(.+)$/m.exec(source)?.[1]?.trim();
            if (!demo || !title) throw new Error(`${file}: no <Variant poster="${card}"> or no title`);
            return { card, title, demo };
        });
}

/** The landing's reply: the segments of its answer, without the name and time over them. */
export function landingShot() {
    const source = readFileSync(join(DOCS, 'src/pages/index.astro'), 'utf8');
    const demo = /<Variant id="([\w-]+)"[^>]*poster="reply"/.exec(source)?.[1];
    if (!demo) throw new Error('index.astro: no <Variant poster="reply">');
    // The whole reply, not the last 36rem the viewport scrolls to.
    return { card: 'reply', demo, target: 'aparte-chat-bubble[data-role="assistant"] .aparte-segments', css: 'aparte-chat-viewport { height: auto !important }' };
}

/** Room around the card, so its shadow is in the picture rather than cut at the border. */
const MARGIN = 24;

async function shootCard(page, demo, scheme, target = '.aparte-rich-card', css = '') {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/preview/demo/${demo}/`, { waitUntil: 'networkidle' });
    const card = page.locator(target).last();
    await card.waitFor();
    // A reply that streams draws its card as a skeleton first: wait for it to settle, then
    // for nothing in it to change for a second.
    await page.waitForFunction((sel) => {
        const el = [...document.querySelectorAll(sel)].pop();
        if (!el || el.querySelector('.aparte-skeleton')) return false;
        const now = el.innerHTML;
        const settled = window.__shotLast === now && performance.now() - window.__shotSince > 1000;
        if (window.__shotLast !== now) Object.assign(window, { __shotLast: now, __shotSince: performance.now() });
        return settled;
    }, target, { polling: 200, timeout: 30_000 });
    // The card alone: the message's name and time around it would date the picture.
    await page.addStyleTag({ content: `body * { visibility: hidden } :is(${target}), :is(${target}) * { visibility: visible } ${css}` });
    // Pictures (a map's tiles, a product's photo) and the fonts, before the shutter.
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
    });
    await page.waitForTimeout(400);
    const box = await card.boundingBox();
    if (!box) throw new Error(`${demo}: the card has no box`);
    // The whole page, so a reply taller than the window is not cut at its bottom edge.
    return page.screenshot({
        fullPage: true,
        clip: { x: Math.max(0, box.x - MARGIN), y: Math.max(0, box.y - MARGIN), width: box.width + 2 * MARGIN, height: box.height + 2 * MARGIN },
    });
}

/** The card on the brand's stage (the og route's colours), its name under it. */
function stage(png, title) {
    return `<!doctype html><html><head><style>
        html, body { margin: 0; width: 1200px; height: 630px; }
        body { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 48px; padding: 0 72px;
            box-sizing: border-box; background: linear-gradient(135deg, rgb(23 20 28), rgb(33 27 40));
            border-inline-start: 12px solid rgb(217 162 75); font-family: system-ui, sans-serif; }
        h1 { margin: 0; font-size: 56px; line-height: 1.1; color: rgb(242 238 231); font-weight: 650; }
        p { margin: 16px 0 0; font-size: 24px; color: rgb(168 155 182); white-space: nowrap; }
        img { display: block; max-height: 540px; max-width: 600px; border-radius: 20px; }
    </style></head><body>
        <div><h1>${title}</h1><p>aparté · @aparte/plugin-cards</p></div>
        <img src="data:image/png;base64,${png.toString('base64')}">
    </body></html>`;
}

async function main() {
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    // English dates and numbers, and one time zone, whatever the machine: the cards format with `Intl`.
    const page = await browser.newPage({ viewport: { width: 720, height: 1000 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Europe/Paris' });
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const { card, title, demo } of cardPages()) {
        const dark = await shootCard(page, demo, 'dark');
        writeFileSync(join(OUT, `${card}.png`), await shootCard(page, demo, 'light'));
        writeFileSync(join(OUT, `${card}-dark.png`), dark);
        await og.setContent(stage(dark, title));
        await og.evaluate(() => document.images[0].decode());
        writeFileSync(join(OUT, `${card}-og.png`), await og.screenshot());
        console.log(`[shoot-cards] ${card} (${demo})`);
    }
    const { card, demo, target, css } = landingShot();
    writeFileSync(join(OUT, `${card}.png`), await shootCard(page, demo, 'light', target, css));
    writeFileSync(join(OUT, `${card}-dark.png`), await shootCard(page, demo, 'dark', target, css));
    console.log(`[shoot-cards] ${card} (${demo}, the landing)`);
    await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
