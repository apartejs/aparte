/*
 * Rasterizes public/favicon.svg into the icons that SVG alone can't cover:
 *
 *   public/favicon.ico          16 + 32 + 48 px, PNG payloads
 *   public/apple-touch-icon.png 180 px (iOS home screen, and a safe raster for
 *                               crawlers that skip SVG)
 *
 * The SVG is the source of truth (and what modern browsers use). This exists
 * because search engines and older clients want a raster, and because the mascot
 * is drawn with a serif GLYPH — so rasterizing it needs a real font renderer, not
 * geometry.
 *
 * No new dependency: it borrows the Chromium that the e2e workspace already
 * installs. Which is also why it is NOT wired into any build — run it by hand when
 * the mascot changes:
 *
 *   node apps/docs/scripts/gen-favicon.mjs      (from the repo root)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Borrowed, not depended on: resolve Playwright from the e2e workspace (the only
// package that declares it) rather than adding a browser to the docs' dependencies.
// ESM resolution is relative to THIS file, so it needs an explicit base.
const { chromium } = createRequire(resolve(here, '../../../e2e/package.json'))('@playwright/test');
const PUBLIC = resolve(here, '../public');
const SVG = readFileSync(resolve(PUBLIC, 'favicon.svg'), 'utf8');

const ICO_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;

/** Screenshot the SVG at `size`×`size`, as a PNG buffer. */
async function render(page, size) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
        `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px">`
        + `<div style="width:${size}px;height:${size}px">${SVG}</div></body></html>`,
        { waitUntil: 'load' },
    );
    // The glyph needs the font resolved before we capture it — a serif fallback
    // would change the mascot's shape. This callback is serialized and runs in the
    // BROWSER, which is why `document` isn't a Node global here.
    // eslint-disable-next-line no-undef -- browser scope, not Node's
    await page.evaluate(() => document.fonts.ready);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** Pack PNG buffers into an .ico (the format accepts PNG payloads since Vista). */
function buildIco(images) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);              // reserved
    header.writeUInt16LE(1, 2);              // type: icon
    header.writeUInt16LE(images.length, 4);  // image count

    const directory = [];
    let offset = 6 + images.length * 16;
    for (const { size, png } of images) {
        const entry = Buffer.alloc(16);
        entry[0] = size === 256 ? 0 : size;   // width  (0 means 256)
        entry[1] = size === 256 ? 0 : size;   // height
        entry[2] = 0;                         // palette size
        entry[3] = 0;                         // reserved
        entry.writeUInt16LE(1, 4);            // colour planes
        entry.writeUInt16LE(32, 6);           // bits per pixel
        entry.writeUInt32LE(png.length, 8);
        entry.writeUInt32LE(offset, 12);
        directory.push(entry);
        offset += png.length;
    }

    return Buffer.concat([header, ...directory, ...images.map((i) => i.png)]);
}

const browser = await chromium.launch();
try {
    const page = await browser.newPage();

    const images = [];
    for (const size of ICO_SIZES) images.push({ size, png: await render(page, size) });
    writeFileSync(resolve(PUBLIC, 'favicon.ico'), buildIco(images));
    console.log(`[gen-favicon] favicon.ico — ${ICO_SIZES.join(' + ')}px`);

    writeFileSync(resolve(PUBLIC, 'apple-touch-icon.png'), await render(page, TOUCH_SIZE));
    console.log(`[gen-favicon] apple-touch-icon.png — ${TOUCH_SIZE}px`);
} finally {
    await browser.close();
}
