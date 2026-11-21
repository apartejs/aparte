// @vitest-environment jsdom
/**
 * A drag out of the transcript ends the press the viewport holds.
 *
 * The viewport holds a press from the transcript's `pointerdown` to the next `pointerup` or
 * `pointercancel`: while it lasts, a scroll that went up is the reader's, not the engine's own
 * settle. WebKit sends neither after a native drag (a selection or a link dragged into the
 * composer), the same gap the conversation list met: the press stayed held for the rest of the
 * turn, and the engine's settle at the end of a reply read as the reader going up, which
 * stopped the follow. A drag is never a scroll of the reader's: it ends the press.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(async () => {
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
});
afterEach(() => { document.body.innerHTML = ''; });

describe('the press the viewport holds', () => {
    it('ends at a drag that starts, with no pointerup after it (WebKit)', () => {
        const vp = document.createElement('aparte-chat-viewport');
        document.body.appendChild(vp);
        const container = vp.querySelector<HTMLElement>('[role="log"]')!;
        container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect((vp as unknown as { _pointerHeld: boolean })._pointerHeld).toBe(true);
        container.dispatchEvent(new Event('dragstart', { bubbles: true }));
        expect((vp as unknown as { _pointerHeld: boolean })._pointerHeld).toBe(false);
    });
});
