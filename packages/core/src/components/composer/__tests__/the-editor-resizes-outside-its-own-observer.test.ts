// @vitest-environment jsdom
/**
 * The editor sets its height outside the ResizeObserver that watches it, and only for a change of
 * width.
 *
 * The observer is there for the width: a box first laid out in a 0px column measured ~300px of
 * placeholder. Its callback set the height of the very element it observes, at the same depth, so
 * each width change (a window resize, the launcher maximized, the drawer toggled) ended in the
 * browser's "ResizeObserver loop completed with undelivered notifications": an error every
 * monitor logs for every user, and the overlay a dev server shows full screen.
 */
import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import '../aparte-composer.js';
import { AparteComposerInput } from '../aparte-composer-input.js';

type Callback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
const callbacks: Callback[] = [];
const original = globalThis.ResizeObserver;

beforeAll(() => {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor(cb: Callback) { callbacks.push(cb); }
        observe(): void {}
        disconnect(): void {}
    };
});
afterAll(() => { (globalThis as { ResizeObserver: unknown }).ResizeObserver = original; });
afterEach(() => { document.body.innerHTML = ''; callbacks.length = 0; vi.restoreAllMocks(); });

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

describe("the editor's height, on a resize", () => {
    it('is set on the next frame, not inside the observer, and only when the width changed', async () => {
        document.body.innerHTML = '<aparte-composer><aparte-composer-input></aparte-composer-input></aparte-composer>';
        await frame();
        await frame();
        const adjust = vi.spyOn(AparteComposerInput.prototype as unknown as { _adjustHeight(): void }, '_adjustHeight');
        const observed = callbacks.at(-1)!;

        observed([{ contentRect: { width: 300, height: 40 } }]);
        expect(adjust, 'not inside the observer that watches the editor').not.toHaveBeenCalled();
        await frame();
        expect(adjust).toHaveBeenCalledTimes(1);

        // The height the adjust wrote comes back as a resize of the same width: nothing to do.
        observed([{ contentRect: { width: 300, height: 120 } }]);
        await frame();
        expect(adjust).toHaveBeenCalledTimes(1);

        observed([{ contentRect: { width: 500, height: 120 } }]);
        await frame();
        expect(adjust).toHaveBeenCalledTimes(2);
    });
});
