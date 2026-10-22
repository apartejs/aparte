/**
 * The shell layouts: `<aparte-split>` and the application shell.
 *
 * This is the only place any of it is proven. jsdom has no layout, no
 * `PointerEvent` and no pointer capture, so the split's unit suite asserts
 * attributes and listeners while the three things that can actually be wrong —
 * does the seam track the pointer, does a drag survive crossing an `<iframe>`, and
 * does the announced value match the pane the browser drew — need a real engine.
 *
 * Driven through the vanilla example's `?layout=split` and `?layout=shell`, which
 * exist for this: the chat beside a frame, and the same split inside a real
 * `.aparte-app-shell` with a sidebar that becomes a drawer.
 *
 * Every assertion here is geometry, an attribute the element wrote, or a painted colour
 * compared with the one the stylesheet asked for — never a pixel constant, because
 * three engines round differently and the viewport is the config's, not this file's.
 */

import { inflateSync } from 'node:zlib';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** The same phone box `responsive.spec.ts` uses, and under the split's 48rem breakpoint. */
const PHONE = { width: 390, height: 844 };

/**
 * The colour the engine painted at one point, from a screenshot clipped to it. The first
 * pixel of a PNG's first row is stored as is whatever the row's filter, because it has no
 * neighbour to be predicted from — so inflating the data is the whole decoder.
 */
async function paintedAt(page: Page, x: number, y: number): Promise<number[]> {
    const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
    const data: Buffer[] = [];
    for (let at = 8; at < png.length; ) {
        const length = png.readUInt32BE(at);
        if (png.toString('ascii', at + 4, at + 8) === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length));
        at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(data));
    return [raw[1]!, raw[2]!, raw[3]!]; // raw[0] is the row's filter byte
}

interface SplitBoxes {
    /** The container's inline size. */
    total: number;
    /** The primary (start) pane's inline size. */
    start: number;
    /** The free (end) pane's inline size. */
    end: number;
    /** The seam's own inline size. */
    handle: number;
    /** The seam's distance from the container's left edge, in page coordinates. */
    seamX: number;
}

/** Read the split's three tracks in one evaluate, so nothing races a reflow between them. */
async function boxes(page: Page): Promise<SplitBoxes> {
    return page.evaluate(() => {
        const split = document.querySelector('aparte-split')!;
        const handle = split.querySelector('.aparte-split__handle')!;
        const panes = Array.from(split.children).filter((c) => !c.classList.contains('aparte-split__handle'));
        const r = (el: Element) => el.getBoundingClientRect();
        return {
            total: r(split).width,
            start: r(panes[0]!).width,
            end: r(panes[panes.length - 1]!).width,
            handle: r(handle).width,
            seamX: r(handle).x,
        };
    });
}

/** The `position` attribute the element reflected — a commit, never a drag frame. */
async function reflected(split: Locator): Promise<number> {
    return Number(await split.getAttribute('position'));
}

/**
 * Drag the seam by `dx` CSS pixels.
 *
 * The first move is deliberately a whole half of the travel rather than a nudge: the
 * scrim goes in on `pointerdown`, so by the time it lands it is already the topmost
 * hit target — and that is the invariant worth exercising, since a scrim created
 * later would lose exactly this move to whatever it crossed. The rest arrives in
 * steps, so the seam is also driven by repeated `pointermove` at moving coordinates.
 * Both halves have to travel: Playwright interpolates from the CURRENT pointer
 * position, so a second move to the same point is three identical events and no
 * travel at all.
 */
async function dragSeam(page: Page, handle: Locator, dx: number): Promise<void> {
    const box = (await handle.boundingBox())!;
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y);
    await page.mouse.move(x + dx, y, { steps: 3 });
    await page.mouse.up();
}

/**
 * Record every press, release, click and double-click on the page, with a timestamp
 * and the element it landed on. Armed before the gesture, read after it — the repo's
 * own rule for a WebKit red: instrument it, then decide whether it is noise.
 */
