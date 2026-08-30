/**
 * #57 — a send GLIDES the new message to the top of the view; nothing cuts it.
 *
 * The unit harness (`send-glide-is-not-cut.test.ts`) pins the rule — no instant
 * `scrollTop` write while a smooth scroll of ours is in flight — against scripted
 * geometry. This is the same rule against a real layout: a real spacer, a real
 * placeholder bubble, a real first token, and the browser's own smooth scroll.
 *
 * Two instruments, because engines differ on what "smooth" means in an automated
 * browser (a headless engine may animate over a few frames or land in one):
 *
 *   1. the WRITES — every direct `scrollTop =` on the transcript and every
 *      `scrollTo()` call, tagged with its `behavior`, from the send until the reply
 *      has settled. The defect is an instant write inside the glide window; before
 *      the fix there were five in the send's own frame.
 *   2. the CURVE — `scrollTop` per animation frame. Where the engine animates, the
 *      ascent must be spread over frames, not one step; where it does not, the curve
 *      cannot condemn and only the writes do.
 */

import { test, expect, type Page } from '@playwright/test';
import { installLlmMock } from '../helpers/mock-llm.js';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

interface Instruments {
    writes: { t: number; kind: 'instant' | 'smooth' | 'scrollTo-instant'; top: number }[];
    curve: { t: number; top: number; max: number }[];
}

declare global {
    interface Window { __glide?: Instruments & { stop(): void } }
}

test.beforeEach(async ({ page }) => {
    await installLlmMock(page);
});

/** Arm both instruments on the transcript's scroll surface. */
async function arm(page: Page): Promise<void> {
    await page.evaluate(() => {
        const s = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        const t0 = performance.now();
        const inst: Instruments & { stop(): void } = { writes: [], curve: [], stop() { running = false; } };
        let running = true;

        // The writes: the instance shadows the prototype accessor and forwards to it.
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
        Object.defineProperty(s, 'scrollTop', {
            configurable: true,
            get() { return (desc.get as () => number).call(this); },
            set(v: number) { inst.writes.push({ t: performance.now() - t0, kind: 'instant', top: v }); (desc.set as (v: number) => void).call(this, v); },
        });
        const nativeScrollTo = s.scrollTo.bind(s) as (o: ScrollToOptions) => void;
        (s as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo = (o: ScrollToOptions) => {
            inst.writes.push({ t: performance.now() - t0, kind: o?.behavior === 'smooth' ? 'smooth' : 'scrollTo-instant', top: Number(o?.top ?? 0) });
            nativeScrollTo(o);
        };

        // The curve.
        const tick = (): void => {
            inst.curve.push({ t: performance.now() - t0, top: (desc.get as () => number).call(s), max: s.scrollHeight - s.clientHeight });
            if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.__glide = inst;
    });
}

async function read(page: Page): Promise<Instruments> {
    return page.evaluate(() => {
        const g = window.__glide!;
        g.stop();
        return { writes: g.writes, curve: g.curve };
    });
}

test('the send glides: no instant write cuts it, and the ascent is spread over frames where the engine animates', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/');

    // Enough turns to overflow, so the send has a distance to glide over.
    for (let i = 0; i < 5; i++) await chat.sendAndSettle(`filler turn ${i}`);
    await expect.poll(
        () => page.evaluate(() => {
            const s = (document.querySelector('.aparte-viewport-container')
                ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
            return s.scrollHeight - s.clientHeight;
        }),
        { message: 'the transcript never overflowed' },
    ).toBeGreaterThan(200);

    await arm(page);
    await chat.send('glide probe');
    await expect(chat.streaming()).toHaveCount(0, { timeout: 15_000 });
    // Let the settle window close so a late instant write would be recorded too.
    await page.waitForTimeout(600);
    const { writes, curve } = await read(page);

    const smooth = writes.filter((w) => w.kind === 'smooth');
    expect(smooth.length, `the send glides (writes: ${JSON.stringify(writes.slice(0, 12))})`).toBeGreaterThanOrEqual(1);

    // ── 1. No instant write inside the glide window ────────────────────────
    // The window: from the first smooth call to 450 ms later (the component's budget;
    // `scrollend` may close it earlier, and an instant write after THAT is streaming
    // doing its job — so only writes inside the budget AND before the curve reached
    // its target are held against it).
    const glideStart = smooth[0]!.t;
    const target = curve.at(-1)!.max;
    const arrivedAt = curve.find((p) => p.max - p.top <= 1 && p.t > glideStart)?.t ?? Infinity;
    const cut = writes.filter((w) => w.kind === 'instant' && w.t >= glideStart && w.t < Math.min(glideStart + 450, arrivedAt));
    expect(cut, `instant writes inside the glide (glide at ${Math.round(glideStart)}ms, arrived at ${Math.round(arrivedAt)}ms, target ${target}): ${JSON.stringify(cut)}`)
        .toEqual([]);

    // ── 2. The curve, where the engine animates ───────────────────────────
    const during = curve.filter((p) => p.t >= glideStart - 20);
    const steps = during.slice(1).map((p, i) => p.top - during[i]!.top).filter((d) => d > 0);
    const ascent = steps.reduce((a, b) => a + b, 0);
    if (steps.length >= 3) {
        const biggest = Math.max(...steps);
        expect(biggest / ascent, `the biggest single-frame step is ${Math.round(biggest)}px of a ${Math.round(ascent)}px ascent — a teleport, not a glide`)
            .toBeLessThan(0.6);
    } else {
        test.info().annotations.push({ type: 'note', description: `engine landed the glide in ${steps.length} step(s) — the curve cannot judge here; the writes did` });
    }

    // And it arrives.
    const last = curve.at(-1)!;
    expect(last.max - last.top, 'the transcript ends at the bottom').toBeLessThanOrEqual(2);
    expect(errors, 'no runtime errors while probing').toEqual([]);
});
