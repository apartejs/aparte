/**
 * Frame by frame, while a reasoning block is written: where the person's message is, how much
 * of the reasoning is there, what its heading says, how far the thread is scrolled.
 *
 * In the page, so that each frame is read in the frame it was drawn. A thread that moves a
 * pixel up and down on every delta (apartejs/aparte#270) is invisible to a read taken when the
 * reply is done, and to any tolerance of a pixel or more.
 */
import type { Page } from '@playwright/test';

/** One frame of the last reply while it reasons. */
export interface Frame {
    /** The top of the person's last message, in the window. */
    userTop: number;
    /** How much of the reasoning is written. */
    reasoning: number;
    /** What the reasoning's heading says. */
    label: string;
    /** How far the thread is scrolled. */
    scrollTop: number;
    /** Whether the reply's first tool row (a sub-agent's line) is open. */
    lineOpen: boolean;
}

/**
 * Which reasoning to read in the last reply: the reply's own (`'reply'`), or the one written
 * under its first tool row, a sub-agent's (`'line'`).
 */
export type ReasoningAt = 'reply' | 'line';

/** Start reading every frame. Read back with `framesOf`. */
export async function watchFrames(page: Page, at: ReasoningAt): Promise<void> {
    await page.evaluate((where) => {
        const w = window as unknown as { __frames: unknown[]; __watching: boolean };
        w.__frames = [];
        w.__watching = true;
        const user = () => [...document.querySelectorAll('aparte-chat-bubble[data-role="user"]')].at(-1);
        const reply = () => [...document.querySelectorAll('aparte-chat-bubble[data-role="assistant"]')].at(-1);
        // What scrolls: the container in core mode (raw core), the viewport itself under a wrapper.
        const host = document.querySelector('aparte-chat-viewport');
        const surface = () => (host?.querySelector('.aparte-viewport-container') as HTMLElement | null) ?? (host as HTMLElement | null);
        // Read once the frame is drawn, not from inside it: a frame runs several callbacks
        // (core pins the scroll, then measures the spacer and pins again), and a read taken
        // between two of them sees a state no one was shown.
        const tick = () => {
            if (w.__watching) requestAnimationFrame(() => setTimeout(tick, 0));
            const message = reply();
            const line = message?.querySelector('.aparte-segment-tool-call') ?? null;
            const thinking = where === 'line'
                ? line?.querySelector('.aparte-segment-thinking')
                : [...(message?.querySelectorAll('.aparte-segment-thinking') ?? [])].find((t) => !t.closest('.aparte-segment-tool-call'));
            const top = user()?.getBoundingClientRect().top;
            if (thinking && top !== undefined) {
                w.__frames.push({
                    userTop: top,
                    reasoning: thinking.querySelector('.aparte-thinking-content')?.textContent?.length ?? 0,
                    label: thinking.querySelector('summary')?.textContent?.trim() ?? '',
                    scrollTop: surface()?.scrollTop ?? 0,
                    lineOpen: !!line && (line.matches('details[open]') || !!line.querySelector(':scope > details.aparte-tool-disclosure[open]')),
                });
            }
        };
        requestAnimationFrame(() => setTimeout(tick, 0));
    }, at);
}

/** How far the thread is scrolled now: the container in core mode, the viewport under a wrapper. */
export function threadScrollTop(page: Page): Promise<number> {
    return page.evaluate(() => {
        const host = document.querySelector('aparte-chat-viewport');
        const surface = (host?.querySelector('.aparte-viewport-container') as HTMLElement | null) ?? (host as HTMLElement | null);
        return surface?.scrollTop ?? 0;
    });
}

/** Stop reading, and return every frame read. */
export async function framesOf(page: Page): Promise<Frame[]> {
    return page.evaluate(() => {
        const w = window as unknown as { __frames: Frame[]; __watching: boolean };
        w.__watching = false;
        return w.__frames;
    });
}

/** The frames in which the reasoning was still being written: shorter than it ends. */
export function whileWritten(frames: Frame[]): Frame[] {
    const full = Math.max(...frames.map((f) => f.reasoning));
    return frames.filter((f) => f.reasoning > 0 && f.reasoning < full);
}

/**
 * Every change of direction of the person's message, past half a pixel: it may go up (the reply
 * grows under a reader at the bottom) or hold still, never up then down.
 */
export function reversals(frames: Frame[]): string[] {
    const out: string[] = [];
    let last = 0;
    for (let i = 1; i < frames.length; i++) {
        const move = frames[i]!.userTop - frames[i - 1]!.userTop;
        if (Math.abs(move) <= 0.5) continue;
        const direction = Math.sign(move);
        if (last !== 0 && direction !== last) out.push(`frame ${i}${frames[i]!.lineOpen ? ' (line open)' : ''}: ${frames[i - 1]!.userTop.toFixed(1)} → ${frames[i]!.userTop.toFixed(1)}`);
        last = direction;
    }
    return out;
}