async function traceClicks(page: Page): Promise<() => Promise<string[]>> {
    await page.evaluate(() => {
        const log: string[] = [];
        (window as unknown as { __clicks: string[] }).__clicks = log;
        const t0 = performance.now();
        for (const name of ['pointerdown', 'pointerup', 'click', 'dblclick']) {
            document.addEventListener(name, (e) => {
                const el = e.target as HTMLElement | null;
                const where = el ? `${el.tagName.toLowerCase()}.${el.className || '(no class)'}` : 'null';
                log.push(`${(performance.now() - t0).toFixed(1)}ms ${name} -> ${where} detail=${(e as MouseEvent).detail}`);
            }, true);
        }
        document.addEventListener('aparte-split-resize', (e) => {
            const d = (e as CustomEvent<{ position: number; source: string }>).detail;
            log.push(`${(performance.now() - t0).toFixed(1)}ms resize -> ${d.position} (${d.source})`);
        });
    });
    return () => page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);
}

/** Land on a layout with the model API mocked and an error collector armed. */
async function open(page: Page, layout: 'split' | 'shell'): Promise<{ errors: string[]; split: Locator; handle: Locator }> {
    const errors = collectPageErrors(page);
    await installLlmMock(page);
    await page.goto(`/?layout=${layout}`);
    const split = page.locator('aparte-split');
    await expect(split).toBeVisible();
    const handle = split.locator('.aparte-split__handle');
    return { errors, split, handle };
}

