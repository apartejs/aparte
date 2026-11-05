/**
 * The picture at the top of the READMEs: a whole chat, in the middle of a conversation.
 *
 * A README is read before anything is installed, and what it has to show is that this is a
 * complete chat — the conversations beside it, a question, an answer that called a tool and drew
 * its result, the composer under it — not one of those parts on its own. So the picture is the
 * Assistant template as a reader would leave it: a new conversation, the walking-weather question
 * typed and sent, the scripted reply settled (its reasoning, the weather card, the answer). It
 * writes
 *
 *   public/shots/chat.png        light
 *   public/shots/chat-dark.png   dark
 *
 * at twice the pixels and at the fixed clock the other pictures use (`lib/shoot.mjs`). Run it
 * against a docs server (`pnpm run docs`) after the template's look changes, and commit the
 * pictures:
 *
 *   node apps/docs/scripts/shoot-readme.mjs [base-url]     (default http://localhost:4321)
 *
 * Playwright comes from the e2e workspace, which installs it with its browsers.
 */
// The function passed to `page.evaluate` runs in the page.
/* global document */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, newShotPage, settle } from './lib/shoot.mjs';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DOCS, 'public/shots');
const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');

/** The question the template's scripted model answers with the weather card. */
const QUESTION = 'Is it good walking weather in Brennick today? I’d like to do the shore loop.';

/** Wide enough for the sidebar beside a reading column, tall enough for the question, the card and the answer. */
const VIEWPORT = { width: 1280, height: 1000 };

async function shoot(page, scheme) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${BASE}/templates/assistant/`, { waitUntil: 'networkidle' });
    // A conversation of its own, so the title and the sidebar name what the picture shows.
    await page.getByRole('button', { name: 'New chat' }).first().click();
    await page.locator('aparte-composer-input').first().click();
    await page.keyboard.type(QUESTION);
    await page.keyboard.press('Enter');
    await page.locator('.aparte-weather-card').first().waitFor({ timeout: 30_000 });
    await settle(page, 'aparte-chat-bubble[data-role="assistant"]');
    await page.evaluate(async () => { await document.fonts.ready; });
    // The question in view: the reply reads from its top, as a person reads it.
    await page.locator('aparte-chat-bubble[data-role="user"]').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    // The template's app alone, without the docs bar above it.
    return page.locator('.assistant.aparte-app-shell').first().screenshot();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
    for (const scheme of ['light', 'dark']) {
        const page = await newShotPage(browser, VIEWPORT);
        writeFileSync(join(OUT, scheme === 'light' ? 'chat.png' : 'chat-dark.png'), await shoot(page, scheme));
        await page.close();
        console.log(`[shoot-readme] chat, ${scheme}`);
    }
} finally {
    await browser.close();
}
