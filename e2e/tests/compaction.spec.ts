/**
 * Compaction keeps every message: it writes a checkpoint the model's history resumes from.
 *
 * Every example sets `@aparte/plugin-compaction` up, and the model the mock lists here has
 * a 2 600-token window. Three long turns: the third does not fit, so the plugin summarises
 * the oldest exchange BEFORE the request goes out (through the same mock, which answers
 * with its usual reply), writes the summary on the first turn it keeps, and the client
 * sends from there. What the person sees is checked in the browser — the separator, the
 * six bubbles still on screen, Show summary, Restore — and what the model receives is read
 * off the requests the mock captured.
 */
import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_MODEL_ID, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';
import { collectPageErrors } from '../helpers/actions.js';

/** About 2 400 characters: three of them overflow the window, one fits. */
const long = (tag: string): string => `${tag}: ${'context '.repeat(300)}`.trim();
const SUMMARY_ASK = 'Please summarize the conversation above.';

type Body = { messages?: Array<{ role: string; content: unknown }> };
const text = (content: unknown): string => (typeof content === 'string' ? content : JSON.stringify(content));

test('a compaction keeps every message, sends from the summary, and Restore sends the originals again', async ({ page }) => {
    const errors = collectPageErrors(page);
    const mock = await installLlmMock(page, { models: [{ id: MOCK_MODEL_ID, name: 'Small window', context_length: 2600 }] });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle(long('first'), { expect: MOCK_REPLY_MARK });
    await chat.sendAndSettle(long('second'), { expect: MOCK_REPLY_MARK });
    await chat.sendAndSettle(long('third'), { expect: MOCK_REPLY_MARK });

    // The summary was asked for, once, before the third turn went out.
    const bodies = mock.chatRequests as Body[];
    const asks = bodies.filter((b) => text(b.messages?.at(-1)?.content).includes(SUMMARY_ASK));
    expect(asks).toHaveLength(1);
    expect(text(asks[0]!.messages?.[0]?.content)).toContain('first:');

    // Nothing left the screen, and the separator sits above the first turn kept.
    await expect(chat.bubbles()).toHaveCount(6);
    const separator = page.locator('.aparte-checkpoint');
    await expect(separator).toHaveCount(1);
    await expect(separator).toContainText('2 messages summarised for the model');
    await expect(chat.bubbles('user').nth(1).locator('.aparte-checkpoint')).toHaveCount(1);

    // The third turn's request starts from the summary — merged with the first turn kept, so
    // the roles still alternate — and the first exchange is no longer sent: three messages
    // where there were five. (The summary keeps the first request word for word, clipped,
    // so its opening words are there; the whole of it is not.)
    const third = bodies.at(-1)!;
    const sent = (third.messages ?? []).filter((m) => m.role !== 'system');
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(text(sent[0]!.content)).toContain('This is a summary of what came before');
    expect(text(sent[0]!.content)).toContain('second:');
    expect(sent.map((m) => text(m.content)).join('\n')).not.toContain(long('first'));

    // Show summary unfolds what the model reads instead.
    await separator.getByRole('button', { name: 'Show summary' }).click();
    await expect(separator.locator('.aparte-checkpoint__summary')).toBeVisible();

    // Restore asks, then the separator goes and the next request carries everything again.
    await separator.getByRole('button', { name: 'Restore' }).click();
    await separator.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('.aparte-checkpoint')).toHaveCount(0);
    await chat.sendAndSettle('And now?', { expect: MOCK_REPLY_MARK });
    const after = (mock.chatRequests as Body[]).at(-1)!;
    expect((after.messages ?? []).map((m) => text(m.content)).join('\n')).toContain(long('first'));
    expect(errors).toEqual([]);
});
