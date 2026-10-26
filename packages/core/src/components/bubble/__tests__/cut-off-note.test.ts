// @vitest-environment jsdom
/**
 * A reply the model stopped at its length limit says so.
 *
 * Without the note a truncated answer reads as a finished one. It is shown only for
 * `'length'`, only once the turn has settled, and it has to appear on every path a reply
 * reaches the screen by: a live turn (`updateMessage`), an appended message, and a stored
 * conversation restored with `setMessages`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../viewport/aparte-chat-viewport.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteMessage } from '../../../types/index.js';

type BubbleEl = HTMLElement & { updateMessage(u: Partial<AparteMessage>): void };
type ViewportEl = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    setMessages(m: AparteMessage[]): void;
    updateMessage(id: string, u: Partial<AparteMessage>): void;
};

const note = (root: HTMLElement) => root.querySelector<HTMLElement>('.aparte-finish-note');
const TEXT = "Cut off at the model's length limit.";

function bubble(streaming = false): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    if (streaming) el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

function viewport(): ViewportEl {
    const el = document.createElement('aparte-chat-viewport') as ViewportEl;
    document.body.appendChild(el);
    return el;
}

const reply = (extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: 'a1', role: 'assistant', content: 'Half an ans', timestamp: 2, status: 'completed', ...extra });

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the cut-off note', () => {
    it('shows after a completed reply that ended on length, as quiet text', () => {
        const el = bubble();
        el.updateMessage({ status: 'completed', finishReason: 'length' });
        const n = note(el)!;
        expect(n.textContent).toBe(TEXT);
        expect(n.getAttribute('role')).toBeNull();
        expect(n.previousElementSibling?.classList.contains('aparte-message-content')).toBe(true);
    });

    it('is absent for stop, for no reason, and for any other reason', () => {
        for (const finishReason of ['stop', 'tool-calls', 'content-filter', 'error', 'other', undefined] as const) {
            const el = bubble();
            el.updateMessage({ status: 'completed', ...(finishReason ? { finishReason } : {}) });
            expect(note(el), String(finishReason)).toBeNull();
        }
    });

    it('waits for the turn to settle, then appears', () => {
        const el = bubble(true);
        el.updateMessage({ finishReason: 'length' });
        expect(note(el)).toBeNull();
        el.updateMessage({ status: 'completed' });
        expect(note(el)?.textContent).toBe(TEXT);
    });

    it('is not drawn on a user message', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'user');
        document.body.appendChild(el);
        el.updateMessage({ finishReason: 'length' });
        expect(note(el)).toBeNull();
    });

    it('appears when a stored message is restored, and not for one that is not cut off', () => {
        const vp = viewport();
        vp.setMessages([
            { id: 'u1', role: 'user', content: 'q', timestamp: 1 },
            reply({ finishReason: 'length' }),
            reply({ id: 'a2', timestamp: 3, finishReason: 'stop' }),
        ]);
        const bubbles = vp.querySelectorAll<HTMLElement>('aparte-chat-bubble[data-role="assistant"]');
        expect(note(bubbles[0]!)?.textContent).toBe(TEXT);
        expect(note(bubbles[1]!)).toBeNull();
    });

    it('appears on an appended message and on a viewport update', () => {
        const vp = viewport();
        vp.appendMessage(reply({ finishReason: 'length' }));
        expect(note(vp.querySelector('aparte-chat-bubble[message-id="a1"]')!)).not.toBeNull();

        vp.appendMessage(reply({ id: 'a2', timestamp: 3, status: 'streaming', content: 'x' }));
        const second = vp.querySelector<HTMLElement>('aparte-chat-bubble[message-id="a2"]')!;
        vp.updateMessage('a2', { status: 'completed', finishReason: 'length' });
        expect(note(second)?.textContent).toBe(TEXT);
    });
});
