/**
 * A sub-agent's conversation drawn UNDER its line (`setupSubagents({ details: 'transcript' })`),
 * as a desktop agent draws it: the sub-agent's own calls are tool rows INSIDE the line's row.
 *
 * Nothing drew a row inside a row in a browser before this spec. The plugin's unit suite
 * builds the transcript in jsdom, which has no cascade: a rule keyed on the LINE's state that
 * reaches the rows under it is invisible there, and that is how a failed call in a
 * transcript came to read in the success colour (apartejs/aparte#271).
 *
 * What a person sees:
 * - a call in the transcript looks as the same call looks on its own (its state word's ink and
 *   whether it shows, its name's ink, its target's face, where its chevron sits), whatever the
 *   line around it is doing;
 * - the sub-agent's reasoning reads as in progress for as long as it is written, then says how
 *   long it took;
 * - the thread does not move up and down while that reasoning is written slowly, line closed
 *   or open (apartejs/aparte#270, seen with a local model at a few uneven tokens per second;
 *   the script paces it the same way, see `SLOW_REASONING` in the examples). It shows only in
 *   a thread already scrolled: on a first exchange the space kept under the reply takes every
 *   change of its height, which is why a first attempt at this test could not fail.
 *
 * Each test was seen to fail without what it guards: the comparisons with core's rules scoped
 * to the row's own line (they then pass, so their `fail` marks turn red), the reasoning ones
 * with a renderer made to show the settled heading early, and to nudge the thread's scroll by
 * three pixels one way then the other on every delta (caught closed and open, both engines).
 *
 * The page is the examples' `?scenario&subagent-transcript`; the paths are in
 * `apps/examples/_shared/sub-agents.ts`.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const FILES = 'Have a sub-agent check two files.';
const GATED = 'Have a sub-agent run the build.';
const PANEL = '.aparte-elic-panel.aparte-approval-panel';
const REJECT = '.aparte-approval-option--deny';

async function openSite(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto('/?scenario&subagent-transcript');
    return chat;
}

interface RowLook {
    status: string | null;
    nested: unknown;
    alone: unknown;
}

/**
 * Each row nested in `line`, against the same row drawn alone: a copy of it put right after
 * the line, in the same reply, inside no call. Only what a row's OWN state decides is read,
 * so a difference is the line's state reaching into the row.
 */
function nestedAgainstAlone(line: Locator): Promise<RowLook[]> {
    return line.evaluate((lineEl) => {
        const ROW = '.aparte-segment-tool-call';
        const own = (row: Element, part: string): Element | undefined =>
            [...row.querySelectorAll(part)].find((el) => el.closest(ROW) === row);
        const look = (row: Element) => {
            const read = (part: string, properties: string[]) => {
                const el = own(row, part);
                if (!el) return null;
                const style = getComputedStyle(el);
                return Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(p)]));
            };
            return {
                state: read('.aparte-tool-state', ['color', 'position', 'width']),
                name: read('.aparte-tool-name', ['color']),
                target: read('.aparte-tool-target', ['font-family']),
                toggle: read('.aparte-tool-toggle', ['order']),
            };
        };
        return [...lineEl.querySelectorAll(ROW)].map((row) => {
            const alone = row.cloneNode(true) as Element;
            // Not a second segment of the reply: nothing should look this copy up.
            alone.removeAttribute('data-segment-id');
            lineEl.after(alone);
            const result = { status: row.getAttribute('data-status'), nested: look(row), alone: look(alone) };
            alone.remove();
            return result;
        });
    });
}

function expectEachLooksAsAlone(rows: RowLook[]): void {
    expect(rows.length, 'rows in the transcript').toBeGreaterThan(0);
    for (const row of rows) expect(row.nested, `a ${row.status} call in the transcript, against the same call on its own`).toEqual(row.alone);
}

