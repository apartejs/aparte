/**
 * Two chats, two configs, and a tool that has to ask the user something.
 *
 * This is the browser half of the worst bug the third audit found, and the reason
 * it survived three audits is that nothing could see it. `<aparte-elicitation>`
 * registers itself as the presenter for the config it can resolve at
 * `connectedCallback`. Every wrapper calls `AparteChatHost.bind()` — which is what
 * attaches the config boundary — from a POST-mount hook (React `useEffect`, Vue
 * `onMounted`, Svelte `onMount`, Angular `ngAfterViewInit`), so the element
 * connects BEFORE the boundary exists and registered on the page-global singleton.
 * A tool handler then called `requestUserInput()`, which resolves the chat's OWN
 * config, found no presenter, and answered `{action:'cancel'}`.
 *
 * The model was told the user refused a question the user was never shown. No
 * error, no warning, and every unit test passed because jsdom fixtures attach the
 * boundary first — the one ordering no wrapper produces.
 *
 * So this suite runs on all four wrappers, not on `vanilla`: raw core has no
 * `bind()` and cannot reproduce it. It is the same reason the toolbar suite runs
 * five times — parity across four different lifecycle hooks is exactly the claim.
 *
 * Fixture: `?view=workbench`, two `<AparteChat config={…}>` panes, each with its
 * own provider, its own `AparteClient`, `setupAskQuestion(config)` and an
 * `<aparte-elicitation>` mounted inside.
 */

import { test, expect } from '@playwright/test';
import {
    installLlmMock,
    MOCK_REPLY_MARK,
    MOCK_ASK_QUESTION,
    MOCK_ASK_OPTIONS,
    MOCK_ASK_TOOL_NAME,
} from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** The two panes' roots. `data-pane` carries the label a human reads. */
const LEFT = '[data-pane="Ollama"]';
const RIGHT = '[data-pane="LM Studio"]';

/** The panel `<aparte-elicitation>` mounts into a composer. */
const PANEL = '.aparte-elic-panel';

test('the two panes mount with their own providers', async ({ page }) => {
    await installLlmMock(page);
    await page.goto('/?view=workbench');

    const left = new ChatPage(page, LEFT);
    const right = new ChatPage(page, RIGHT);

    await expect(left.editor).toBeVisible();
    await expect(right.editor).toBeVisible();

    // Different labels means different configs: one shared config could not
    // produce two.
    await expect(page.locator(`${LEFT} .pane-provider`)).toHaveText('localhost:11434');
    await expect(page.locator(`${RIGHT} .pane-provider`)).toHaveText('localhost:1234');
});

test('a reply lands only in the pane that asked', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page);
    await page.goto('/?view=workbench');

    const left = new ChatPage(page, LEFT);
    const right = new ChatPage(page, RIGHT);

    await left.editor.fill('hello from the left pane');
    await left.sendButton.click();

    await expect(left.lastReply).toContainText(MOCK_REPLY_MARK);
    // The other pane's client listens on the same `window`. A mis-resolved target
    // is how a reply lands in the wrong transcript.
    await expect(right.bubbles()).toHaveCount(0);
    expect(errors, 'no uncaught page errors').toEqual([]);
});

/**
 * BLOCKED, not broken — and blocked on a defect this fixture found.
 *
 * Building it surfaced something three cold audits missed: on the documented
 * primary path, NO tool is ever offered to the model. `_toolsForCurrentModel()`
 * gates on `getCurrentModel()?.capabilities?.includes('function_calling')`;
 * `getCurrentModel()` reads `provider.getModels()`, which returns the STATIC
 * `opts.models`; the presets set none, and `fetchModels()` neither declares
 * `function_calling` (it hardcodes `['streaming']`) nor writes its result back. So
 * the gate is `false` for every preset provider, and `tools: []` goes on the wire.
 *
 * Proven, not inferred — captured from the browser with the tool registered:
 *   req#0 tools=[]   req#1 tools=[]
 * and in Node: `getModels() = []`, `getCurrentModel() = undefined`,
 * `getTools().length = 1`, gate `false`.
 *
 * That makes the whole tools guide, `needsApproval`, HITL and
 * `@aparte/plugin-ask-question` inert on that path — which is also why the plugin
 * had no in-repo consumer and why the mock's `tool-call` scenario is used by no
 * spec. Fixing it is a product decision (should an OpenAI-COMPATIBLE endpoint
 * declare `function_calling` by default? should a fetched list reach
 * `getCurrentModel()`?), so it is not being decided inside a test file.
 *
 * These two unskip the moment that lands. Everything above them passes today and
 * already covers the config boundary that the CRITICAL broke.
 */
test.fixme('a tool that asks the user shows its panel in the pane that asked', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { scenario: 'ask-question' });
    await page.goto('/?view=workbench');

    const left = new ChatPage(page, LEFT);

    await left.editor.fill('ask me something');
    await left.sendButton.click();

    // THE assertion. Before the fix this panel never appeared anywhere: the
    // presenter sat on the global config, the handler resolved the pane's own, and
    // the model was told `cancel`.
    const panel = page.locator(`${LEFT} ${PANEL}`);
    await expect(panel, 'the panel must appear in the pane whose tool asked').toBeVisible();
    await expect(panel).toContainText(MOCK_ASK_QUESTION);
    for (const option of MOCK_ASK_OPTIONS) {
        await expect(panel, `option "${option}" must be offered`).toContainText(option);
    }

    // And nowhere else: the other pane resolves a different config, so its
    // presenter must not have been asked.
    await expect(page.locator(`${RIGHT} ${PANEL}`), 'the other pane must stay untouched').toHaveCount(0);

    // The tool call really left the browser, rather than the panel being local
    // theatre: the first request offered the tool the plugin registered.
    const first = mock.chatRequests[0];
    const toolNames = ((first?.['tools'] ?? []) as Array<{ function?: { name?: string } }>)
        .map((t) => t.function?.name);
    expect(toolNames, 'the pane config had the ask_question tool registered').toContain(MOCK_ASK_TOOL_NAME);

    expect(errors, 'no uncaught page errors').toEqual([]);
});

test.fixme('answering the panel resumes the turn and the answer reaches the model', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { scenario: 'ask-question' });
    await page.goto('/?view=workbench');

    const left = new ChatPage(page, LEFT);
    await left.editor.fill('ask me something');
    await left.sendButton.click();

    const panel = page.locator(`${LEFT} ${PANEL}`);
    await expect(panel).toBeVisible();

    // Pick the first option, then submit through the composer's send button —
    // which the panel takes over while it is open.
    await panel.getByText(MOCK_ASK_OPTIONS[0], { exact: false }).first().click();
    await left.sendButton.click();

    // The panel closes and the turn continues: the mock answers the SECOND request
    // with plain text, which is the reply that lands.
    await expect(panel).toHaveCount(0);
    await expect(left.lastReply).toContainText(MOCK_REPLY_MARK);

    // The answer has to have reached the model, not just the DOM. The second
    // request carries the tool result for the call the first one made.
    await expect(async () => {
        expect(mock.chatRequests.length, 'a second turn was sent').toBeGreaterThan(1);
        const messages = JSON.stringify(mock.chatRequests.at(-1)?.['messages'] ?? []);
        expect(messages, 'the tool result carries the chosen option').toContain(MOCK_ASK_OPTIONS[0]);
    }).toPass();

    expect(errors, 'no uncaught page errors').toEqual([]);
});
