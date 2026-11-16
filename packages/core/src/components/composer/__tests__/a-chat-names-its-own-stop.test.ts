// @vitest-environment jsdom
/**
 * A chat can say what its Stop interrupts, for the reply in flight: `composer.stopLabel`.
 *
 * The only way before was the locale's `stopButton`, which every chat sharing the config reads,
 * so naming one chat's stop renamed all of them, and a locale edit stood in for state. The name
 * belongs to the run: it goes when the reply ends, so it never outlives what it described.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-send.js';
import '../aparte-composer-cancel.js';
import type { AparteComposer } from '../aparte-composer.js';

async function mount(id: string): Promise<AparteComposer> {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = id;
    chat.innerHTML = '<aparte-composer><aparte-composer-send></aparte-composer-send><aparte-composer-cancel></aparte-composer-cancel></aparte-composer>';
    document.body.appendChild(chat);
    const el = chat.querySelector('aparte-composer') as AparteComposer;
    await vi.waitFor(() => expect(el.querySelector('.aparte-cs-button')).toBeTruthy());
    return el;
}

const start = (targetId: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { targetId, messageId: `${targetId}-r` } }));
};
const named = (el: AparteComposer): string[] => [
    el.querySelector('.aparte-cs-button')!.getAttribute('aria-label')!,
    el.querySelector('.aparte-cs-button')!.getAttribute('title')!,
    el.querySelector('.aparte-cc-button')!.getAttribute('aria-label')!,
];

describe("a chat's own name for its Stop", () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('names the Stop button of this chat, and of no other', async () => {
        const a = await mount('chat-a');
        const b = await mount('chat-b');
        start('chat-a');
        start('chat-b');

        a.stopLabel = 'Stop the sub-agents';

        expect(named(a)).toEqual(['Stop the sub-agents', 'Stop the sub-agents', 'Stop the sub-agents']);
        expect(named(b)).toEqual(['Stop', 'Stop', 'Stop']);
    });

    it('goes back to the locale word on null, and when the reply ends', async () => {
        const a = await mount('chat-a');
        start('chat-a');
        a.stopLabel = 'Stop the download';
        a.stopLabel = null;
        expect(named(a)[0]).toBe('Stop');

        a.stopLabel = 'Stop the download';
        window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId: 'chat-a', messageId: 'chat-a-r' } }));
        expect(a.stopLabel).toBeNull();

        start('chat-a');
        expect(named(a)[0], 'the next reply starts with the plain word').toBe('Stop');
    });

    it('set before the reply starts, it is what the button says once it does', async () => {
        const a = await mount('chat-a');
        a.stopLabel = 'Stop the build';
        expect(named(a)[0], 'no reply yet: the button sends').toBe('Send');
        start('chat-a');
        expect(named(a)[0]).toBe('Stop the build');
    });
});
