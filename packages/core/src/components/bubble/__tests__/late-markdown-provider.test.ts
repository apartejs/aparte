// @vitest-environment jsdom
/**
 * A Markdown or highlight provider set AFTER a message was drawn reaches that message.
 *
 * The setters did not notify, so a bubble drawn first kept its raw text for good: a static
 * `<aparte-chat-bubble content="**x**">` upgraded by core's own import before
 * `setupMarkedProvider()` ran, or a restored conversation drawn while a highlighter was still
 * loading (`setupShikiProviderFromHighlighter(await createHighlighterCore(…))`). The provider
 * here is a stand-in — core cannot import a
 * plugin — that turns `**x**` into `<strong>x</strong>`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../composer/aparte-composer-input.js';
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

    it('redraws simple content with it', async () => {
        const el = mount();
        el.setContent('**late**');
        expect(el.querySelector('strong')).toBeNull();

        aparteGlobalConfig.setMarkdownProvider(bold);
        await Promise.resolve();
        expect(el.querySelector('.aparte-content strong')?.textContent).toBe('late');
    });

    it('redraws segments with it', async () => {
        const el = mount();
        el.setSegments([{ id: 's1', type: 'text', content: '**late**' }]);
        expect(el.querySelector('strong')).toBeNull();

        aparteGlobalConfig.setMarkdownProvider(bold);
        await Promise.resolve();
        expect(el.querySelector('.aparte-segments strong')?.textContent).toBe('late');
    });

    it('leaves a streaming message alone, and redraws it when it ends', async () => {
        const el = mount();
        el.updateMessage({ status: 'streaming' });
        el.setSegments([{ id: 's1', type: 'text', content: '**late**' }]);
        const before = el.querySelector('[data-segment-id="s1"]');

        aparteGlobalConfig.setMarkdownProvider(bold);
        await Promise.resolve();
        expect(el.querySelector('[data-segment-id="s1"]'), 'mid-stream: not rebuilt').toBe(before);

        el.updateMessage({ status: 'completed' });
        expect(el.querySelector('.aparte-segments strong')?.textContent).toBe('late');
    });

    it('waits for an open edit to end, instead of showing the message beside the editor', async () => {
        aparteGlobalConfig.setBubbleActions({ edit: true });
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'user');
        el.setAttribute('message-id', 'u1');
        document.body.appendChild(el);
        el.updateMessage({ content: '**draft**' });
        (el.querySelector('[data-action="edit"]') as HTMLButtonElement).click();
        const content = el.querySelector('.aparte-content') as HTMLElement;
        expect(content.style.display).toBe('none');

        aparteGlobalConfig.setMarkdownProvider(bold);
        await Promise.resolve();
        expect(content.style.display, 'still hidden behind the editor').toBe('none');

        (el.querySelector('[data-action="edit-cancel"]') as HTMLButtonElement).click();
        expect(el.querySelector('.aparte-content strong')?.textContent, 'drawn once the edit ends').toBe('draft');
    });

    it('does not rebuild a message already drawn with the current providers', async () => {
        aparteGlobalConfig.setMarkdownProvider(bold);
        const el = mount();
        el.setSegments([{ id: 's1', type: 'text', content: '**on time**' }]);
        const drawn = el.querySelector('[data-segment-id="s1"]');

        aparteGlobalConfig.setBubbleActions({ copy: false });   // any other config change
        await Promise.resolve();
        expect(el.querySelector('[data-segment-id="s1"]')).toBe(drawn);
    });

    it('draws once for providers set one after another, not once per provider', async () => {
        // The documented setup sets the Markdown provider, its streaming twin and a highlighter
        // in a row, often after a restored conversation is drawn: each one notifies.
        const el = mount();
        el.setSegments([{ id: 's1', type: 'text', content: '**late**' }]);
        let parses = 0;
        aparteGlobalConfig.setMarkdownProvider((md) => { parses++; return bold(md); });
        aparteGlobalConfig.setStreamingMarkdownProvider(() => ({ write() {}, end() {}, reset() {} }) as never);
        aparteGlobalConfig.setHighlightProvider((code) => code);
        await Promise.resolve();
        expect(parses).toBe(1);
        expect(el.querySelector('.aparte-segments strong')?.textContent).toBe('late');
    });
});
