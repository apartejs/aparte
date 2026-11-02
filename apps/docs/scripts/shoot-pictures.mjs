/**
 * Pictures of what each plugin draws, taken from the live demos, for the places that cannot run
 * one: the plugin's README on npm and on GitHub.
 *
 * A README shows an image, not a frame, and a plugin that draws a formula or a chart is easiest to
 * judge by looking at one. This writes, per plugin:
 *
 *   public/shots/<name>.png        light, the element alone
 *   public/shots/<name>-dark.png   dark, the same
 *
 * for marked, streaming-markdown, katex, mermaid, echarts, chartjs, approval, ask-user, artifacts,
 * model-selector, shiki and compaction. Each is one demo of the docs (see SHOTS below); a menu that has to be open to show
 * anything is opened here, the way a reader would.
 *
 * The method is the cards' (shoot-cards.mjs): the demo in a fixed clock, English and one time zone,
 * at twice the pixels, left to settle, everything else on the page hidden, then a clip with a 24 px
 * margin. The viewport is narrower than the cards', so text and charts stay legible when a README
 * shows the picture at 420 px.
 *
 * Run it against a docs server (`pnpm run docs`, or a built site under `astro preview`) after a
 * plugin's look changes, and commit the pictures:
 *
 *   node apps/docs/scripts/shoot-pictures.mjs [base-url] [name …]     (default http://localhost:4321, all)
 *
 * Playwright comes from the e2e workspace, which installs it with its browsers.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, newShotPage, openDemo, settle, shootElement } from './lib/shoot.mjs';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DOCS, 'public/shots');
const args = process.argv.slice(2);
const BASE = (args.find((arg) => arg.startsWith('http')) ?? 'http://localhost:4321').replace(/\/$/, '');
const ONLY = args.filter((arg) => !arg.startsWith('http'));

/** The assistant's answer without the name over it, the whole of it rather than the last screen. */
const REPLY = 'aparte-chat-bubble[data-role="assistant"] .aparte-segments';
const TALL = 'aparte-chat-viewport { height: auto !important }';
/** A select keeps its longest label's width in hidden text; showing everything must not show that. */
const SIZER = '.aparte-select-label-sizer, .aparte-select-label-sizer * { visibility: hidden !important }';

/** Opens a select the way a reader does, and every group it holds. */
async function openSelect(page, host) {
    await page.locator(`${host} .aparte-select-trigger`).click();
    for (const header of await page.locator(`${host} .aparte-optgroup-header`).all()) await header.click();
}

/** The artifact card opens on its code; the picture shows what a reader came for, the preview. */
async function showPreview(page) {
    await page.locator('[data-tab-target="preview"]').click();
    await page.locator('[data-pane="preview"] iframe').waitFor();
    await page.waitForTimeout(1200);
}

/**
 * name   the file, and the plugin
 * demo   the docs demo it is taken from
 * target what is in the picture; `ready` must be inside it before it is shot
 * width  the window's width, 520 unless the picture needs more room (a separator that must stay on one line)
 * css    added to the page (a viewport with a fixed height would cut the reply)
 * act    what a reader does first; `include` selectors are in the picture too (a menu that opens
 *        past the element that holds it)
 */
const SHOTS = [
    { name: 'marked', demo: 'response', target: REPLY, ready: 'table' },
    // The same finished reply as marked's: what the two renderers draw is the same, and one is not a picture of motion.
    { name: 'streaming-markdown', demo: 'response', target: REPLY, ready: 'table' },
    { name: 'katex', demo: 'math-streaming', target: REPLY, ready: '.katex' },
    { name: 'mermaid', demo: 'diagram-streaming', target: REPLY, ready: 'svg' },
    { name: 'echarts', demo: 'chart-echarts', target: REPLY, ready: 'canvas, svg', css: TALL },
    { name: 'chartjs', demo: 'chart-chartjs', target: REPLY, ready: 'canvas' },
    { name: 'approval', demo: 'approval-mode', target: 'aparte-composer', include: ['aparte-approval-mode .aparte-select-dropdown'], css: SIZER, act: (page) => openSelect(page, 'aparte-approval-mode') },
    { name: 'ask-user', demo: 'question', target: 'aparte-composer', ready: '.aparte-elic-panel' },
    // The preview frame is a fixed 480 px; the demo's page is short, so the picture was mostly
    // empty frame. The documented knob sets it to what the page needs.
    { name: 'artifacts', demo: 'artifact', target: REPLY, act: showPreview, css: 'aparte-chat-bubble { --aparte-artifact-frame-height: 300px; }' },
    { name: 'model-selector', demo: 'model-selector', target: 'aparte-composer', include: ['aparte-model-selector .aparte-select-dropdown'], css: SIZER, act: (page) => openSelect(page, 'aparte-model-selector') },
    { name: 'shiki', demo: 'code-block', target: REPLY, ready: 'pre span[style]' },
    { name: 'compaction', demo: 'compaction-notice', target: 'aparte-chat-viewport', css: TALL, width: 640 },
];

async function shoot(page, { demo, target, ready, css, act, include, width = 520 }, scheme) {
    await page.setViewportSize({ width, height: 900 });
    await openDemo(page, BASE, demo, scheme);
    await settle(page, target, ready);
    await act?.(page);
    return shootElement(page, target, { css, include });
}

async function main() {
    const shots = SHOTS.filter(({ name }) => !ONLY.length || ONLY.includes(name));
    if (!shots.length) throw new Error(`no such picture: ${ONLY.join(', ')}`);
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const page = await newShotPage(browser, { width: 520, height: 900 });
    for (const shot of shots) {
        writeFileSync(join(OUT, `${shot.name}.png`), await shoot(page, shot, 'light'));
        writeFileSync(join(OUT, `${shot.name}-dark.png`), await shoot(page, shot, 'dark'));
        console.log(`[shoot-pictures] ${shot.name} (${shot.demo})`);
    }
    await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
