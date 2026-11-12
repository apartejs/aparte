/**
 * A key typed in the chat returns to the input — the half only a browser can prove.
 *
 * The unit suite says where the caret goes and that the key is never cancelled
 * (`a-key-typed-in-the-chat-returns-to-the-input.test.ts`). jsdom writes no character on a
 * keydown, so it cannot say what a person cares about: that the letter they typed, the
 * FIRST one included, ends up in the input. Here a real pointer selects text in a reply and
 * a real keyboard types.
 *
 * On every example: "the chat" is `<aparte-chat>` in raw core and under Angular, and a
 * `[data-aparte-chat]` div under React, Vue and Svelte, and the composer has to find it in
 * both shapes.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/** A paragraph of the page around the chat: on `<body>`, so outside any chat root. */
async function addPageText(page: Page): Promise<void> {
    await page.evaluate(() => {
        const p = document.createElement('p');
        p.id = 'around-the-chat';
        p.textContent = 'around the chat';
        p.style.cssText = 'position:fixed;inset-block-start:0;inset-inline-end:0;z-index:2147483647;margin:0;padding:8px;background:#fff;color:#000';
        document.body.appendChild(p);
    });
}

async function openWithOneReply(page: Page): Promise<ChatPage> {
    await installLlmMock(page);
    const chat = new ChatPage(page);
    await page.goto('/');
    await chat.sendAndSettle('Hello');
    return chat;
}

test('a letter typed after selecting text in a reply is written in the input', async ({ page }) => {
    const chat = await openWithOneReply(page);

    // Three clicks on the reply's text select its paragraph, as a person about to copy it does.
    await chat.lastReply.locator('.aparte-segment-text').first().click({ clickCount: 3, position: { x: 12, y: 10 } });
    expect(await page.evaluate(() => String(document.getSelection())), 'precondition: some text is selected').not.toBe('');
    await expect(chat.editor, 'precondition: the click took the caret out of the input').not.toBeFocused();

    // Copying is a shortcut: it must not move the caret, or the selection would be lost first.
    await page.keyboard.press('ControlOrMeta+c');
    await expect(chat.editor).not.toBeFocused();

    await page.keyboard.type('merci');

    await expect(chat.editor).toBeFocused();
    await expect(chat.editor).toHaveText('merci');
});

test('a key typed after a click on the page around the chat is left to the page', async ({ page }) => {
    const chat = await openWithOneReply(page);
    await addPageText(page);

    await page.locator('#around-the-chat').click();
    await page.keyboard.type('x');

    await expect(chat.editor).not.toBeFocused();
    await expect(chat.editor).toHaveText('');
});

test('type-to-focus="page" takes a letter typed anywhere outside a field', async ({ page }) => {
    const chat = await openWithOneReply(page);
    await addPageText(page);
    // Read at every key, so it can be set on a chat already mounted, whatever rendered it.
    await chat.composer.evaluate((composer) => composer.setAttribute('type-to-focus', 'page'));

    await page.locator('#around-the-chat').click();
    await page.keyboard.type('ok');

    await expect(chat.editor).toBeFocused();
    await expect(chat.editor).toHaveText('ok');
});
