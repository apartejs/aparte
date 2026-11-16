// @vitest-environment jsdom
/**
 * A send can be held: `aparte-before-send` goes out first, cancelable, and a listener that
 * calls `preventDefault()` keeps the message where it is.
 *
 * `aparte-send` itself cannot be the one cancelled. The conversation controller appends the
 * person's message in the CAPTURE phase on the chat, so it runs before any listener an app
 * puts on the chat, the composer or the document; a cancel there would come after the message
 * was already in the thread. An event of its own, sent before, has no such race: whoever
 * listens to it, wherever, runs before anything is appended (the platform's `beforeinput`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteSendEventDetail } from '../../../types/events.js';

async function mount(): Promise<AparteComposer> {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = 'chat-a';
    const el = document.createElement('aparte-composer') as AparteComposer;
    chat.appendChild(el);
    document.body.appendChild(chat);
    await vi.waitFor(() => expect(typeof el.streaming).toBe('boolean'));
    return el;
}

describe('aparte-before-send', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('goes out before aparte-send, with the same detail and the chat it is for', async () => {
        const el = await mount();
        const seen: Array<[string, AparteSendEventDetail]> = [];
        for (const type of ['aparte-before-send', 'aparte-send']) {
            document.addEventListener(type, (e) => seen.push([type, (e as CustomEvent<AparteSendEventDetail>).detail]));
        }
        el.setValue('hello');
        el.submit();

        expect(seen.map(([type]) => type)).toEqual(['aparte-before-send', 'aparte-send']);
        expect(seen[0]![1]).toMatchObject({ content: 'hello', targetId: 'chat-a' });
        expect(seen[1]![1]).toMatchObject({ content: 'hello', targetId: 'chat-a' });
        expect(el.value).toBe('');
    });

    it('held: no aparte-send, and the text and the files stay in the composer', async () => {
        const el = await mount();
        const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
        el.addAttachments([file]);
        el.setValue('load the model first');
        const sent = vi.fn();
        el.addEventListener('aparte-send', sent);
        el.closest('[data-aparte-chat]')!.addEventListener('aparte-before-send', (e) => e.preventDefault());

        el.submit();

        expect(sent).not.toHaveBeenCalled();
        expect(el.value).toBe('load the model first');
        expect(el.attachments).toEqual([file]);
    });

    it('held once, sent the next time nobody holds it', async () => {
        const el = await mount();
        let hold = true;
        document.addEventListener('aparte-before-send', (e) => { if (hold) e.preventDefault(); });
        const sent = vi.fn();
        document.addEventListener('aparte-send', sent);
        el.setValue('ready?');

        el.submit();
        expect(sent).not.toHaveBeenCalled();

        hold = false;
        el.submit();
        expect(sent).toHaveBeenCalledTimes(1);
        expect((sent.mock.calls[0]![0] as CustomEvent<AparteSendEventDetail>).detail.content).toBe('ready?');
        expect(el.value).toBe('');
    });

    it('is not sent when nothing would be: an empty draft, or Stop while a reply streams', async () => {
        const el = await mount();
        const before = vi.fn();
        document.addEventListener('aparte-before-send', before);
        el.submit();
        window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId: 'chat-a', messageId: 'm1' } }));
        el.setValue('typed while it streams');
        el.submit();
        expect(before).not.toHaveBeenCalled();
    });
});