test.describe('a sub-agent that read a file and failed to read another', () => {
    let chat: ChatPage;
    let errors: string[];

    // The setup is a hook, so a failure here is a red test even where the body below is
    // marked as expected to fail: only the comparison is.
    test.beforeEach(async ({ page }) => {
        errors = collectPageErrors(page);
        chat = await openSite(page);
        await chat.send(FILES);
        await expect(chat.lastReply).toContainText('One of the two files is missing', { timeout: 20_000 });
        await expect(chat.streaming()).toHaveCount(0);
        const line = chat.toolRow('File checker');
        await expect(line).toHaveAttribute('data-status', 'resolved');
        await chat.toolRowSummary(line).click();
        const nested = chat.nestedToolRows(line);
        await expect(nested).toHaveCount(2);
        await expect(nested.nth(0)).toHaveAttribute('data-status', 'resolved');
        await expect(nested.nth(1)).toHaveAttribute('data-status', 'failed');
        await expect(nested.nth(1)).toBeVisible();
    });

    test('each call in its transcript looks as it would on its own: the failed read is not drawn as done', async () => {
        test.fail(true, 'apartejs/aparte#271: the resolved line colours the state of every call under it');
        expectEachLooksAsAlone(await nestedAgainstAlone(chat.toolRow('File checker')));
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});

test.describe('a sub-agent whose command was refused', () => {
    let chat: ChatPage;
    let errors: string[];

    test.beforeEach(async ({ page }) => {
        errors = collectPageErrors(page);
        chat = await openSite(page);
        await chat.send(GATED);
        const panel = page.locator(PANEL);
        await expect(panel).toBeVisible();
        await panel.locator(REJECT).click();
        await expect(chat.lastReply).toContainText('its command was refused', { timeout: 20_000 });
        await expect(chat.streaming()).toHaveCount(0);
        const line = chat.toolRow('Build runner');
        await expect(line).toHaveAttribute('data-status', 'resolved');
        await chat.toolRowSummary(line).click();
        await expect(chat.nestedToolRows(line)).toHaveCount(1);
        await expect(chat.nestedToolRows(line)).toHaveAttribute('data-status', 'rejected');
    });

    test('its refused call looks as a refused call does on its own, not as done', async () => {
        test.fail(true, 'apartejs/aparte#271: the resolved line colours the state of every call under it');
        expectEachLooksAsAlone(await nestedAgainstAlone(chat.toolRow('Build runner')));
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});

test.describe('reduced motion, while the line still works', () => {
    let chat: ChatPage;
    let errors: string[];

    // Under reduced motion a working quiet line shows its state word, where the shimmer would
    // have said it. The calls under it are over: theirs stays as it is on its own.
    test.beforeEach(async ({ page }) => {
        errors = collectPageErrors(page);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        chat = await openSite(page);
        await chat.send(FILES);
        const line = chat.toolRow('File checker');
        // Its first read is over, and it pauses before the second (the script's `wait`).
        await expect(chat.nestedToolRows(line)).toHaveCount(1, { timeout: 20_000 });
        await expect(chat.nestedToolRows(line)).toHaveAttribute('data-status', 'resolved');
        await expect(line).toHaveAttribute('data-status', 'pending');
    });

    test('the calls under a working line look as they would on their own', async () => {
        test.fail(true, 'apartejs/aparte#271: the working line\'s rule shows the state word of every call under it');
        const rows = await nestedAgainstAlone(chat.toolRow('File checker'));
        // Read while the line still works, or the comparison says nothing about it.
        await expect(chat.toolRow('File checker')).toHaveAttribute('data-status', 'pending');
        expectEachLooksAsAlone(rows);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});

/** One frame of the reply while the sub-agent reasons. */
interface Frame {
    /** The top of the person's message, in the window. */
    userTop: number;
    /** How much of the sub-agent's reasoning is written. */
    reasoning: number;
    /** What its reasoning's heading says. */
    label: string;
    /** How far the thread is scrolled. */
    scrollTop: number;
    /** Whether the sub-agent's line is open. */
    lineOpen: boolean;
}

/**
 * Start reading every frame, from before the send until the reply is settled. Read back with
 * `framesOf`. In the page, so that each frame is read in the frame it was drawn.
 */
async function watchFrames(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = window as unknown as { __frames: unknown[]; __watching: boolean };
        w.__frames = [];
        w.__watching = true;
        const user = () => [...document.querySelectorAll('aparte-chat-bubble[data-role="user"]')].at(-1);
        const reply = () => [...document.querySelectorAll('aparte-chat-bubble[data-role="assistant"]')].at(-1);
        // What scrolls: the container in core mode (raw core), the viewport itself under a wrapper.
        const host = document.querySelector('aparte-chat-viewport');
        const surface = () => (host?.querySelector('.aparte-viewport-container') as HTMLElement | null) ?? (host as HTMLElement | null);
        const tick = () => {
            const line = reply()?.querySelector('.aparte-segment-tool-call');
            const thinking = line?.querySelector('.aparte-segment-thinking');
            const top = user()?.getBoundingClientRect().top;
            if (thinking && top !== undefined) {
                w.__frames.push({
                    userTop: top,
                    reasoning: thinking.querySelector('.aparte-thinking-content')?.textContent?.length ?? 0,
                    label: thinking.querySelector('summary')?.textContent?.trim() ?? '',
                    scrollTop: surface()?.scrollTop ?? 0,
                    lineOpen: line!.matches('details[open]') || !!line!.querySelector(':scope > details.aparte-tool-disclosure[open]'),
                });
            }
            if (w.__watching) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function framesOf(page: Page): Promise<Frame[]> {
    return page.evaluate(() => {
        const w = window as unknown as { __frames: Frame[]; __watching: boolean };
        w.__watching = false;
        return w.__frames;
    });
}

/** The frames in which the reasoning was still being written: shorter than it ends. */
function whileWritten(frames: Frame[]): Frame[] {
    const full = Math.max(...frames.map((f) => f.reasoning));
    return frames.filter((f) => f.reasoning > 0 && f.reasoning < full);
}

/**
 * Every change of direction of the person's message while the reasoning is written, past half
 * a pixel: it may go up (the reply grows under a reader at the bottom) or hold still, never
 * up then down.
 */
function reversals(frames: Frame[]): string[] {
    const out: string[] = [];
    let last = 0;
    for (let i = 1; i < frames.length; i++) {
        const move = frames[i]!.userTop - frames[i - 1]!.userTop;
        if (Math.abs(move) <= 0.5) continue;
        const direction = Math.sign(move);
        if (last !== 0 && direction !== last) out.push(`frame ${i}${frames[i]!.lineOpen ? ' (line open)' : ''}: ${frames[i - 1]!.userTop.toFixed(1)} → ${frames[i]!.userTop.toFixed(1)}`);
        last = direction;
    }
    return out;
}

test.describe('a sub-agent that reasons slowly', () => {
    test('its reasoning reads as in progress while it is written, then says how long it took', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openSite(page);
        await watchFrames(page);
        await chat.send(FILES);
        await expect(chat.lastReply).toContainText('One of the two files is missing', { timeout: 20_000 });
        await expect(chat.streaming()).toHaveCount(0);
        const frames = await framesOf(page);
        const written = whileWritten(frames);
        expect(written.length, 'frames read while the reasoning was written').toBeGreaterThan(10);
        // The site speaks English (site-setup.ts): the locale's `thinking`, then `thoughtFor`.
        expect(new Set(written.map((f) => f.label)), 'its heading in every frame it is written').toEqual(new Set(['Thinking']));
        expect(frames.at(-1)!.label, 'its heading once written').toMatch(/^Thought for \d/);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    for (const open of [false, true]) {
        test(`the thread does not move up and down while it is written, its line ${open ? 'open' : 'closed'}`, async ({ page }, testInfo) => {
            // Under a wrapper (the transcript the framework renders) the person's message goes
            // down and up by a pixel, again and again, while the reasoning is written: every
            // run with the line closed (12 of 12), about one in four with it open (3 of 11).
            // Raw core never did (24 runs, Chromium and WebKit). Open, a mark either way would
            // make the suite flaky, so it waits for the fix.
            const wrapper = testInfo.project.name.startsWith('react');
            test.fail(wrapper && !open, 'apartejs/aparte#270: under a wrapper the thread moves while a sub-agent reasons');
            test.fixme(wrapper && open, 'apartejs/aparte#270: under a wrapper, about one run in four, line open');
            const errors = collectPageErrors(page);
            // A thread already scrolled, as any conversation past its first exchange is, in a
            // window shorter than the exchange: the only place a moving thread can show. On a
            // first exchange the space kept under the reply takes every change of its height.
            await page.setViewportSize({ width: 1000, height: 520 });
            const chat = await openSite(page);
            await chat.send(FILES);
            await expect(chat.lastReply).toContainText('One of the two files is missing', { timeout: 20_000 });
            await expect(chat.streaming()).toHaveCount(0);
            await watchFrames(page);
            await chat.send(FILES);
            // The second reply, before `lastReply` is read: until it is there, that is the first.
            await expect(chat.bubbles('assistant')).toHaveCount(2);
            const line = chat.toolRow('File checker');
            if (open) {
                await chat.toolRowSummary(line).click();
                await expect(chat.segment('thinking').last()).toBeVisible();
            }
            await expect(chat.lastReply).toContainText('One of the two files is missing', { timeout: 20_000 });
            await expect(chat.streaming()).toHaveCount(0);
            // Open, from the frame the line is open: opening it is the person's act, and the
            // thread making room for what it shows is not the reasoning moving it.
            const written = whileWritten(await framesOf(page)).filter((f) => !open || f.lineOpen);
            expect(written.length, 'frames read while the reasoning was written').toBeGreaterThan(10);
            expect(Math.min(...written.map((f) => f.scrollTop)), 'the thread scrolled while the reasoning was written').toBeGreaterThan(0);
            expect(reversals(written), 'the person\'s message, frame by frame').toEqual([]);
            expect(errors, 'no uncaught page errors').toEqual([]);
        });
    }
});
