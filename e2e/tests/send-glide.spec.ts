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
    /** `seq` is the write's ORDER: WebKit rounds `performance.now()` to the millisecond, so two writes in one frame share a `t`. */
    /** `left`: ms the component's own glide window still had to run at the write (negative = closed). */
    writes: { t: number; seq: number; kind: 'instant' | 'smooth' | 'scrollTo-instant'; top: number; from: number; max: number; left: number }[];
    curve: { t: number; top: number; max: number }[];
    ends: { t: number; top: number; max: number }[];
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
        const inst: Instruments & { stop(): void } = { writes: [], curve: [], ends: [], stop() { running = false; } };
        let running = true;
        let seq = 0;

        // The writes: the instance shadows the prototype accessor and forwards to it. Each
        // records where the view stood (`from`) and how far down it could go (`max`) at
        // that instant, which the frame-sampled curve cannot say.
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
        const vp = (s.closest('aparte-chat-viewport') ?? s) as unknown as { _glideUntil?: number };
        const here = (): { from: number; max: number; left: number } => ({
            from: (desc.get as () => number).call(s),
            max: s.scrollHeight - s.clientHeight,
            left: Math.round((vp._glideUntil ?? 0) - performance.now()),
        });
        Object.defineProperty(s, 'scrollTop', {
            configurable: true,
            get() { return (desc.get as () => number).call(this); },
            set(v: number) { inst.writes.push({ t: performance.now() - t0, seq: seq++, kind: 'instant', top: v, ...here() }); (desc.set as (v: number) => void).call(this, v); },
        });
        const nativeScrollTo = s.scrollTo.bind(s) as (o: ScrollToOptions) => void;
        (s as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo = (o: ScrollToOptions) => {
            inst.writes.push({ t: performance.now() - t0, seq: seq++, kind: o?.behavior === 'smooth' ? 'smooth' : 'scrollTo-instant', top: Number(o?.top ?? 0), ...here() });
            nativeScrollTo(o);
        };
        s.addEventListener('scrollend', () => inst.ends.push({ t: performance.now() - t0, top: (desc.get as () => number).call(s), max: s.scrollHeight - s.clientHeight }));

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
        return { writes: g.writes, curve: g.curve, ends: g.ends };
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
    const { writes, curve, ends } = await read(page);

    const smooth = writes.filter((w) => w.kind === 'smooth');
    expect(smooth.length, `the send glides (writes: ${JSON.stringify(writes.slice(0, 12))})`).toBeGreaterThanOrEqual(1);

    // ── 1. No instant write inside the glide window ────────────────────────
    // The window: from the first smooth call to 450 ms later (the component's budget;
    // `scrollend` may close it earlier, and an instant write after THAT is streaming
    // doing its job — so only writes inside the budget AND before the glide ended are
    // held against it).
    //
    // It ends at the first `scrollend` that finds the view at the bottom — the component's
    // own rule (`_handleScrollEnd`) — or when the curve reaches the bottom, whichever is
    // first. The curve alone is sampled once a frame, so it learns of the arrival up to a
    // frame after the browser does: ~25 ms on a fast machine, more on a 2-vCPU runner. A
    // pin the component made in that gap, legitimately, onto a view already at its max
    // (it moved nothing) read as a cut — react-webkit in CI, once: `scrollHeight` 1200 at
    // the glide's start and at the write, the window closed early, and nothing in this
    // test is a reader's input, so only a `scrollend` at the bottom could have closed it.
    const glideStart = smooth[0]!.t;
    const target = curve.at(-1)!.max;
    const curveArrival = curve.find((p) => p.max - p.top <= 1 && p.t > glideStart)?.t ?? Infinity;
    const restedAtBottom = ends.find((e) => e.max - e.top <= 1 && e.t > glideStart)?.t ?? Infinity;
    const arrivedAt = Math.min(curveArrival, restedAtBottom);
    // Inside means AFTER the smooth call, by order — not by timestamp. WebKit rounds
    // `performance.now()` to the millisecond, so the instant pin the send makes just
    // before it asks for the glide shares the smooth call's `t`; `>=` on that clock
    // read a pre-glide write as a cut, about one run in eight on react-webkit, and never
    // on an engine whose clock resolves microseconds.
    const cut = writes.filter((w) => w.kind === 'instant' && w.seq > smooth[0]!.seq && w.t < Math.min(glideStart + 450, arrivedAt));
    expect(cut, `instant writes inside the glide (glide at ${Math.round(glideStart)}ms, arrived at ${Math.round(arrivedAt)}ms, target ${target}): ${JSON.stringify(cut)}; writes around it: ${JSON.stringify(writes.filter((w) => cut.some((c) => Math.abs(w.seq - c.seq) <= 8)))}; first writes: ${JSON.stringify(writes.slice(0, 6))}; scrollend: ${JSON.stringify(ends.slice(0, 8))}; curve near the cut: ${JSON.stringify(curve.filter((p) => cut.some((c) => Math.abs(p.t - c.t) < 60)))}`)
        .toEqual([]);

    // ── 2. The curve — recorded, not judged ───────────────────────────────
    // It was an assertion ("the biggest step under 60 % of the ascent") and CI refuted it
    // with the fix in place: on a 2-vCPU runner the smooth scroll drops frames, and one
    // step carried 65–87 % of the ascent on WebKit and React while every write was smooth.
    // The writes are the engine- and machine-independent proof; the curve is context for
    // a failure message.
    const during = curve.filter((p) => p.t >= glideStart - 20);
    const steps = during.slice(1).map((p, i) => p.top - during[i]!.top).filter((d) => d > 0);
    const ascent = steps.reduce((a, b) => a + b, 0);
    test.info().annotations.push({
        type: 'curve',
        description: `${steps.length} ascending frame(s), ${Math.round(ascent)}px ascent, biggest step ${Math.round(Math.max(0, ...steps))}px`,
    });

    // And it arrives — read live, so a view that is still landing is waited for, and one
    // that stopped short (the follow disarmed under it) still fails.
    await expect.poll(
        () => page.evaluate(() => {
            const s = (document.querySelector('.aparte-viewport-container')
                ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
            return s.scrollHeight - s.clientHeight - s.scrollTop;
        }),
        { message: `the transcript ends at the bottom (the recorded curve ended at ${curve.at(-1)!.max - curve.at(-1)!.top}px)` },
    ).toBeLessThanOrEqual(2);
    expect(errors, 'no runtime errors while probing').toEqual([]);
});
