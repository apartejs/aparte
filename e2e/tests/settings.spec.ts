/**
 * The settings a consumer changes first: the system prompt, the endpoint, the token.
 *
 * Two of the three have no setter. An endpoint and a token reach a provider only
 * through the **key resolver**, which may return `{ apiKey, endpoint }` instead of
 * a bare string — the single runtime channel for either, honoured on both the chat
 * and the model-list path, and demonstrated in no example until now. Core's own
 * JSDoc calls it "the legacy `string | Record` auth shape".
 *
 * What is asserted here is the half that is observable from the wire: a system
 * prompt typed into the form arrives as the `system` turn of the next request. That
 * covers settings -> config -> client -> provider -> transport end to end. The
 * endpoint and the token are exercised by the same form and the same resolver; the
 * mock answers any host, so a spec cannot see WHICH host was called without the
 * harness capturing URLs, which it does not do yet.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** Distinctive enough that finding it in the request body proves it came from the form. */
const PROMPT = 'You are the aparte e2e settings fixture. Answer in exactly one word.';

test('the settings view offers the three fields, with a local endpoint prefilled', async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/?view=settings');

    const endpoint = page.getByLabel('Endpoint');
    await expect(page.getByLabel('System prompt')).toBeVisible();
    await expect(endpoint).toBeVisible();
    await expect(page.getByLabel('Token')).toBeVisible();

    // Prefilled, so a reader with a local server running can send without typing
    // anything — and so the field shows the SHAPE of a base URL rather than a blank.
    await expect(endpoint).toHaveValue(/^https?:\/\/.+/);
});

test('the chat page offers a way to REACH the settings', async ({ page }) => {
    // The view existed and nothing linked to it: you got there by typing
    // `?view=settings` into the address bar. Reported by the first person to look
    // for it — "je ne vois pas de settings, prompt système non modifiable" — which
    // is this project's own rule about a capability cited in passing, applied to a
    // whole view. The topbar link took the place of a key field for a cloud
    // provider the reader may not have.
    await installLlmMock(page);
    await page.goto('/');

    const link = page.getByRole('link', { name: /settings/i });
    await expect(link, 'the settings view must be reachable by clicking').toBeVisible();

    await link.click();
    await expect(page.getByLabel('System prompt')).toBeVisible();
});

test('the settings form is not on the chat page', async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/');

    // The vanilla example keeps both views in one document and toggles `hidden`.
    // The UA stylesheet's `[hidden] { display: none }` loses to any author rule, and
    // `.app { display: flex }` is one — so the form rendered on the chat page. It
    // shipped that way because this spec only ever loaded `?view=settings`, where
    // the form is supposed to be visible.
    await expect(page.getByLabel('System prompt')).toBeHidden();
    await expect(page.getByLabel('Endpoint')).toBeHidden();
    await expect(page.getByLabel('Token')).toBeHidden();
});

test('a system prompt typed in the settings reaches the next request', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page);

    await page.goto('/?view=settings');
    await page.getByLabel('System prompt').fill(PROMPT);

    // Back to the chat: the value survives the navigation because it is persisted,
    // which is also what makes it apply on a cold load.
    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.editor.fill('hello');
    await chat.sendButton.click();
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);

    const messages = (mock.lastChatRequest()?.['messages'] ?? []) as Array<{ role: string; content: unknown }>;
    expect(messages[0]?.role, 'the first turn must be the system turn').toBe('system');
    expect(JSON.stringify(messages[0]?.content), 'carrying what was typed in the form').toContain('one word');

    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('clearing the system prompt sends no system turn of its own', async ({ page }) => {
    const mock = await installLlmMock(page);

    await page.goto('/?view=settings');
    await page.getByLabel('System prompt').fill(PROMPT);
    // Clearing it must mean "none", not "an empty one": the setter treats `''` as a
    // template, so a blank field would otherwise ship an empty system turn.
    await page.getByLabel('System prompt').fill('');

    await page.goto('/');
    const chat = new ChatPage(page);
    await chat.editor.fill('hello');
    await chat.sendButton.click();
    await expect(chat.lastReply).toContainText(MOCK_REPLY_MARK);

    const messages = (mock.lastChatRequest()?.['messages'] ?? []) as Array<{ role: string; content: unknown }>;
    const system = messages.filter((m) => m.role === 'system');

    /*
     * ONE system turn survives, and it is not the form's.
     *
     * The vanilla example registers `ask_user` (main.ts), whose `AparteTool.systemPrompt`
     * core injects — however many tools set one, they are JOINED into a single message, so
     * this count does not drift as tools are added. What must not be here is a turn from
     * the SETTINGS form, which is what this test has always been about.
     *
     * This used to assert no 'system' role at all, which conflated the two sources. It
     * passed only because the tool prompt was documented and dead; honouring it made the
     * old assertion false without making the behaviour wrong.
     */
    expect(system, 'the cleared form contributes no system turn').toHaveLength(1);
    expect(String(system[0]?.content).trim(), 'and no blank turn is ever shipped').not.toBe('');
    expect(JSON.stringify(system), 'the cleared text never reaches the request').not.toContain(PROMPT);
});
