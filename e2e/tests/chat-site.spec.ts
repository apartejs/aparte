/**
 * The vanilla example is a chat SITE: a sidebar with the conversation list, a header,
 * the chat — over the library's conversation chain and a store that answers after a
 * delay. This suite drives the site's glue: the list says it is on its way and then
 * fills, opening a conversation shows the wait and then the transcript, a new chat
 * empties it, a send in a new chat puts it at the top of the list under its message,
 * and the sidebar folds into a drawer on a phone. The chat itself is covered
 * everywhere else.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions';

const LIST = 'aparte-conversation-list';
const VIEWPORT = 'aparte-chat-viewport';
/** Whether the shell says it is empty — `data-empty` on the element, `data-aparte-empty` on a wrapper's container. */
const isEmpty = (page: import('@playwright/test').Page) => page.evaluate(() => {
    const el = document.querySelector('aparte-chat, [data-aparte-chat]');
    return !!el && (el.hasAttribute('data-empty') || el.hasAttribute('data-aparte-empty'));
});

test('the list is on its way, then fills; opening a conversation shows the wait, then the transcript', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/?scenario');
    // The store answers after a delay: the list draws its wait first, and says so.
    await expect(page.locator(LIST)).toHaveAttribute('loading', '');
    await expect(page.locator(LIST)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator(`${LIST} .aparte-conv-list-loading`)).toBeVisible();
    await expect(page.locator(LIST)).not.toHaveAttribute('loading', '');
    await expect(page).toHaveTitle('aparté');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);

    await page.locator(LIST).getByText('Compare three frameworks').click();
    // The messages come through `loadFull()`: the viewport wears `loading` in between,
    // the row is already the current one, and the welcome screen does not show.
    await expect(page.locator(VIEWPORT)).toHaveAttribute('loading', '');
    await expect.poll(() => isEmpty(page)).toBe(false);
    await expect(page.locator(`${LIST} [aria-current="page"]`)).toContainText('Compare three frameworks');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
    await expect(page.locator(VIEWPORT)).not.toHaveAttribute('loading', '');
    await expect(page).toHaveTitle('Compare three frameworks · aparté');
    // A table in the sample reply, rendered as one: the transcript is real markdown.
    await expect(page.locator('aparte-chat-bubble table')).toBeVisible();
    expect(errors).toEqual([]);
});

test('a new chat empties the transcript, and a send creates the conversation at the top of the list', async ({ page }) => {
    await page.goto('/?scenario&fast');
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);

    await page.locator('#new-chat').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(page).toHaveTitle('aparté');
    await expect(page.locator('#welcome')).toBeVisible();

    const editor = page.locator('aparte-composer-input [contenteditable], aparte-composer-input textarea').first();
    await editor.fill('Write a haiku about web components.');
    await page.keyboard.press('Enter');
    await expect(page).toHaveTitle('Write a haiku about web components. · aparté');
    // The new entry is the first row under "Today" — the pinned group stays above it.
    const today = page.locator(`${LIST} .aparte-conv-group`, { hasText: 'Today' });
    await expect(today.locator('[data-conv-id]').first()).toContainText('Write a haiku about web components.');
    await expect(page.locator('#welcome')).toBeHidden();
    // The scripted model answered.
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the starters follow the conversation: none over a stored thread, back after a new chat', async ({ page }) => {
    // `empty-only` used to read the composer's send alone: after the first one the
    // starters were hidden for good, so a new chat showed the welcome without them.
    const starters = page.locator('aparte-suggestions');
    await page.goto('/?scenario&fast');
    await expect(starters).toBeVisible();

    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
    // React unmounts its empty state; the other four keep the element and hide it.
    await expect(page.locator('aparte-suggestions:not([hidden])')).toHaveCount(0);

    await page.locator('#new-chat').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(starters).toBeVisible();

    const editor = page.locator('aparte-composer-input [contenteditable], aparte-composer-input textarea').first();
    await editor.fill('Write a haiku about web components.');
    await page.keyboard.press('Enter');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
    // The reply finished: the subject here is the starters, not a new chat mid-stream.
    await expect(page.locator('.aparte-message[aria-busy="true"]')).toHaveCount(0);

    await page.locator('#new-chat').click();
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(0);
    await expect(starters).toBeVisible();
});

test('the sidebar is a drawer on a phone, opened by the header toggle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/?scenario&fast');
    const sidebar = page.locator('aparte-sidebar');
    // A drawer, and closed: the element folds the list off screen (a transform, which a
    // visibility check does not see), so the attributes are what to assert.
    await expect(sidebar).toHaveAttribute('data-drawer', /.*/);
    await expect(sidebar).toHaveAttribute('collapsed', '');

    await page.locator('[data-aparte-sidebar-toggle]').last().click();
    await expect(sidebar).not.toHaveAttribute('collapsed', '');
    await expect(page.locator(LIST).getByText('Weather in Lille')).toBeVisible();
    // Picking a conversation from the drawer opens the thread.
    await page.locator(LIST).getByText('Weather in Lille').click();
    await expect(page).toHaveTitle('Weather in Lille · aparté');
    await expect(page.locator('aparte-chat-bubble')).toHaveCount(2);
});