test.describe('the split, at desktop width', () => {
    test('the seam drags, and the panes still add up', async ({ page }) => {
        const { errors, split, handle } = await open(page, 'split');
        await expect(handle).toBeVisible();

        const before = await boxes(page);
        await dragSeam(page, handle, 140);
        const after = await boxes(page);

        expect(after.start, 'the primary pane must have grown').toBeGreaterThan(before.start + 100);
        expect(after.end, 'the free pane must have given way').toBeLessThan(before.end - 100);
        // The nested clamp in the grid template is the whole mechanism; if it dropped a
        // track the three would stop summing to the container.
        expect(Math.abs(after.start + after.handle + after.end - after.total)).toBeLessThanOrEqual(1);
        expect(after.seamX, 'the seam must have travelled with the pointer').toBeGreaterThan(before.seamX + 100);

        // Reflected on commit, and equal to what was drawn.
        expect(Math.abs((await reflected(split)) - (after.start / after.total) * 100)).toBeLessThanOrEqual(1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the drag continues over an iframe pane, and the scrim covers the viewport', async ({ page }) => {
        // On the SHELL layout on purpose: the scrim is `position: fixed`, so it only
        // covers the viewport while nothing between it and the root establishes a
        // containing block. The app shell is the realistic place for a `transform` or a
        // `container-type` to appear and break it silently.
        const { errors, split, handle } = await open(page, 'shell');
        await expect(page.locator('.aparte-app-shell')).toBeVisible();
        await expect(page.locator('iframe[title="Preview"]')).toBeVisible();

        const before = await boxes(page);
        const box = (await handle.boundingBox())!;
        const y = box.y + box.height / 2;
        const x = box.x + box.width / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();

        // Mid-drag: the scrim exists, is a child of the handle, and is the size of the
        // viewport rather than the size of the split.
        const scrim = await page.evaluate(() => {
            const el = document.querySelector('.aparte-split__scrim');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                parentIsHandle: el.parentElement?.classList.contains('aparte-split__handle') === true,
                x: r.x, y: r.y, w: r.width, h: r.height,
                vw: document.documentElement.clientWidth,
                vh: document.documentElement.clientHeight,
            };
        });
        expect(scrim, 'pointerdown must add the drag scrim').not.toBeNull();
        expect(scrim!.parentIsHandle, 'the scrim must be a child of the handle').toBe(true);
        expect(Math.abs(scrim!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(scrim!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(scrim!.w - scrim!.vw), 'the scrim must span the viewport, not the split').toBeLessThanOrEqual(1);
        expect(Math.abs(scrim!.h - scrim!.vh), 'the scrim must span the viewport, not the split').toBeLessThanOrEqual(1);

        // Now cross the frame. Every one of these coordinates is inside the iframe's
        // box; without the scrim the moves are delivered to the frame's document and
        // the seam stops dead where the frame begins.
        const frame = (await page.locator('iframe[title="Preview"]').boundingBox())!;
        for (const step of [0.25, 0.5, 0.75]) {
            await page.mouse.move(frame.x + frame.width * step, frame.y + frame.height / 2);
        }
        const mid = await boxes(page);
        expect(mid.seamX, 'the seam must still be tracking inside the frame').toBeGreaterThan(before.seamX + 100);

        await page.mouse.up();
        await expect(page.locator('.aparte-split__scrim')).toHaveCount(0);
        const after = await boxes(page);
        expect(Math.abs((await reflected(split)) - (after.start / after.total) * 100)).toBeLessThanOrEqual(1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('a pointer released over the iframe still commits', async ({ page }) => {
        const { errors, split, handle } = await open(page, 'split');
        const chat = new ChatPage(page);
        const readResizes = await chat.recordEvents<{ position: number; source: string }>('aparte-split-resize');

        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        const frame = (await page.locator('iframe[title="Preview"]').boundingBox())!;
        const releaseX = frame.x + frame.width / 2;
        const releaseY = frame.y + frame.height / 2;
        await page.mouse.move(releaseX, releaseY);
        await page.mouse.up();

        await expect(page.locator('.aparte-split__scrim')).toHaveCount(0);
        const after = await boxes(page);
        const drawn = (after.start / after.total) * 100;
        expect(Math.abs((await reflected(split)) - drawn), 'the reflected value must be the drawn one').toBeLessThanOrEqual(1);

        const events = await readResizes();
        expect(events.length, 'one commit for one gesture').toBe(1);
        expect(events[0]!.source).toBe('pointer');
        expect(Math.abs(events[0]!.position - drawn)).toBeLessThanOrEqual(1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the announced value is the rendered one, even against a min the drag cannot beat', async ({ page }) => {
        const { errors, split, handle } = await open(page, 'split');
        // First, at rest and before anything is overridden: the range published is the
        // ACHIEVABLE one, not the 0..100 of the requested scale. This is where the
        // numbers are non-degenerate — the `--aparte-split-min: 16rem` floor and the
        // 60% ceiling are both inside the scale — and it is the half of the Shoelace
        // bug that lives on the range rather than on the value.
        expect(Number(await handle.getAttribute('aria-valuemin')),
            'the floor announced must be the reachable one, not 0').toBeGreaterThan(1);
        expect(Number(await handle.getAttribute('aria-valuemax')),
            'the ceiling announced must be the reachable one, not 100').toBeLessThan(99);

        // A floor of 60% the pointer will be dragged straight through. A splitter that
        // announces the REQUESTED number says 5 while the pane sits at 60 — the bug this
        // asserts against rather than assumes away.
        await split.evaluate((el) => el.style.setProperty('--aparte-split-min', '60%'));
        await dragSeam(page, handle, -400);

        const after = await boxes(page);
        const drawn = (after.start / after.total) * 100;
        expect(drawn, 'the CSS floor must have held').toBeGreaterThan(55);

        const valuenow = Number(await handle.getAttribute('aria-valuenow'));
        expect(Math.abs(valuenow - drawn), `announced ${valuenow}, drawn ${drawn}`).toBeLessThanOrEqual(1);
        expect(Math.abs((await reflected(split)) - drawn)).toBeLessThanOrEqual(1);

        // And the value still sits inside the range — a cheap invariant rather than a
        // catch: with the floor raised to 60% the probe's two ends meet, so min, max
        // and now are one number. The assertion that can actually fail is the pair
        // above, taken before the override.
        const min = Number(await handle.getAttribute('aria-valuemin'));
        const max = Number(await handle.getAttribute('aria-valuemax'));
        expect(valuenow).toBeGreaterThanOrEqual(min - 1);
        expect(valuenow).toBeLessThanOrEqual(max + 1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the handle keeps the focus after a pointer drag', async ({ page }) => {
        // The Safari case: `pointerdown` calls `preventDefault()` to stop the drag
        // selecting text, which also costs the focus WebKit would not have given anyway.
        // The element hands it back by hand, and this is where that is visible.
        const { errors, handle } = await open(page, 'split');
        await dragSeam(page, handle, 80);

        const focused = await page.evaluate(() =>
            document.activeElement?.classList.contains('aparte-split__handle') === true);
        expect(focused, 'the seam must hold the focus a drag gave it').toBe(true);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('arrow keys resize the seam, one commit per press', async ({ page }) => {
        const { errors, split, handle } = await open(page, 'split');
        const chat = new ChatPage(page);
        const readResizes = await chat.recordEvents<{ position: number; source: string }>('aparte-split-resize');

        await handle.focus();
        const before = await boxes(page);
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');

        const after = await boxes(page);
        expect(after.start, 'five steps of 1% must be visible').toBeGreaterThan(before.start + 10);
        expect(after.seamX).toBeGreaterThan(before.seamX + 10);

        const events = await readResizes();
        expect(events.length, 'one event per keyup, never one per keydown').toBe(5);
        expect(new Set(events.map((e) => e.source))).toEqual(new Set(['keyboard']));
        expect(Math.abs((await reflected(split)) - (after.start / after.total) * 100)).toBeLessThanOrEqual(1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('a double click on the seam resets it', async ({ page }) => {
        // The most load-bearing assertion in the file, and the one that was red.
        //
        // A press that never moved releases ON the drag scrim — nothing captured the
        // pointer, because the capture waits for the first move so a click survives — and
        // WebKit works out what a `click` hit by walking that node's LIVE ancestors at
        // dispatch time. Removing the scrim inside the pointerup handler therefore fired
        // no click at all on WebKit, so no `dblclick`, so no reset; Chromium and Gecko
        // resolve the target earlier and were green throughout. The seam retires its
        // scrim instead of removing it, and this is where that is held.
        //
        // No retry loop. The failure was a defect, not a swallowed press, so a `toPass`
        // here would only hide it coming back. The trace is kept instead: a future red
        // arrives with the engine's own event log attached and does not have to be
        // re-diagnosed from a screenshot.
        const { errors, split, handle } = await open(page, 'split');
        const initial = await boxes(page);
        await dragSeam(page, handle, 150);
        expect((await boxes(page)).start).toBeGreaterThan(initial.start + 100);

        const readClicks = await traceClicks(page);
        try {
            await handle.dblclick();
            await expect(split).toHaveAttribute('position', '38', { timeout: 3_000 });
        } catch (error) {
            throw new Error(`${String(error)}\n\nthe seam's own event log:\n${(await readClicks()).join('\n')}`);
        }
        const after = await boxes(page);
        expect(Math.abs(after.start - initial.start), 'the seam must be back where it started').toBeLessThanOrEqual(2);
        // The other half of the retirement, and the only place a browser proves it: the
        // two presses a double-click is built from each leave an inert overlay behind,
        // and each has to go on its own. A dropped timer keeps every assertion above
        // green while the page collects one `position: fixed` overlay per click.
        await expect(page.locator('.aparte-split__scrim'),
            'a retired overlay must leave the document, not pile up').toHaveCount(0, { timeout: 2_000 });
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('right to left moves the other way', async ({ page }) => {
        const { errors, split, handle } = await open(page, 'split');
        // The computed direction, which is what the element reads — a host can flip one
        // subtree, and `document.dir` would not see it.
        await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
        await expect(split).toBeVisible();

        const before = await boxes(page);
        const beforePosition = await reflected(split);
        // In `rtl` the start pane is on the right, so a pointer travelling right makes
        // it SMALLER. Under a left-to-right reading of the same delta it would grow.
        await dragSeam(page, handle, 140);

        const after = await boxes(page);
        expect(after.start, 'the primary pane must have shrunk').toBeLessThan(before.start - 100);
        expect(await reflected(split)).toBeLessThan(beforePosition);
        expect(Math.abs(after.start + after.handle + after.end - after.total)).toBeLessThanOrEqual(1);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });
});

test.describe('at phone width', () => {
    test.use({ viewport: PHONE });

    test('the split shows one pane, and the buttons switch it', async ({ page }) => {
        const { errors, split } = await open(page, 'split');
        await expect(split).toHaveAttribute('data-stacked', '');

        const pane = (which: 'start' | 'end') => page.locator(`[data-aparte-split-pane="${which}"]`);
        const chatPane = split.locator('aparte-chat');
        const previewPane = split.locator('.aparte-split__pane');

        // Entering the stacked state shows the chat, never a preview of nothing.
        await expect(split).toHaveAttribute('pane', 'start');
        await expect(chatPane).toBeVisible();
        await expect(previewPane).toBeHidden();
        // The seam goes with the pane it no longer separates — tab stop included.
        // Pinned first: `toBeHidden()` and a zero count are both true of a handle that
        // is not there at all, so a renamed or missing seam would satisfy them both.
        await expect(split.locator('.aparte-split__handle')).toHaveCount(1);
        await expect(split.locator('.aparte-split__handle')).toBeHidden();
        await expect(split.locator('.aparte-split__handle[tabindex]')).toHaveCount(0);

        await pane('end').click();
        await expect(split).toHaveAttribute('pane', 'end');
        await expect(previewPane).toBeVisible();
        await expect(chatPane).toBeHidden();

        await pane('start').click();
        await expect(chatPane).toBeVisible();
        await expect(previewPane).toBeHidden();

        const noSideScroll = await page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        expect(noSideScroll, 'a stacked split must not widen the page').toBe(true);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the application shell opens and closes its drawer', async ({ page }) => {
        const { errors } = await open(page, 'shell');
        const sidebar = page.locator('aparte-sidebar');
        // The header's toggle: the sidebar carries one of its own too, inside the drawer.
        const toggle = page.locator('.aparte-app-header__toggle');

        // Under 48rem the sidebar leaves the grid and enters CLOSED: a narrow window
        // that opens on an overlay covering the chat is the wrong first screen.
        await expect(sidebar).toHaveAttribute('data-drawer', '');
        await expect(sidebar).toHaveAttribute('collapsed', '');
        await expect(toggle).toBeVisible();

        await toggle.click();
        await expect(sidebar).not.toHaveAttribute('collapsed', '');
        const scrim = page.locator('.aparte-sidebar__scrim');
        await expect(scrim).toHaveCount(1);

        // A click on the scrim closes it, and the focus goes back to what opened it.
        // Aimed PAST the drawer: the scrim spans the viewport from inside the sidebar
        // (`z-index: -1`, so the panel sits above it), and its top-left corner is under
        // the open panel — a click there lands on the sidebar's own header instead.
        await scrim.click({ position: { x: PHONE.width - 20, y: PHONE.height / 2 } });
        await expect(sidebar).toHaveAttribute('collapsed', '');
        await expect(scrim).toHaveCount(0);
        expect(await page.evaluate(() =>
            document.activeElement?.hasAttribute('data-aparte-sidebar-toggle') === true),
        ).toBe(true);

        // Opening it moves the focus INTO it — an overlay the next Tab walks past is an
        // overlay nobody can reach — and Escape then closes it from wherever focus is.
        // No `focus()` here on purpose: putting the focus in the drawer by hand is what
        // made this pass while Escape was answered only by the element itself.
        await toggle.click();
        await expect(sidebar).not.toHaveAttribute('collapsed', '');
        expect(await page.evaluate(() =>
            document.querySelector('aparte-sidebar')?.contains(document.activeElement) === true),
        ).toBe(true);
        await page.keyboard.press('Escape');
        await expect(sidebar).toHaveAttribute('collapsed', '');

        const noSideScroll = await page.evaluate(() =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        expect(noSideScroll, 'the shell must not widen the page').toBe(true);
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the open drawer is painted in its own ground, not dimmed by its scrim', async ({ page }) => {
        // The open drawer is a stacking context (fixed + z-index) and its scrim a child at
        // z-index -1, which paints ABOVE the context's own background: the whole panel came
        // out grey, and only the children with a ground of their own (the search field, the
        // selected row) stayed bright. Every check above is behaviour, so none saw it; this
        // one reads what the engine painted.
        const { errors } = await open(page, 'shell');
        const sidebar = page.locator('aparte-sidebar');
        await page.locator('.aparte-app-header__toggle').click();
        await expect(sidebar).not.toHaveAttribute('collapsed', '');
        await expect(page.locator('.aparte-sidebar__scrim')).toHaveCount(1);
        // The slide has landed: what is read below is the panel at rest.
        await expect.poll(() => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);

        // A point of bare ground — the foot of the body region — and the colour the
        // stylesheet asked for, resolved by the engine itself.
        const probe = await page.evaluate(() => {
            const host = document.querySelector('aparte-sidebar')!;
            const r = host.querySelector('.aparte-sidebar__body')!.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2);
            const y = Math.round(r.bottom - 4);
            // Nothing between the point and the drawer may paint a ground of its own.
            for (let n = document.elementFromPoint(x, y); n && n !== host; n = n.parentElement) {
                const bg = getComputedStyle(n).backgroundColor;
                if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return { x, y, blocker: n.className };
            }
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.fillStyle = getComputedStyle(host).backgroundColor;
            ctx.fillRect(0, 0, 1, 1);
            return { x, y, blocker: null, ground: [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)] };
        });
        expect(probe.blocker, 'the probe must land on bare ground').toBeNull();

        const painted = await paintedAt(page, probe.x, probe.y);
        for (const [i, channel] of ['red', 'green', 'blue'].entries()) {
            expect(Math.abs(painted[i]! - probe.ground![i]!), `${channel}: painted ${painted} for a ground of ${probe.ground}`)
                .toBeLessThanOrEqual(6);
        }
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });
});


/*
 * The shell follows the sidebar's own breakpoint. It folded at a fixed 48rem and hid every
 * sidebar not yet a drawer, so `breakpoint="30rem"` left nothing between 30 and 48rem — no
 * column, no drawer, a toggle that opened nothing — and a breakpoint over 48rem left a drawer
 * beside an empty first column.
 */
test.describe("the application shell, at the sidebar's own breakpoint", () => {
    test('a sidebar whose breakpoint is under the window stays a column, one over it folds the grid', async ({ page }) => {
        await page.setViewportSize({ width: 640, height: 800 });   // 40rem: under the old fixed 48rem
        const { errors } = await open(page, 'shell');
        const geometry = () => page.evaluate(() => {
            const shell = document.querySelector('.aparte-app-shell')!.getBoundingClientRect();
            const sidebar = document.querySelector('.aparte-app-shell > aparte-sidebar')!;
            const main = document.querySelector('.aparte-app-shell > .aparte-app-shell__main')!.getBoundingClientRect();
            const box = sidebar.getBoundingClientRect();
            return { drawer: sidebar.hasAttribute('data-drawer'), width: box.width, sidebarEnd: box.right - shell.left, mainStart: main.left - shell.left };
        });
        await page.evaluate(() => document.querySelector('.aparte-app-shell > aparte-sidebar')!.setAttribute('breakpoint', '30rem'));
        await expect.poll(async () => (await geometry()).drawer).toBe(false);
        const column = await geometry();
        expect(column.width, 'a column, not hidden').toBeGreaterThan(100);
        expect(column.mainStart, 'the chat beside it').toBeGreaterThanOrEqual(column.sidebarEnd - 1);

        await page.setViewportSize({ width: 900, height: 800 });   // 56rem: over the old 48rem
        await page.evaluate(() => document.querySelector('.aparte-app-shell > aparte-sidebar')!.setAttribute('breakpoint', '64rem'));
        await expect.poll(async () => (await geometry()).drawer).toBe(true);
        expect((await geometry()).mainStart, 'the grid folds on the drawer').toBeLessThan(2);
        await expect(page.locator('.aparte-app-header__toggle'), 'and its control is in the header').toBeVisible();
        expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
    });
});
