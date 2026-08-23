/**
 * The model selector — the one control a user touches before anything else.
 *
 * Covered before: only "options appear and the gate opens". Not the dropdown, not
 * the provider groups (collapsed by default whenever more than one provider is
 * registered, which is the example's case), not the keyboard (this is an APG
 * combobox), not the search filter, and not whether the picked model actually
 * reaches the request. Also guards a past crash: a model id containing `"` or `]`
 * used to break an interpolated attribute selector.
 */

import { test, expect } from '@playwright/test';
import {
    installLlmMock,
    MOCK_HOSTILE_MODEL_ID,
    MOCK_MODEL_ID,
    MOCK_REPLY_MARK,
    type LlmMock,
} from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const MANY_MODELS = [
    { id: MOCK_MODEL_ID, name: 'Aparte E2E Model' },
    { id: 'mistral-small-e2e', name: 'Mistral Small E2E' },
    { id: 'qwen-e2e', name: 'Qwen E2E' },
    { id: MOCK_HOSTILE_MODEL_ID, name: 'Hostile "quoted] id' },
];

test('the dropdown opens on click and closes on Escape', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { models: MANY_MODELS });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await chat.modelTrigger.click();
    await expect(chat.modelDropdown).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(chat.modelDropdown).toBeHidden();

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a collapsed provider group hides its models until expanded', async ({ page }) => {
    await installLlmMock(page, { models: MANY_MODELS });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await chat.modelTrigger.click();
    await expect(chat.modelDropdown).toBeVisible();
    test.skip((await chat.modelGroups.count()) === 0, 'single provider: the list is flat here');

    // Groups are listed, their models are not — that is the whole point of the
    // grouped mode with several providers registered.
    await expect(chat.modelGroups.first()).toBeVisible();
    await expect(chat.modelOptions.first()).toBeHidden();

    await chat.modelGroups.first().locator('.aparte-optgroup-header').click();
    await expect(chat.modelOptions.first()).toBeVisible();

    // Collapsing again hides them.
    await chat.modelGroups.first().locator('.aparte-optgroup-header').click();
    await expect(chat.modelOptions.first()).toBeHidden();
});

test('arrow keys move the active option and Enter selects it', async ({ page }) => {
    await installLlmMock(page, { models: MANY_MODELS });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await chat.openModelList();

    // A roving highlight, mirrored into aria-activedescendant for screen readers.
    //
    // Read both halves in ONE DOM snapshot. The ids are minted per ELEMENT
    // (`aparte-option-N`, on first activation), and the selector may rebuild every
    // option element under us — so an id read a round-trip earlier can name an
    // element that no longer exists while the highlight sits, correctly, on its
    // replacement. Comparing the two reads reported an inconsistency that never
    // existed. The invariant is what matters: the announced id IS the highlighted
    // option's.
    const highlight = () => chat.modelSelector.evaluate((selector) => {
        const active = Array.from(selector.querySelectorAll('aparte-option[data-active]'));
        const trigger = selector.querySelector('.aparte-select-trigger');
        return {
            count: active.length,
            id: (active[0] as HTMLElement | undefined)?.id ?? null,
            label: active[0]?.textContent?.trim() ?? null,
            announced: trigger?.getAttribute('aria-activedescendant') ?? null,
        };
    });

    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => {
        const h = await highlight();
        return h.count === 1 && h.id !== null && h.announced === h.id ? 'announced' : JSON.stringify(h);
    }, { message: 'aria-activedescendant must name the one highlighted option' }).toBe('announced');

    // ArrowDown moves the highlight to another MODEL. Compared by label, not by id:
    // a rebuild re-mints the id of the very same position, so an id change proves
    // nothing and an id match is not the contract.
    const first = await highlight();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => {
        const h = await highlight();
        return h.label === first.label ? `still on "${h.label}"` : 'moved';
    }, { message: 'ArrowDown must move the highlight off the first option' }).toBe('moved');

    await page.keyboard.press('Enter');
    await expect(chat.modelDropdown).toBeHidden();
});

test('the search field filters the list', async ({ page }) => {
    await installLlmMock(page, { models: MANY_MODELS });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await chat.modelTrigger.click();
    const search = chat.modelSelector.locator('.aparte-select-search');
    // `searchable` is opt-in per app; skip rather than assert a control this
    // example did not ask for.
    test.skip((await search.count()) === 0, 'this example mounts the selector without `searchable`');

    const total = await chat.modelOptions.count();
    await search.fill('qwen');
    await expect.poll(async () => chat.modelOptions.filter({ visible: true }).count()).toBeLessThan(total);
    await expect(chat.modelOptions.filter({ visible: true }).first()).toContainText(/qwen/i);
});

test('a model id containing quotes and brackets selects without breaking', async ({ page }) => {
    // Regression guard: the selected-label lookup used to interpolate the id into
    // an attribute selector, so `a"b]c` threw a SyntaxError and took the UI down.
    const errors = collectPageErrors(page);
    const mock: LlmMock = await installLlmMock(page, { models: MANY_MODELS });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.waitUngated();

    await chat.selectModelByKeyboard('Hostile');

    // The trigger shows it, and the chat still works with it selected.
    await expect(chat.modelTrigger).toContainText('Hostile');

    // Diagnostics, read BEFORE the send. This assertion has failed in CI and only in
    // CI — the trigger said "Hostile" while the request carried the default model —
    // and it resisted two reproduction attempts on a fast machine (8 parallel repeats,
    // then a deliberately slowed `/models`). Rather than keep guessing, the failure
    // now reports which half decoupled:
    //   • `selectValue` already holds the hostile composite → the pick reached
    //     <aparte-select>, and what did not follow is the model CONFIG the client
    //     reads (so: <aparte-model-selector>'s change listener, or persistence);
    //   • `selectValue` still holds the default → the pick never landed in the
    //     select at all, and the trigger text is the stale half.
    const state = await page.evaluate(() => {
        const selector = document.querySelector('aparte-model-selector');
        const select = selector?.querySelector('aparte-select');
        return {
            selectValue: select?.getAttribute('value') ?? null,
            selectAttached: !!select && document.contains(select),
            activeOptions: selector?.querySelectorAll('aparte-option[data-active]').length ?? -1,
            triggerText: selector?.querySelector('.aparte-select-trigger')?.textContent?.trim() ?? null,
        };
    });

    await chat.sendAndSettle('hostile id probe', { expect: MOCK_REPLY_MARK });
    expect(
        mock.lastChatRequest()?.model,
        `the hostile id must reach the request.\n`
        + `  UI state before send: ${JSON.stringify(state)}\n`
        + `  models seen in requests: ${JSON.stringify(mock.chatRequests.map((r) => r['model']))}`,
    ).toBe(MOCK_HOSTILE_MODEL_ID);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
