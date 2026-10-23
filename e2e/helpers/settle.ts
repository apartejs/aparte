/**
 * Wait until the transcript has stopped moving, instead of waiting a fixed time.
 *
 * A fixed `waitForTimeout(500)` is long enough on an idle machine and too short on a loaded
 * one, which is when the motion it waits for takes longest. This waits for the thing itself:
 * the scroll surface's `scrollTop`, `scrollHeight` and `clientHeight` — and, when a selector
 * is given, that element's box — unchanged for `frames` consecutive animation frames.
 */
import type { Page } from '@playwright/test';

export interface Still {
    top: number;
    max: number;
}

export async function waitForStill(
    page: Page,
    opts: { selector?: string; frames?: number; timeout?: number } = {},
): Promise<Still> {
    const frames = opts.frames ?? 8;
    await page.evaluate(() => { delete (window as unknown as { __aparteStill?: unknown }).__aparteStill; });
    await page.waitForFunction(({ selector, frames: needed }) => {
        const surface = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement | null;
        if (!surface) return false;
        const box = selector ? document.querySelector(selector)?.getBoundingClientRect() : undefined;
        const key = [surface.scrollTop, surface.scrollHeight, surface.clientHeight, box?.top, box?.left, box?.height].join('|');
        const w = window as unknown as { __aparteStill?: { key: string; count: number } };
        if (w.__aparteStill?.key === key) w.__aparteStill.count += 1;
        else w.__aparteStill = { key, count: 0 };
        return w.__aparteStill.count >= needed;
    }, { selector: opts.selector, frames }, { polling: 'raf', timeout: opts.timeout ?? 10_000 });
    return page.evaluate(() => {
        const surface = (document.querySelector('.aparte-viewport-container')
            ?? document.querySelector('aparte-chat-viewport')) as HTMLElement;
        return { top: surface.scrollTop, max: surface.scrollHeight - surface.clientHeight };
    });
}
