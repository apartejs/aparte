/**
 * The artifact card, from a real stream — the first browser coverage the feature has.
 *
 * The artifact is `@aparte/plugin-artifacts`' now, and this runs where the examples set
 * it up (vanilla and React). The mock streams an `<artifact>` tag cut across deltas —
 * mid-attribute, mid-closing-tag — so what is exercised is the whole chain: core's
 * block-grammar parser, the plugin's segment, the card, and the gesture the preview
 * requires. Nothing here runs the model's markup before a person presses Preview.
 */

import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_ARTIFACT_MARK, MOCK_ARTIFACT_TITLE } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

test('an <artifact> tag in the prose renders as a card that opens on Code, with the prose around it intact', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'artifact' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('write me a page', { expect: 'Tell me what to change' });

    const card = chat.segment('artifact-card').first();
    await expect(card, 'the tag became a card').toBeAttached();
    await expect(card.locator('.aparte-art-card__title')).toHaveText(MOCK_ARTIFACT_TITLE);
    await expect(card).toHaveAttribute('data-artifact-type', 'html');
    // Settled: no pulse, the Preview tab offered, Download enabled.
    await expect(card).toHaveAttribute('data-streaming', 'false');
    await expect(card.locator('.aparte-art-card__pulse')).toHaveCount(0);
    await expect(card.locator('[data-tab-target="preview"]')).toBeEnabled();
    await expect(card.locator('[data-action="download"]')).toBeEnabled();

    // Opens on Code, and the code pane shows the SOURCE, escaped — not a rendered <h1>.
    await expect(card).toHaveAttribute('data-tab', 'code');
    const codePane = card.locator('.aparte-art-card__pane[data-pane="code"]');
    await expect(codePane).toContainText(`<h1>${MOCK_ARTIFACT_MARK}</h1>`);
    expect(await card.locator('h1').count(), 'the markup is shown, not rendered').toBe(0);
    await expect(card.locator('iframe'), 'no frame before a gesture').toHaveCount(0);

    // The prose on either side of the tag is still prose, in order.
    const reply = chat.lastReply;
    await expect(reply).toContainText('Here is a first draft:');
    await expect(reply).toContainText('Tell me what to change.');
    const text = await reply.innerText();
    expect(text.indexOf('Here is a first draft:')).toBeLessThan(text.indexOf(MOCK_ARTIFACT_MARK));
    expect(text.indexOf(MOCK_ARTIFACT_MARK)).toBeLessThan(text.indexOf('Tell me what to change.'));
    // And the tag itself never leaked into the text.
    expect(text).not.toContain('<artifact');
    expect(text).not.toContain('</artifact>');

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('pressing Preview mounts the sandboxed frame, once, with the policy declared twice', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'artifact' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('write me a page', { expect: 'Tell me what to change' });

    const card = chat.segment('artifact-card').first();
    const previewTab = card.locator('[data-tab-target="preview"]');
    await previewTab.click();

    await expect(card).toHaveAttribute('data-tab', 'preview');
    const frame = card.locator('iframe');
    await expect(frame).toHaveCount(1);
    // `allow-scripts` and nothing else: an opaque origin that cannot read this page.
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(frame).toHaveAttribute('csp', /default-src 'none'/);
    const srcdoc = (await frame.getAttribute('srcdoc')) ?? '';
    expect(srcdoc, 'the meta policy is the half Firefox and Safari read').toContain('Content-Security-Policy');
    expect(srcdoc).toContain(MOCK_ARTIFACT_MARK);

    // The frame really rendered the document, inside the sandbox.
    const inner = page.frameLocator('.aparte-art-card__frame').locator('h1');
    await expect(inner).toHaveText(MOCK_ARTIFACT_MARK);

    // Back and forth does not mount a second frame — and does not destroy the first.
    await card.locator('[data-tab-target="code"]').click();
    await expect(card).toHaveAttribute('data-tab', 'code');
    await previewTab.click();
    await expect(card.locator('iframe')).toHaveCount(1);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the tablist is one tab stop and the arrow keys move between Code and Preview', async ({ page }) => {
    await installLlmMock(page, { scenario: 'artifact' });
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('write me a page', { expect: 'Tell me what to change' });

    const card = chat.segment('artifact-card').first();
    const code = card.locator('[data-tab-target="code"]');
    const preview = card.locator('[data-tab-target="preview"]');
    await code.focus();
    await expect(code).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(preview).toBeFocused();
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    await expect(code).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('Home');
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute('aria-selected', 'true');
});
