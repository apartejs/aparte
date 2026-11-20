/**
 * A conversation moves between the app's groups, with the mouse and with the keyboard.
 *
 * What the market does (ChatGPT, Claude, LibreChat, Open WebUI, Perplexity): a chat moves from
 * its row's menu, to a destination chosen from a list, and out of its project the same way;
 * several also drag it onto a folder, marked whole while a drop there is allowed. The list
 * says where (`aparte-conversation-move`) and the app writes it.
 *
 * The page is the vanilla example's `?harness=conversation-move`
 * (`apps/examples/_shared/conversation-move-harness.ts`): Launch (two rows), Docs (one), Ops
 * (none, so no heading: the menu reaches it), and two rows in no project. A real drag needs a
 * browser: jsdom has none, so the unit suite only sends the events.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ConversationListPage } from '../helpers/chat.js';

async function open(page: Page): Promise<ConversationListPage> {
    await page.goto('/?harness=conversation-move');
    const list = new ConversationListPage(page, 'move-list');
    await expect(list.row('plan')).toBeVisible();
    return list;
}

/**
 * The drag events the page saw, in order, with where each landed and what it carried: put in
 * a failure's message, so a drop that does not land in one engine says which step it lost.
 */
async function recordDrag(page: Page): Promise<() => Promise<string>> {
    await page.evaluate(() => {
        const log: string[] = [];
        (window as unknown as { __drag: string[] }).__drag = log;
        for (const type of ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) {
            document.addEventListener(type, (e) => {
                const t = e.target as Element | null;
                const where = t?.closest?.('[data-group-key]')?.getAttribute('data-group-key') ?? t?.tagName ?? '?';
                const effect = (e as DragEvent).dataTransfer?.dropEffect ?? '-';
                const entry = `${type}@${where}/${effect}/${e.defaultPrevented ? 'prevented' : 'open'}`;
                // dragover repeats: one line per change of place.
                if (log.at(-1) !== entry) log.push(entry);
            }, { capture: false });
        }
    });
    return () => page.evaluate(() => (window as unknown as { __drag: string[] }).__drag.join(' → '));
}

/** Press on `from`, move over `to` in steps (as a hand does), and stay there. */
async function dragOver(page: Page, from: Locator, to: Locator): Promise<void> {
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + a.width / 3, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 3, a.y + a.height / 2 + 8, { steps: 4 });
    await page.mouse.move(b.x + b.width / 3, b.y + b.height / 2, { steps: 12 });
}

test.describe('with the mouse', () => {
    test('a row dragged onto another project moves there; the project is marked while a drop there would land', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        const events = await recordDrag(page);
        await dragOver(page, list.row('plan'), list.row('api'));
        await expect(list.dropMarked).toHaveCount(1);
        await expect(list.dropMarked).toHaveAttribute('data-group-key', 'p-docs');
        await page.mouse.up();
        await expect.poll(() => list.groupOf('plan'), { message: `drag events: ${await events()}` }).toBe('p-docs');
        await expect(list.dropMarked).toHaveCount(0);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('dragged onto the rows of no project, it leaves its project', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        await dragOver(page, list.row('api'), list.row('quick'));
        await expect(list.dropMarked).toHaveCount(1);
        await page.mouse.up();
        await expect.poll(() => list.groupOf('api')).toBe(null);
        // The project it left had only it: its heading goes with it.
        await expect.poll(() => list.headings()).not.toContain('Docs');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('over its own project nothing is marked, and a drop there changes nothing', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        await dragOver(page, list.row('plan'), list.row('pricing'));
        await expect(list.dropMarked).toHaveCount(0);
        await page.mouse.up();
        expect(await list.groupOf('plan')).toBe('p-launch');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});

test.describe('with the keyboard', () => {
    test('Move to… lists the projects in the menu, and Enter on one moves the row there, a project with no row included', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        await list.more('quick').focus();
        await page.keyboard.press('Enter');
        await expect(list.menu).toBeVisible();
        // Down the menu to "Move to…", the way a keyboard gets there.
        for (let n = 0; n < 6 && !(await list.menuItem('move').evaluate((el) => el === document.activeElement)); n++) {
            await page.keyboard.press('ArrowDown');
        }
        await expect(list.menuItem('move')).toBeFocused();
        await page.keyboard.press('Enter');
        // The projects, in the same menu, the first one focused.
        await expect(list.menuItem('move-to')).toHaveText(['Launch', 'Docs', 'Ops']);
        await expect(list.menuItem('move-to').first()).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await expect(list.menuItem('move-to').nth(2)).toBeFocused();
        await page.keyboard.press('Enter');
        await expect.poll(() => list.groupOf('quick')).toBe('p-ops');
        await expect.poll(() => list.headings()).toContain('Ops');
        // The rows were drawn again where the app put them: the focus is still on the row it
        // left from, now in its new project, not lost to the page.
        await expect(list.more('quick')).toBeFocused();
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('Remove from … takes a row out of its project', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        await list.more('pricing').click();
        await expect(list.menuItem('ungroup')).toHaveText('Remove from “Launch”');
        await list.menuItem('ungroup').click();
        await expect.poll(() => list.groupOf('pricing')).toBe(null);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });

    test('Escape among the projects closes the menu, gives the focus back, and moves nothing', async ({ page }) => {
        const errors = collectPageErrors(page);
        const list = await open(page);
        await list.more('plan').click();
        await list.menuItem('move').click();
        await expect(list.menuItem('move-to').first()).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(list.menu).toHaveCount(0);
        await expect(list.more('plan')).toBeFocused();
        expect(await list.groupOf('plan')).toBe('p-launch');
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
});
