// @vitest-environment jsdom
/**
 * The composer follows the turn it started, not any turn that ends.
 *
 * A retry supersedes the reply being written: the client aborts it, and the engine's
 * `run-aborted` arrives as `aparte-message-aborted` carrying the OLD message's id — with
 * the same `targetId`, because both turns belong to this chat. `_isForThisComposer`
 * compares the target and nothing else, so the superseded turn's unwind turned Stop back
 * into Send while the new reply was still streaming, and evicted whatever panel was open
 * — an approval question the tool was still waiting on.
 *
 * An event with no `messageId` still ends the turn: that is a loop of one's own saying
 * "done", and it has always meant this one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';

type ComposerEl = HTMLElement & { streaming: boolean };

async function mount(): Promise<ComposerEl> {
    const el = document.createElement('aparte-composer') as ComposerEl;
    document.body.appendChild(el);
    await vi.waitFor(() => expect(typeof el.streaming).toBe('boolean'));
    return el;
}

const fire = (name: string, detail: Record<string, unknown>): void => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
};

describe('a terminal event for another message', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('does not take the composer out of streaming', async () => {
        const el = await mount();
        fire('aparte-message-start', { messageId: 'b1' });
        expect(el.streaming).toBe(true);

        fire('aparte-message-aborted', { messageId: 'a2' });
        expect(el.streaming, 'the reply being written is still being written').toBe(true);

        fire('aparte-message-aborted', { messageId: 'b1' });
        expect(el.streaming).toBe(false);
    });

    it('still ends on a done for the streaming message, or one with no id', async () => {
        const el = await mount();
        fire('aparte-message-start', { messageId: 'b1' });
        fire('aparte-message-done', { messageId: 'b1' });
        expect(el.streaming).toBe(false);

        fire('aparte-message-start', { messageId: 'b2' });
        fire('aparte-message-error', {});
        expect(el.streaming).toBe(false);
    });
});
