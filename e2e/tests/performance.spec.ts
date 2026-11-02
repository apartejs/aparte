/**
 * The runtime budget, measured in a real browser and held: how soon a streamed chunk is on screen,
 * and what a long conversation costs.
 *
 * - Chunk to paint: the reply streams 145 small Markdown chunks, `pace` ms apart, through the real
 *   pipeline (provider, transport, client, renderers). The page stamps the moment each chunk leaves
 *   the network layer, and samples the reply's text on every animation frame; a chunk's latency is
 *   the time to the first frame whose text grew past what was on screen when it arrived. Chunks that
 *   draw nothing new on their own (a held-back Markdown token) are counted with the frame that does.
 * - A long conversation: 500 messages set at once, then the JavaScript heap after a forced garbage
 *   collection, against the same page before them, and the time the call took.
 *
 * Chromium only: the heap is read through the DevTools protocol. The budgets are the ones the
 * performance reference page publishes; the numbers measured are printed in the log and kept as
 * annotations, so a run shows where it sits under them.
 *
 * Measured ALONE, or not at all: its own project (`performance`), one worker, the two tests in
 * turn. Inside the vanilla suite it shared a four-core runner with three other browsers, and the
 * chunk-to-paint p95 swung across its 50 ms ceiling with nothing changed in what it measures:
 * under it on three runs, 52.2 and 55.1 ms on main after an unrelated merge. A time measured
 * against whatever happens to run beside it is a measure of the neighbours. With more than one
 * worker the tests skip and say how to run them.
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { installLlmMock, LONG_REPLY_MARK } from '../helpers/mock-llm.js';
import { ChatPage } from '../helpers/chat.js';

/**
 * The published budgets, from the file the performance reference page reads: a run over one of
 * them fails. `chunkToPaintP95Ms` — 95th percentile, chunk read to the first frame showing it;
 * `heap500Mb` — heap growth for 500 messages after garbage collection; `render500Ms` — the
 * `setMessages` call for 500 messages, until it returns.
 */
const BUDGET = JSON.parse(readFileSync(new URL('../../apps/docs/src/data/performance-budget.json', import.meta.url), 'utf8')) as {
    chunkToPaintP95Ms: number;
    heap500Mb: number;
    render500Ms: number;
};

const percentile = (values: number[], p: number): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

/** Stamps every chunk of an event stream as it is read, and the reply's text length on every frame. */
async function armStreamClock(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const perf = { reads: [] as number[], frames: [] as Array<[number, number]> };
        (window as unknown as { __aparteStreamClock: typeof perf }).__aparteStreamClock = perf;
        const original = window.fetch;
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const response = await original.apply(window, args);
            if (!response.body || !(response.headers.get('content-type') ?? '').includes('event-stream')) return response;
            const stamp = new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) { perf.reads.push(performance.now()); controller.enqueue(chunk); },
            });
            return new Response(response.body.pipeThrough(stamp), { status: response.status, statusText: response.statusText, headers: response.headers });
        };
        const sample = (): void => {
            const replies = document.querySelectorAll('aparte-chat-bubble[data-role="assistant"] .aparte-segments');
            perf.frames.push([performance.now(), replies.length ? (replies[replies.length - 1]!.textContent ?? '').length : 0]);
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
}

test.describe('the performance budget', () => {
    test.describe.configure({ mode: 'serial' });
    test.skip(({ browserName }) => browserName !== 'chromium', 'the heap is read through the DevTools protocol');
    test.skip(() => test.info().config.workers > 1, 'measured alone: playwright test --project=performance --workers=1');

    test('a streamed chunk is on screen within the budget', async ({ page }) => {
        await installLlmMock(page, { scenario: 'long-reply', pace: 20 });
        await armStreamClock(page);
        const chat = new ChatPage(page);
        await page.goto('/');
        await chat.sendAndSettle('Write something long.', { expect: LONG_REPLY_MARK });

        const { reads, frames } = await page.evaluate(() => (window as unknown as { __aparteStreamClock: { reads: number[]; frames: Array<[number, number]> } }).__aparteStreamClock);
        const latencies: number[] = [];
        for (const read of reads) {
            const before = frames.filter(([t]) => t < read).at(-1)?.[1] ?? 0;
            const shown = frames.find(([t, length]) => t >= read && length > before);
            if (shown) latencies.push(shown[0] - read);
        }
        const p95 = percentile(latencies, 95);
        const measured = `p50 ${percentile(latencies, 50).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${Math.max(...latencies).toFixed(1)} ms over ${latencies.length} chunks`;
        console.log(`[performance] chunk to paint: ${measured} (ceiling ${BUDGET.chunkToPaintP95Ms} ms)`);
        test.info().annotations.push({ type: 'chunk-to-paint', description: measured });
        expect(latencies.length, 'most chunks drew something').toBeGreaterThan(100);
        expect(p95).toBeLessThan(BUDGET.chunkToPaintP95Ms);
    });

    test('500 messages fit the memory and time budget', async ({ page }) => {
        const chat = new ChatPage(page);
        await page.goto('/');
        await expect(chat.viewport).toBeVisible();
        const cdp = await page.context().newCDPSession(page);
        const heap = async (): Promise<number> => {
            await cdp.send('HeapProfiler.collectGarbage');
            return (await cdp.send('Runtime.getHeapUsage')).usedSize;
        };
        const before = await heap();

        const renderMs = await page.evaluate((count) => {
            const prose = 'Some ordinary prose, the length of a short answer. '.repeat(8);
            const messages = Array.from({ length: count }, (_, i) => ({
                id: `perf-${i}`,
                role: i % 2 ? 'assistant' : 'user',
                content: i % 2 ? `Answer ${i}: **bold**, \`code\` and a list:\n\n- one\n- two\n\n${prose}` : `Question ${i}?`,
                timestamp: Date.now(),
            }));
            const viewport = document.querySelector('aparte-chat-viewport') as HTMLElement & { setMessages(m: unknown[]): void };
            const start = performance.now();
            viewport.setMessages(messages);
            return performance.now() - start;
        }, 500);
        await expect(page.locator('aparte-chat-bubble')).toHaveCount(500);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

        const grownMb = (await heap() - before) / (1024 * 1024);
        const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
        const measured = `heap +${grownMb.toFixed(1)} MB, setMessages ${renderMs.toFixed(0)} ms, ${nodes} elements on the page`;
        console.log(`[performance] 500 messages: ${measured} (ceilings ${BUDGET.heap500Mb} MB, ${BUDGET.render500Ms} ms)`);
        test.info().annotations.push({ type: '500-messages', description: measured });
        expect(grownMb).toBeLessThan(BUDGET.heap500Mb);
        expect(renderMs).toBeLessThan(BUDGET.render500Ms);
    });
});
