// @vitest-environment jsdom
/**
 * A chat can say what its Stop interrupts: `stop-label` on its composer, mirrored by the
 * `stopLabel` property.
 *
 * The only way before was the locale's `stopButton`, which every chat sharing the config reads,
 * so naming one chat's stop renamed all of them, and a locale edit stood in for state. An
 * attribute, like the composer's other options, so a framework binding reaches it the way a
 * script does: the wrappers write a string as an attribute.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-send.js';
import '../aparte-composer-cancel.js';
import type { AparteComposer } from '../aparte-composer.js';
import { applyElementProps } from '../../../interop/element-props.js';

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

    it('is the stop-label attribute: the property writes it, and a wrapper writing the attribute is heard', async () => {
        const a = await mount('chat-a');
        start('chat-a');
        a.stopLabel = 'Stop the download';
        expect(a.getAttribute('stop-label')).toBe('Stop the download');

        applyElementProps(a, { 'stop-label': 'Stop the build' });
        expect(a.stopLabel).toBe('Stop the build');
        expect(named(a)[0]).toBe('Stop the build');

        a.stopLabel = null;
        expect(a.hasAttribute('stop-label')).toBe(false);
        expect(named(a)[0]).toBe('Stop');
    });

    it('set before the reply starts, it is what the button says once it does, and it stays until cleared', async () => {
        const a = await mount('chat-a');
        a.stopLabel = 'Stop the build';
        expect(named(a)[0], 'no reply yet: the button sends').toBe('Send');
        start('chat-a');
        expect(named(a)[0]).toBe('Stop the build');
        window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId: 'chat-a', messageId: 'chat-a-r' } }));
        expect(a.stopLabel, 'the app clears it: a binding that wrote it would not write it again').toBe('Stop the build');
    });
});
