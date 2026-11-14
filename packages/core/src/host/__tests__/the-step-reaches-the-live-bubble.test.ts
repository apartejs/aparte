// @vitest-environment jsdom
/**
 * The step a run announces reaches the reply's bubble, whichever of the two targets the
 * client writes to — the viewport (a page without a framework) or a wrapper's host — and is
 * never written into the conversation a page saves.
 *
 * Under a framework the bubble is painted a render after the message is in the list, and a
 * step can arrive before it: the host keeps it for the reply and gives it to the bubble when
 * the framework paints it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteMessage } from '../../types/index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    setStep(messageId: string, name: string | null): void;
    getMessage(id: string): AparteMessage | undefined;
};

const stepOf = (root: ParentNode, id: string): string => {
    const bubble = root.querySelector(`aparte-chat-bubble[message-id="${id}"]`);
    const words = bubble?.querySelector<HTMLElement>('.aparte-waiting-step');
    return words && !words.hidden && !bubble!.querySelector<HTMLElement>('.aparte-waiting')!.hidden ? words.textContent ?? '' : '';
};

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; });

describe('the step reaches the live bubble', () => {
    it('through the viewport, and the saved message keeps nothing of it', async () => {
        const viewport = document.createElement('aparte-chat-viewport') as Viewport;
        document.body.appendChild(viewport);
        await vi.waitFor(() => expect(typeof viewport.appendMessage).toBe('function'));
        viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
        viewport.setStep('a1', 'Reading the parser');
        expect(stepOf(viewport, 'a1')).toBe('Reading the parser');
        expect(JSON.stringify(viewport.getMessage('a1'))).not.toContain('Reading the parser');
        viewport.setStep('a1', null);
        expect(stepOf(viewport, 'a1')).toBe('');
    });

    it('through a wrapper\'s host, given to the bubble once the framework paints it', async () => {
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
        const render = (): void => {
            for (const m of messages) {
                if (viewport.querySelector(`aparte-chat-bubble[message-id="${m.id}"]`)) continue;
                const bubble = document.createElement('aparte-chat-bubble');
                bubble.setAttribute('message-id', m.id);
                bubble.setAttribute('data-role', m.role);
                if (m.status === 'streaming') bubble.setAttribute('streaming', '');
                viewport.appendChild(bubble);
            }
            host.syncBubbles();
        };

        host.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
        // Through the method the client calls on the root, before the bubble is painted.
        (root as unknown as { setStep(id: string, name: string | null): void }).setStep('a1', 'Reading the parser');
        render();
        expect(stepOf(viewport, 'a1')).toBe('Reading the parser');
        expect(JSON.stringify(messages)).not.toContain('Reading the parser');

        host.setStep('a1', null);
        render();
        expect(stepOf(viewport, 'a1')).toBe('');
        teardown();
    });
});