test('the theme toggle flips the page between light and dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?scenario&fast');
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the light theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to the dark theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-aparte-theme', 'dark');
});

test('a conversation can be deleted from its row menu', async ({ page }) => {
    // SAB-02 regression: deleting from the row's `⋯` menu must remove the row and fire
    // `aparte-conversation-delete` once the confirmation is accepted.
    await page.goto('/?scenario&fast');
    const rows = page.locator(`${LIST} [data-conv-id]`);
    await expect(rows).toHaveCount(10);

    await page.evaluate(() => {
        (window as unknown as { __deleteFired?: boolean }).__deleteFired = false;
        document.addEventListener('aparte-conversation-delete', () => {
            (window as unknown as { __deleteFired?: boolean }).__deleteFired = true;
        });
    });

    const row = page.locator(`${LIST} [data-conv-id="c-weather"]`);
    await row.locator('.aparte-conv-item__more').click();
    await page.locator('[role="menu"] [data-menu-action="delete"]').click();
    await page.locator('[data-menu-action="confirm-delete"]').click();

    await expect(row).toHaveCount(0);
    await expect(rows).toHaveCount(9);
    expect(await page.evaluate(() => (window as unknown as { __deleteFired?: boolean }).__deleteFired)).toBe(true);
});

test('Enter on a focused row keeps the focus on the row', async ({ page }) => {
    // SAB-12 regression: selecting a row with the keyboard must not move the focus away
    // from that row. The cause was the sidebar's `manager.subscribe` callback reassigning
    // `list.conversations` (a fresh array every notification) and the list fully
    // re-rendering in response, which replaced the very button Enter had just activated.
    await page.goto('/?scenario&fast');
    // The rows come from the conversation manager, after the page: Tab pressed before they
    // are drawn walks the page's other controls and never meets one.
    await expect(page.locator(`${LIST} [data-conv-id]`)).toHaveCount(10);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const focusedRowId = () => page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.classList.contains('aparte-conv-item__select')) return null;
        return el.closest('[data-conv-id]')?.getAttribute('data-conv-id') ?? null;
    });

    let rowId: string | null = null;
    for (let i = 0; i < 40 && !rowId; i++) {
        await page.keyboard.press('Tab');
        rowId = await focusedRowId();
    }
    expect(rowId, 'Tab must reach a conversation row\'s title button').not.toBeNull();

    await page.keyboard.press('Enter');

    // The conversation opened…
    await expect(page.locator(`${LIST} [data-conv-id="${rowId}"] .aparte-conv-item__select`))
        .toHaveAttribute('aria-current', 'page');
    // …and the focus is still inside that same row, not lost to the document. Polled: the
    // list puts the keyboard back on the row its re-render drew, a frame after the render.
    await expect.poll(
        () => page.evaluate(
            (id) => !!(document.activeElement as HTMLElement | null)?.closest(`[data-conv-id="${id}"]`),
            rowId,
        ),
        { message: 'focus should remain inside the row after Enter selects it' },
    ).toBe(true);
});

test('a sidebar collapsed on a desktop opens again from the header', async ({ page }) => {
    await page.goto('/?scenario&fast');
    const sidebar = page.locator('aparte-sidebar');
    const headerToggle = page.locator('.aparte-app-header__toggle');
    // Wide: the sidebar is a column, and the header's toggle stays out of the way.
    await expect(sidebar).not.toHaveAttribute('data-drawer', /.*/);
    await expect(headerToggle).toBeHidden();

    await sidebar.locator('[data-aparte-sidebar-toggle]').click();
    await expect(sidebar).toHaveAttribute('collapsed', '');
    // Collapsed, the sidebar's own toggle went with it (inert, 0px): the header's shows.
    await expect(headerToggle).toBeVisible();
    await headerToggle.click();
    await expect(sidebar).not.toHaveAttribute('collapsed', '');
    await expect(headerToggle).toBeHidden();
});

/*
 * A press survives the list re-rendering under it. WebKit drops the click when the pressed
 * node leaves the document between mousedown and mouseup, even when it comes straight back,
 * and a re-render that rebuilt or moved rows did exactly that: a conversation clicked while
 * the list settled (a save had just moved a row) did not open. Pressed the way a mouse
 * presses, down, a re-render, up, on a list of our own, so the site's store cannot move
 * anything in between.
 */
