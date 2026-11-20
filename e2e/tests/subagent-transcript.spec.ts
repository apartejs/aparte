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
 *   line around it is doing (every state under every state: `nested-rows.spec.ts`);
 * - the sub-agent's reasoning reads as in progress for as long as it is written, then says how
 *   long it took;
 * - (the thread holding still while that reasoning is written, line closed or open, is
 *   `thread-holds-still.spec.ts`, on every example: apartejs/aparte#270).
 *
 * Each test was seen to fail without what it guards: the comparisons on 1.15.0, whose rules
 * reached every row under the line (apartejs/aparte#271), the heading one with a renderer made
 * to show the settled heading early.
 *
 * The page is the examples' `?scenario&subagent-transcript`; the paths are in
 * `apps/examples/_shared/sub-agents.ts`.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';
import { framesOf, watchFrames, whileWritten } from '../helpers/frames.js';

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
        const rows = await nestedAgainstAlone(chat.toolRow('File checker'));
        // Read while the line still works, or the comparison says nothing about it.
        await expect(chat.toolRow('File checker')).toHaveAttribute('data-status', 'pending');
        expectEachLooksAsAlone(rows);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});

test.describe('a sub-agent that reasons slowly', () => {
    test('its reasoning reads as in progress while it is written, then says how long it took', async ({ page }) => {
        const errors = collectPageErrors(page);
        const chat = await openSite(page);
        await watchFrames(page, 'line');
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
});
