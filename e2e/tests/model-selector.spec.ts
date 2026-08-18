/**
 * The model selector — the one control a user touches before anything else.
 *
 * Covered before: only "options appear and the gate opens". Not the dropdown, not
 * the provider groups (collapsed by default whenever more than one provider is
 * registered, which is the playground's case), not the keyboard (this is an APG
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
    await page.keyboard.press('ArrowDown');
    const active = chat.modelSelector.locator('aparte-option[data-active]');
    await expect(active).toHaveCount(1);
    const firstActiveId = await active.getAttribute('id');
    await expect(chat.modelTrigger).toHaveAttribute('aria-activedescendant', firstActiveId ?? '');

    await page.keyboard.press('ArrowDown');
    const secondActiveId = await chat.modelSelector.locator('aparte-option[data-active]').getAttribute('id');
    expect(secondActiveId).not.toBe(firstActiveId);

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
    // playground did not ask for.
    test.skip((await search.count()) === 0, 'this playground mounts the selector without `searchable`');

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
    await chat.sendAndSettle('hostile id probe', { expect: MOCK_REPLY_MARK });
    expect(mock.lastChatRequest()?.model, 'the hostile id must reach the request')
        .toBe(MOCK_HOSTILE_MODEL_ID);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});
