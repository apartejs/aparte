/**
 * What a segment knows about itself, in a real browser.
 *
 * Core stamps `messageId` and `index` on every segment and puts its own measurements
 * in `meta.aparte` — no protocol carries a timestamp on a content block, so a span is a
 * LOCAL measurement and its shape says so. A settled reasoning block draws it:
 * "Thought for 8s" (`thoughtFor`, the duration in the locale's units). This spec
 * asserts both halves in a real browser:
 *
 *   - the DATA: the segments in the viewport's own model carry the fields, after a
 *     real stream through a real parser. Unit tests drive the owners directly; this
 *     is the only place the whole chain runs.
 *   - the RENDER: the reasoning label turns into its duration once the block settles,
 *     while the answer still streams — because the example site turns `showDuration`
 *     on (its models stream their reasoning); core's default reads "Thought".
 *
 * `vanilla` only, and deliberately — same reasoning as `bubble-layout`: the label is
 * core's, so four more frameworks would prove nothing new. The data half is covered
 * on both owners by the unit suite.
 */
import { test, expect } from '@playwright/test';
import { installLlmMock, MOCK_REPLY_MARK } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

/** The shape the page hands back — only the fields under test. */
interface StampedSegment {
    type: string;
    messageId?: string;
    index?: number;
    meta?: { aparte?: { startedAt?: number; endedAt?: number } };
}

test('a streamed reply leaves every segment knowing its message, its place and its span', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'thinking' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('measure this', { expect: MOCK_REPLY_MARK });

    const read = async (): Promise<StampedSegment[]> =>
        page.evaluate(() => {
            const el = document.querySelector('aparte-chat') as
                (HTMLElement & { viewport?: { getMessages(): Array<{ role: string; segments?: unknown[] }> } }) | null;
            const messages = el?.viewport?.getMessages() ?? [];
            const last = [...messages].reverse().find((m) => m.role === 'assistant');
            return (last?.segments ?? []) as StampedSegment[];
        });

    // The reasoning scenario produces a thinking block and the visible answer, so
    // there is more than one segment — which is what makes `index` worth asserting.
    await expect.poll(async () => (await read()).length, { timeout: 15_000 }).toBeGreaterThan(1);
    const segments = await read();

    expect(segments.some((s) => s.type === 'thinking'), 'the reasoning scenario must yield a thinking segment')
        .toBe(true);

    // One message id, shared, and not empty.
    const owners = new Set(segments.map((s) => s.messageId));
    expect(owners.size, `every segment belongs to one message, got ${[...owners].join(', ')}`).toBe(1);
    expect([...owners][0]).toBeTruthy();

    // Positions are 0..n-1 in order. A `toBeDefined` per segment would pass on a
    // list where two segments claim index 0, which is the failure that mattered.
    expect(segments.map((s) => s.index)).toEqual(segments.map((_, i) => i));

    // Every segment has a start; the settled reasoning block has a real span.
    expect(segments.every((s) => typeof s.meta?.aparte?.startedAt === 'number')).toBe(true);
    const thinking = segments.find((s) => s.type === 'thinking')!;
    expect(thinking.meta?.aparte?.endedAt, 'a closed reasoning block has an end').toBeDefined();
    expect(thinking.meta!.aparte!.endedAt! - thinking.meta!.aparte!.startedAt!).toBeGreaterThanOrEqual(0);

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a settled reasoning block reads its duration', async ({ page }) => {
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'thinking' });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.sendAndSettle('measure this too', { expect: MOCK_REPLY_MARK });

    // Asserted as a PATTERN, not as "not empty": "Thinking" is non-empty too, so a
    // looser assertion would stay green with the duration never drawn. A mocked stream
    // settles in milliseconds, and the label floors a span at one second.
    await expect(chat.segment('thinking').first().locator('.aparte-thinking-label'))
        .toHaveText(/^Thought for \d+(s|m)/, { timeout: 15_000 });

    expect(errors, `uncaught page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the reasoning line is readable while the answer is still streaming', async ({ page }) => {
    // The point of the feature, and the half that was missing for most of its
    // making: a correct duration that only becomes readable once the turn is over
    // cannot reproduce the interface it exists for. It takes a PACED stream to see
    // that — the buffered mock delivers the reasoning and the answer in the same
    // millisecond, which is exactly why no test in this repo could feel the defect.
    const errors = collectPageErrors(page);
    await installLlmMock(page, { scenario: 'long-thinking', pace: 120 });
    const chat = new ChatPage(page);
    await page.goto('/');

    await chat.send('measure while it runs');

    // Still in flight…
    await expect(chat.sendButton).toHaveClass(/aparte-is-streaming/, { timeout: 15_000 });
    // …and the reasoning block already reports its own duration. Asserted in this
    // order on purpose: the label must be readable BEFORE the turn ends, not after.
    await expect(chat.segment('thinking').first().locator('.aparte-thinking-label'))
        .toHaveText(/^Thought for \d+(s|m)/, { timeout: 20_000 });
    await expect(chat.sendButton, 'the label must land before the turn ends')
        .toHaveClass(/aparte-is-streaming/);

    expect(errors, 'uncaught page errors:\n' + errors.join('\n')).toEqual([]);
});
