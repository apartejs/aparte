// @vitest-environment jsdom
/**
 * The end of ANOTHER turn is not the end of this one.
 *
 * A retry supersedes the reply being written: the client aborts it, the engine emits
 * `run-aborted` at loop exit and the adapter turns that into `aparte-message-aborted`
 * carrying the OLD message's id. The host's `onEnd` took no event argument at all, so it
 * could not compare anything — it cleared the streaming id whatever arrived. Everything
 * hanging off that came undone in the middle of the new turn: `setTranscriptBusy(false)`
 * put retry, edit and the branch arrows back on every bubble while a reply was still
 * being written, and the orphan-stream guard stopped guarding.
 *
 * An event with no `messageId` still ends the turn — that is a host or a loop of its own
 * saying "done", and it has always meant this one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';

async function setup() {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { addMessage?: unknown }).addMessage).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, {});
    const teardown = host.bind();
    const fire = (name: string, detail: Record<string, unknown>): void => {
        root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    };
    return { host, viewport, fire, teardown };
}

describe('a terminal event for a message that is not the one streaming', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('leaves the live turn streaming, and the transcript read-only', async () => {
        const { host, viewport, fire, teardown } = await setup();
        fire('aparte-message-start', { messageId: 'b1' });
        expect(host.streamingId).toBe('b1');
        expect(viewport.hasAttribute('data-busy')).toBe(true);

        // The superseded turn unwinds: `run-aborted`, carrying ITS id.
        fire('aparte-message-aborted', { messageId: 'a2' });

        expect(host.streamingId, 'the new turn is still the one streaming').toBe('b1');
        expect(viewport.hasAttribute('data-busy'), 'and the transcript stays read-only').toBe(true);

        fire('aparte-message-aborted', { messageId: 'b1' });
        expect(host.streamingId).toBeNull();
        expect(viewport.hasAttribute('data-busy')).toBe(false);
        teardown();
    });

    it('still ends the turn on a done for the streaming message, or one with no id', async () => {
        const { host, fire, teardown } = await setup();
        fire('aparte-message-start', { messageId: 'b1' });
        fire('aparte-message-done', { messageId: 'b1' });
        expect(host.streamingId).toBeNull();

        fire('aparte-message-start', { messageId: 'b2' });
        fire('aparte-message-error', {});
        expect(host.streamingId, 'no id means "this turn", as it always has').toBeNull();
        teardown();
    });

    it('still records the usage the superseded turn reports', async () => {
        const { host, fire, teardown } = await setup();
        host.appendMessage({ id: 'a2', role: 'assistant', content: 'old', timestamp: 1 });
        fire('aparte-message-start', { messageId: 'b1' });
        fire('aparte-message-done', { messageId: 'a2', usage: { totalTokens: 12 } });

        expect(host.streamingId, 'without ending the live turn').toBe('b1');
        expect(host.getMessages().find((m) => m.id === 'a2')?.usage).toEqual({ totalTokens: 12 });
        teardown();
    });
});
