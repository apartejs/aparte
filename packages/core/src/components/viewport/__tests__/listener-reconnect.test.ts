import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';

/**
 * A custom element is re-connected every time it is MOVED in the DOM — a portal,
 * a dialog, a framework re-parenting its tree. `connectedCallback` runs again
 * each time, so a listener registered as an inline arrow can never be removed
 * and simply accumulates: one branch click then runs N handlers, N full
 * active-path re-renders, and N storage writes through the conversation
 * controller.
 *
 * The window-level listeners were always removed correctly; these two, attached
 * to `this`, were not.
 */
describe('<aparte-chat-viewport> — moved around the DOM', () => {
    let a: HTMLElement;
    let b: HTMLElement;

    beforeEach(() => {
        a = document.createElement('div');
        b = document.createElement('div');
        document.body.append(a, b);
    });
    afterEach(() => { a.remove(); b.remove(); });

    it('runs the branch-navigate handler once, however many times it was re-parented', () => {
        const vp = document.createElement('aparte-chat-viewport');
        a.appendChild(vp);

        // Count the work the handler triggers, not the event itself.
        const navigate = vi.fn();
        (vp as unknown as { navigateBranch: unknown }).navigateBranch = navigate;

        // Three moves — a portal opening and closing, a framework re-parenting.
        for (let i = 0; i < 3; i++) (i % 2 === 0 ? b : a).appendChild(vp);

        vp.dispatchEvent(new CustomEvent('aparte-branch-navigate', {
            detail: { messageId: 'm1', direction: 'next' },
        }));

        expect(
            navigate.mock.calls.length,
            'the branch-navigate handler was registered once per connect and never removed',
        ).toBe(1);
    });

    it('keeps working after a move (the listener is re-attached, not just removed)', () => {
        const vp = document.createElement('aparte-chat-viewport');
        a.appendChild(vp);
        b.appendChild(vp);

        const navigate = vi.fn();
        (vp as unknown as { navigateBranch: unknown }).navigateBranch = navigate;
        vp.dispatchEvent(new CustomEvent('aparte-branch-navigate', {
            detail: { messageId: 'm1', direction: 'next' },
        }));

        expect(navigate).toHaveBeenCalledTimes(1);
    });
});
