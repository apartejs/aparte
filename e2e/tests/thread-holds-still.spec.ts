/**
 * A scrolled thread holds still while a reply reasons: the person's message never goes up and
 * down. On every example, because the space kept under the reply is computed by core in raw
 * core and kept by each framework's render under a wrapper.
 *
 * It moved, a pixel each way, on every delta of a reasoning block that grew nothing on screen
 * (closed), under every wrapper (apartejs/aparte#270): the space was kept as a fraction and read
 * against a `scrollHeight` the browser gives in whole pixels, so it never settled. Nothing saw
 * it: jsdom lays nothing out, the browser specs read once the reply was done or with a tolerance
 * of a pixel or more, and a first exchange cannot show it (the space under the reply takes every
 * change of its height). So: the second exchange, in a window shorter than the exchange, every
 * frame, at half a pixel.
 *
 * Three ways reasoning streams: the reply's own block, closed as it arrives; a sub-agent's under
 * its line, closed; the same line open (`?subagent-transcript`). The reasoning is paced like a
 * small local model's (`SLOW_REASONING`, apps/examples/_shared/slow-reasoning.ts).
 *
 * Each was seen to fail: on 1.15.0 under the React wrapper, and in raw core with a renderer
 * made to nudge the thread's scroll by three pixels one way then the other on every delta.
 */
import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { framesOf, reversals, threadScrollTop, watchFrames, whileWritten, type ReasoningAt } from '../helpers/frames.js';

interface Case {
    name: string;
    url: string;
    prompt: string;
    /** Text the reply ends with, once it is done. */
    done: string;
    at: ReasoningAt;
    open: boolean;
}

const CASES: Case[] = [
    { name: 'the reply\'s own reasoning, closed', url: '/?scenario', prompt: 'Reason it through slowly.', done: 'worth a look before the release', at: 'reply', open: false },
    { name: 'a sub-agent\'s reasoning, its line closed', url: '/?scenario&subagent-transcript', prompt: 'Have a sub-agent check two files.', done: 'One of the two files is missing', at: 'line', open: false },
    { name: 'a sub-agent\'s reasoning, its line open', url: '/?scenario&subagent-transcript', prompt: 'Have a sub-agent check two files.', done: 'One of the two files is missing', at: 'line', open: true },
];

async function exchange(chat: ChatPage, c: Case): Promise<void> {
    await chat.send(c.prompt);
    await expect(chat.lastReply).toContainText(c.done, { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
}

async function frames(page: Page, chat: ChatPage, c: Case) {
    const before = await chat.bubbles('assistant').count();
    await watchFrames(page, c.at);
    await chat.send(c.prompt);
    // The new reply, before `lastReply` is read: until it is there, that is the previous one.
    await expect(chat.bubbles('assistant')).toHaveCount(before + 1);
    if (c.open) {
        await chat.toolRowSummary(chat.toolRows().first()).click();
        await expect(chat.segment('thinking').last()).toBeVisible();
    }
    await expect(chat.lastReply).toContainText(c.done, { timeout: 20_000 });
    await expect(chat.streaming()).toHaveCount(0);
    // Open, from the frame the line is open: opening it is the person's act, and the thread
    // making room for what it shows is not the reasoning moving it.
    return whileWritten(await framesOf(page)).filter((f) => !c.open || f.lineOpen);
}

for (const c of CASES) {
    test(`a scrolled thread holds still while it streams: ${c.name}`, async ({ page }) => {
        const errors = collectPageErrors(page);
        await page.setViewportSize({ width: 1000, height: 520 });
        const chat = new ChatPage(page);
        await page.goto(c.url);
        // Exchanges until the thread scrolls: a short one (a closed block and a line of text)
        // fits in the window twice over.
        for (let n = 0; n < 4; n++) {
            await exchange(chat, c);
            if (await threadScrollTop(page) > 0) break;
        }
        const written = await frames(page, chat, c);
        // A few frames are enough to see a direction change. WebKit on the CI machine draws
        // few of them, fewer still after the click that opens the line: 9 in one run.
        expect(written.length, 'frames read while the reasoning was written').toBeGreaterThan(4);
        expect(Math.min(...written.map((f) => f.scrollTop)), 'the thread scrolled while the reasoning was written').toBeGreaterThan(0);
        expect(reversals(written), 'the person\'s message, frame by frame').toEqual([]);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
}
