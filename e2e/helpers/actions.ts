/**
 * Shared page actions for the playground smoke suites. These operate on the
 * `@aparte/core` custom-element DOM, which is identical across every wrapper —
 * so one helper drives React, Vue, Svelte, Angular and vanilla alike.
 */

import { expect, type Page } from '@playwright/test';
import { MOCK_REPLY_MARK } from './mock-llm.js';

const UNGATED = 'aparte-composer:not([data-model-gated])';
const EDITOR = 'aparte-composer-input [contenteditable="true"]';
const SEND = 'aparte-composer-send button';

/**
 * Start collecting uncaught page errors, filtering the benign Chromium
 * "ResizeObserver loop completed with undelivered notifications" notice — the
 * viewport's layout-mutating ResizeObserver (auto-scroll) can emit it, and it
 * would otherwise flake the mount test's "no errors" assertion. Returns the
 * array, which fills as errors occur.
 */
export function collectPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('pageerror', (e) => {
        if (/ResizeObserver loop/i.test(e.message)) return;
        errors.push(e.message);
    });
    return errors;
}

/**
 * Wait until the require-model gate opens — i.e. the selector fetched its list
 * and a model auto-selected. Until then `submit()` is blocked by core, so any
 * send would silently no-op.
 */
export async function waitUngated(page: Page): Promise<void> {
    await expect(page.locator(UNGATED).first()).toBeAttached({ timeout: 20_000 });
}

/**
 * Type `text` into the composer and send it through the real UI (button click
 * → `submit()` → `aparte-send` → client), then wait for the streamed assistant
 * reply to render. `gated: false` skips the gate wait for playgrounds that
 * don't opt into the require-model gate (e.g. demo-vanilla).
 */
export async function sendMessage(page: Page, text: string, opts: { gated?: boolean } = {}): Promise<void> {
    if (opts.gated !== false) await waitUngated(page);

    const priorReplies = await page.locator('aparte-chat-bubble[data-role="assistant"]').count();

    // pressSequentially is bound to the (re-resolved) editor locator, so a
    // framework re-render between focus and typing can't drop the keystrokes.
    const editor = page.locator(EDITOR).first();
    await editor.click();
    await editor.pressSequentially(text);
    await page.locator(SEND).first().click();

    // A NEW assistant bubble finishes streaming the canned reply.
    const assistant = page.locator('aparte-chat-bubble[data-role="assistant"]');
    await expect(assistant).toHaveCount(priorReplies + 1, { timeout: 20_000 });
    await expect(assistant.last()).toContainText(MOCK_REPLY_MARK, { timeout: 20_000 });
}

/** Roles of the rendered chat bubbles, in DOM order (e.g. ['user','assistant']). */
export async function bubbleRoles(page: Page): Promise<(string | null)[]> {
    return page
        .locator('aparte-chat-bubble')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-role')));
}