type PressWindow = Window & { __selected: string[] };
for (const moves of [false, true]) {
    test(`a press survives a re-render under it${moves ? ' that moves the pressed row' : ''}`, async ({ page }) => {
        await page.goto('/?scenario');
        await page.evaluate(async () => {
            await customElements.whenDefined('aparte-conversation-list');
            const day = 86_400_000;
            const now = Date.now();
            const list = document.createElement('aparte-conversation-list') as HTMLElement & { conversations: unknown[] };
            list.id = 'press-test';
            list.style.cssText = 'position: fixed; inset: 0 auto auto 0; width: 300px; z-index: 10000; background: white';
            document.body.append(list);
            list.conversations = [{ id: 'a', title: 'Alpha', updatedAt: now - 2 * day }, { id: 'b', title: 'Beta', updatedAt: now - 3 * day }];
            (window as unknown as PressWindow).__selected = [];
            list.addEventListener('aparte-conversation-select', (e) => (window as unknown as PressWindow).__selected.push((e as CustomEvent<{ id: string }>).detail.id));
        });
        const box = (await page.locator('#press-test [data-select-id="b"]').boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate((moves) => {
            const day = 86_400_000;
            const now = Date.now();
            const list = document.getElementById('press-test') as HTMLElement & { conversations: unknown[] };
            list.setAttribute('active-id', 'a');
            list.conversations = moves
                ? [{ id: 'b', title: 'Beta', updatedAt: now }, { id: 'a', title: 'Alpha', updatedAt: now - 2 * day }]
                : [{ id: 'a', title: 'Alpha', updatedAt: now - 2 * day }, { id: 'b', title: 'Beta, saved', updatedAt: now - 3 * day }];
        }, moves);
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => (window as unknown as PressWindow).__selected)).toEqual(['b']);
    });
}

/*
 * The welcome's slide, in every framework. `center-empty` / `centerWhenEmpty` slide the composer
 * once a person is in the page (`data-glide`): under Angular the attribute lands on the
 * `<aparte-chat>` host while the centring class is on its inner div, and the first send there
 * snapped the composer down instead.
 *
 * The slide is read on its own clock, not on the frames the machine paints. It is a CSS
 * transition on the spacer's `flex-grow`, and WebKit on a 2-vCPU runner paints it at six to ten
 * frames a second — and the first turn a fresh browser draws stalls its painting for 300 to
 * 860 ms while the page's main thread sits idle, in every framework. A curve sampled with
 * requestAnimationFrame measured the runner, and a stall longer than the slide read as a snap
 * ([328,587,587…]). So the transition is caught where the empty flag drops, inside the send's
 * own task and before any frame, paused, and read at 0, ½ and 1 of its own duration. A snap has
 * no transition to catch; a jump from anything else (an instant change to the viewport, a
 * selector that misses) moves the composer off that clock, so the reads stop stepping down.
 */
type SlideWindow = Window & { __slide?: Animation[] | null };
test('the first send glides the composer down', async ({ page }) => {
    await page.goto('/?scenario&fast');
    await page.locator('#new-chat').click();   // a person in the page
    await expect.poll(() => isEmpty(page)).toBe(true);
    const editor = page.locator('aparte-composer-input [contenteditable], aparte-composer-input textarea').first();
    await editor.fill('Write a haiku about web components.');
    await page.evaluate(() => {
        const w = window as unknown as SlideWindow;
        new MutationObserver((records, observer) => {
            const dropped = records.some((r) => (r.target as Element).matches('aparte-chat, [data-aparte-chat]')
                && !(r.target as Element).hasAttribute(r.attributeName!));
            if (!dropped) return;
            observer.disconnect();
            // `getAnimations()` flushes style first, which is what starts the transition. Both
            // spacers: the welcome and the composer are centred as one block, a spacer above and below.
            const slides = document.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === 'flex-grow'
                && ['::after', '::before'].includes((a.effect as KeyframeEffect | null)?.pseudoElement ?? ''));
            for (const slide of slides) slide.pause();
            w.__slide = slides.some((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === '::after') ? slides : null;
        }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-empty', 'data-aparte-empty'] });
    });
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => (window as unknown as SlideWindow).__slide !== undefined)).toBe(true);
    expect(await page.evaluate(() => !!(window as unknown as SlideWindow).__slide), 'the empty flag dropped with the spacer\'s flex-grow sliding').toBe(true);
    // Where the composer stands at a fraction of the slide's own duration.
    const at = (fraction: number) => page.evaluate((f) => {
        for (const slide of (window as unknown as SlideWindow).__slide!) slide.currentTime = Number(slide.effect!.getComputedTiming().duration) * f;
        return Math.round(document.querySelector('aparte-composer')!.getBoundingClientRect().top);
    }, fraction);
    const first = await at(0);
    const half = await at(0.5);
    const end = await at(1);
    expect(end - first, 'the slide carries the composer from the middle to the bottom').toBeGreaterThan(80);
    expect(half, `halfway through the slide, the composer is on its way (${first} → ${half} → ${end})`).toBeGreaterThan(first + 10);
    expect(half, `halfway through the slide, the composer is on its way (${first} → ${half} → ${end})`).toBeLessThan(end - 10);
});
