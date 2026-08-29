// @vitest-environment jsdom
/**
 * `aparte-reset` — the command core listens for, and had never published.
 *
 * A window event any app can dispatch that empties every mounted transcript, answered
 * with `aparte-reset-done`. It has been live since the viewport existed and appeared
 * on no page: the events reference builds its list from DISPATCH sites — a typed map
 * entry, a manifest `@fires`, an `@event` block, a `dispatchEvent` call — and core
 * never dispatches this one, so it was in none of the four. Meanwhile no test touched
 * it either, which is the second half of the same problem: a listener that is neither
 * documented nor covered can be deleted in silence, and nothing would have gone red.
 *
 * The disconnected case is the one worth pinning. The listener is added in
 * `connectedCallback` and removed in `disconnectedCallback`; a viewport that is
 * detached and then reset must not answer, or a page that keeps a spare transcript off
 * screen gets it cleared and reports done for a surface nobody can see.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';

type Viewport = HTMLElement & {
    appendMessage(message: { id: string; role: string; content: string; timestamp: number }): void;
    getMessages(): unknown[];
};

function mount(): Viewport {
    const el = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(el);
    el.appendMessage({ id: 'u1', role: 'user', content: 'hello', timestamp: Date.now() });
    el.appendMessage({ id: 'a1', role: 'assistant', content: 'hi', timestamp: Date.now() });
    return el;
}

const reset = (): void => { window.dispatchEvent(new CustomEvent('aparte-reset')); };

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-reset', () => {
    it('empties the transcript and answers with aparte-reset-done', () => {
        const el = mount();
        expect(el.getMessages()).toHaveLength(2);
        expect(el.querySelectorAll('aparte-chat-bubble').length).toBe(2);

        let answered = 0;
        el.addEventListener('aparte-reset-done', () => { answered++; });
        reset();

        expect(el.getMessages()).toHaveLength(0);
        expect(el.querySelectorAll('aparte-chat-bubble').length).toBe(0);
        expect(answered, 'the command is answered, not merely obeyed').toBe(1);
    });

    it('clears every mounted transcript — it carries no target', () => {
        const a = mount();
        const b = mount();
        reset();
        expect(a.getMessages()).toHaveLength(0);
        expect(b.getMessages()).toHaveLength(0);
    });

    it('is ignored by a viewport that is not connected', () => {
        const el = mount();
        el.remove();
        let answered = 0;
        el.addEventListener('aparte-reset-done', () => { answered++; });

        reset();

        expect(el.getMessages(), 'a detached viewport kept its messages').toHaveLength(2);
        expect(answered).toBe(0);
    });

    it('answers again after the element is re-connected', () => {
        // The listener is torn down and rebuilt with the element; a viewport moved in
        // the DOM must still obey.
        const el = mount();
        el.remove();
        document.body.appendChild(el);
        reset();
        expect(el.getMessages()).toHaveLength(0);
    });
});
