// @vitest-environment jsdom
/**
 * The replies an answer offers: a ```suggestions block in a reply, shown above the composer.
 *
 * A backend that only sends text (an n8n workflow) cannot hand the page a list of quick
 * replies any other way: it writes them as a block, the way a card is written. The block
 * draws nothing in the message; `<aparte-suggestions answers>` shows the last answer's, and
 * they go when a message is sent, or when the last message is not an answer that offers some.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-suggestions.js';
import type { AparteSuggestions } from '../aparte-suggestions.js';
import { setupSuggestionBlocks } from '../suggestion-blocks.js';
import { codeRenderer } from '../../../renderers/segments/code.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteCodeSegment } from '../../../types/index.js';

const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

function chat() {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport><aparte-composer></aparte-composer>';
    document.body.appendChild(root);
    const viewport = root.querySelector('aparte-chat-viewport') as HTMLElement;
    const composer = root.querySelector('aparte-composer') as HTMLElement;
    const replies = document.createElement('aparte-suggestions') as AparteSuggestions;
    replies.setAttribute('answers', '');
    composer.appendChild(replies);
    return { viewport, composer, replies };
}

/** A message, its fence drawn by core's code renderer as a reply's would be. */
function message(viewport: HTMLElement, role: 'user' | 'assistant', fence?: { content: string; isStreaming?: boolean }) {
    const bubble = document.createElement('aparte-chat-bubble');
    bubble.setAttribute('data-role', role);
    viewport.appendChild(bubble);
    if (!fence) return bubble;
    const segment: AparteCodeSegment = { id: `s${viewport.children.length}`, type: 'code', language: 'suggestions', content: fence.content, isStreaming: !!fence.isStreaming };
    const holder = document.createElement('div');
    holder.innerHTML = codeRenderer.render(segment) as string;
    const el = holder.firstElementChild as HTMLElement;
    bubble.appendChild(el);
    codeRenderer.setup?.(el, segment);
    return bubble;
}

const chips = (el: Element) => [...el.querySelectorAll('button.aparte-suggestion')].map((b) => b.textContent);

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a ```suggestions block and <aparte-suggestions answers>', () => {
    it('shows the replies the last answer offers, and nothing of the block in the message', async () => {
        setupSuggestionBlocks();
        const { viewport, replies } = chat();
        message(viewport, 'user');
        const answer = message(viewport, 'assistant', { content: '["Tuesday 3", {"label": "Another week", "prompt": "Next week, please"}]' });
        await flush();
        expect(chips(replies)).toEqual(['Tuesday 3', 'Another week']);
        expect(answer.querySelector('[data-aparte-suggestions]')!.hasAttribute('hidden')).toBe(true);
        expect(answer.querySelector('.aparte-segment-code')!.hasAttribute('data-aparte-bare')).toBe(true);
    });

    it('empties on the send, and keeps an older answer\'s replies out once the person has answered', async () => {
        setupSuggestionBlocks();
        const { viewport, composer, replies } = chat();
        message(viewport, 'assistant', { content: '["Yes", "No"]' });
        await flush();
        expect(chips(replies)).toEqual(['Yes', 'No']);
        composer.dispatchEvent(new CustomEvent('aparte-send', { bubbles: true, detail: { message: 'Yes' } }));
        expect(chips(replies)).toEqual([]);
        message(viewport, 'user');
        await flush();
        expect(chips(replies)).toEqual([]);
        // The next answer offers none: none shown, not the old ones back.
        message(viewport, 'assistant');
        await flush();
        expect(chips(replies)).toEqual([]);
    });

    it('offers nothing while the block is still being written, then its replies once it closes', async () => {
        setupSuggestionBlocks();
        const { viewport, replies } = chat();
        message(viewport, 'assistant', { content: '["Tues', isStreaming: true });
        await flush();
        expect(chips(replies)).toEqual([]);
        expect(viewport.querySelector('.aparte-code-error')).toBeNull();
    });

    it('shows a block that is not a list of replies as its source, offering nothing', async () => {
        setupSuggestionBlocks();
        const { viewport, replies } = chat();
        message(viewport, 'assistant', { content: '{"not": "a list"}' });
        await flush();
        expect(viewport.querySelector('.aparte-code-error')!.textContent).toBe('{"not": "a list"}');
        expect(chips(replies)).toEqual([]);
    });

    it('is the app\'s choice: without setupSuggestionBlocks the block stays code', async () => {
        const { viewport, replies } = chat();
        const answer = message(viewport, 'assistant', { content: '["Yes"]' });
        await flush();
        expect(answer.querySelector('[data-aparte-suggestions]')).toBeNull();
        expect(answer.querySelector('pre > code')!.textContent).toBe('["Yes"]');
        expect(chips(replies)).toEqual([]);
    });
});
