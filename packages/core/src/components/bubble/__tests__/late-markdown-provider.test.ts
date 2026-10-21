// @vitest-environment jsdom
/**
 * A Markdown or highlight provider set AFTER a message was drawn reaches that message.
 *
 * The setters did not notify, so a bubble drawn first kept its raw text for good: a static
 * `<aparte-chat-bubble content="**x**">` upgraded by core's own import before
 * `setupMarkedProvider()` ran, or a restored conversation drawn before an un-awaited
 * `setupShikiProvider()` resolved. The provider here is a stand-in — core cannot import a
 * plugin — that turns `**x**` into `<strong>x</strong>`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';

interface BubbleEl extends HTMLElement {
    setContent(content: string): void;
    setSegments(segments: unknown[]): void;
    updateMessage(updates: Record<string, unknown>): void;
}

const bold = (md: string): string => md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function mount(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    return el;
}

describe('a Markdown provider set after the message was drawn', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('redraws simple content with it', () => {
        const el = mount();
        el.setContent('**late**');
        expect(el.querySelector('strong')).toBeNull();

        aparteGlobalConfig.setMarkdownProvider(bold);
        expect(el.querySelector('.aparte-content strong')?.textContent).toBe('late');
    });

    it('redraws segments with it', () => {
        const el = mount();
        el.setSegments([{ id: 's1', type: 'text', content: '**late**' }]);
        expect(el.querySelector('strong')).toBeNull();

        aparteGlobalConfig.setMarkdownProvider(bold);
        expect(el.querySelector('.aparte-segments strong')?.textContent).toBe('late');
    });

    it('leaves a streaming message alone, and redraws it when it ends', () => {
        const el = mount();
        el.updateMessage({ status: 'streaming' });
        el.setSegments([{ id: 's1', type: 'text', content: '**late**' }]);
        const before = el.querySelector('[data-segment-id="s1"]');

        aparteGlobalConfig.setMarkdownProvider(bold);
        expect(el.querySelector('[data-segment-id="s1"]'), 'mid-stream: not rebuilt').toBe(before);

        el.updateMessage({ status: 'completed' });
        expect(el.querySelector('.aparte-segments strong')?.textContent).toBe('late');
    });

    it('does not rebuild a message already drawn with the current providers', () => {
        aparteGlobalConfig.setMarkdownProvider(bold);
        const el = mount();
        el.setSegments([{ id: 's1', type: 'text', content: '**on time**' }]);
        const drawn = el.querySelector('[data-segment-id="s1"]');

        aparteGlobalConfig.setBubbleActions({ copy: false });   // any other config change
        expect(el.querySelector('[data-segment-id="s1"]')).toBe(drawn);
    });
});
