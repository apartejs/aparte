// @vitest-environment jsdom
/**
 * The binding's `afterRender` runs in a hidden tab too.
 *
 * It was one animation frame, and a hidden document runs none: a compaction's save, which
 * re-checks after each render until the summary reaches the chat, waited for the reader to
 * come back to the tab — and was lost if they closed it first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { afterReactRender } from '../internal/after-render.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('afterReactRender', () => {
    it('runs on the next frame in a visible tab', () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frames.push(fn); return 1; });
        const cb = vi.fn();
        afterReactRender(cb);
        expect(cb).not.toHaveBeenCalled();
        frames.forEach((fn) => fn(0));
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('runs on the next task in a hidden tab, where no frame comes', () => {
        vi.useFakeTimers();
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);   // never fires
        const cb = vi.fn();
        afterReactRender(cb);
        vi.runAllTimers();
        expect(cb).toHaveBeenCalledTimes(1);
    });
});
