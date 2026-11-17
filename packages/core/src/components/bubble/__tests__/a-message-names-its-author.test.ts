// @vitest-environment jsdom
/**
 * A message names its author.
 *
 * `author` on a message is drawn by the bubble: the name in the header and in the label
 * a screen reader reads, `data-author-type` for styling, and the author's picture — which
 * wins over the avatar provider, and which the provider is handed otherwise. A name an
 * app wrote on the bubble by hand is not core's to remove.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../viewport/aparte-chat-viewport.js';
import { populateBubbleFromMessage, type SyncableBubble } from '../bubble-sync.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import type { AparteMessage } from '../../../types/index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    updateMessage(id: string, u: Partial<AparteMessage>): void;
};

const marie: AparteMessage = { id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'Marie here.', timestamp: 1 };

async function viewport(): Promise<Viewport> {
    const vp = document.createElement('aparte-chat-viewport') as unknown as Viewport;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}
const bubbleOf = (vp: HTMLElement, id: string) => vp.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as HTMLElement;

afterEach(() => {
    aparteGlobalConfig.setAvatarProvider(null);
    document.body.innerHTML = '';
});

describe("a message's author", () => {
    it('shows the name and the type, and is read as a message from them', async () => {
        const vp = await viewport();
        vp.appendMessage(marie);
        const bubble = bubbleOf(vp, 'h1');
        await vi.waitFor(() => expect(bubble.querySelector('.aparte-name')?.textContent).toBe('Marie'));
        expect(bubble.getAttribute('name')).toBe('Marie');
        expect(bubble.getAttribute('data-author-type')).toBe('human');
        expect(bubble.querySelector('.aparte-message')?.getAttribute('aria-label')).toBe('Message from Marie');
    });

    it('keeps a name written by hand when the message has no author', async () => {
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('name', 'Assistant');
        document.body.appendChild(bubble);
        populateBubbleFromMessage(bubble as unknown as SyncableBubble, { id: 'a1', role: 'assistant', content: 'hi', timestamp: 1 });
        expect(bubble.getAttribute('name')).toBe('Assistant');
    });

    it('takes back the name it wrote when the author goes', async () => {
        const bubble = document.createElement('aparte-chat-bubble');
        document.body.appendChild(bubble);
        populateBubbleFromMessage(bubble as unknown as SyncableBubble, marie);
        expect(bubble.getAttribute('name')).toBe('Marie');
        populateBubbleFromMessage(bubble as unknown as SyncableBubble, { ...marie, author: undefined });
        expect(bubble.hasAttribute('name')).toBe(false);
        expect(bubble.hasAttribute('data-author-type')).toBe(false);
    });

    it("draws the author's picture, and does not call the avatar provider for it", async () => {
        const render = vi.fn();
        aparteGlobalConfig.setAvatarProvider({ render });
        const vp = await viewport();
        vp.appendMessage({ ...marie, author: { name: 'Marie', type: 'human', avatar: '/avatars/marie.png' } });
        const img = bubbleOf(vp, 'h1').querySelector('.aparte-avatar img') as HTMLImageElement | null;
        expect(img?.getAttribute('src')).toBe('/avatars/marie.png');
        expect(img?.getAttribute('alt')).toBe('');
        expect(render).not.toHaveBeenCalled();
    });

    it('hands the author to the avatar provider when there is no picture', async () => {
        const render = vi.fn();
        aparteGlobalConfig.setAvatarProvider({ render });
        const vp = await viewport();
        vp.appendMessage(marie);
        expect(render).toHaveBeenCalledWith('assistant', expect.any(HTMLElement), { author: marie.author });
    });

    it('does not redraw the avatar when only the text changes', async () => {
        const render = vi.fn();
        aparteGlobalConfig.setAvatarProvider({ render });
        const vp = await viewport();
        vp.appendMessage(marie);
        const calls = render.mock.calls.length;
        vp.updateMessage('h1', { content: 'One' });
        vp.updateMessage('h1', { content: 'Two' });
        expect(render.mock.calls.length).toBe(calls);
    });

    it("never wears the assistant's picture", () => {
        const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
        expect(css).toMatch(/aparte-chat-bubble\[data-author-type="human"\] \.aparte-avatar\[data-role="assistant"\]\s*\{\s*background-image:\s*none;/);
    });
});
