// @vitest-environment jsdom
/**
 * A reply that arrives complete renders like the same words streamed.
 *
 * With an incremental provider installed alone (`@aparte/plugin-streaming-markdown`,
 * whose page says it "is all you need"), a streamed reply was rich and a reply that
 * never streamed — a restored conversation, a non-streaming provider, a stored segment —
 * went through `renderMarkdown`, which knew only the one-shot provider and fell back to
 * core's escape-and-`<br>` default. The same text rendered two ways depending on how it
 * arrived. Now the incremental provider renders a complete string too, when no one-shot
 * provider is registered.
 *
 * The provider is a stand-in for the plugin (core cannot import it): it writes DOM the
 * way `streaming-markdown` does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../index.js';

function installIncrementalProvider(render: (buffer: string) => string = (md) => md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')): void {
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        return {
            write: (chunk: string): void => { buffer += chunk; target.innerHTML = render(buffer); },
            end: (): void => { target.innerHTML = render(buffer); },
        };
    });
}

afterEach(() => aparteGlobalConfig.reset());

describe('renderMarkdown with only an incremental provider', () => {
    it('renders the complete string through it', () => {
        installIncrementalProvider();
        expect(aparteGlobalConfig.renderMarkdown('Hello **world**')).toBe('Hello <strong>world</strong>');
    });

    it('sanitises what it wrote, as it does a one-shot provider\'s output', () => {
        installIncrementalProvider(() => '<p>hi<img src="x" onerror="alert(1)"><script>alert(2)</script></p>');
        const html = aparteGlobalConfig.renderMarkdown('hi');
        expect(html).not.toContain('onerror');
        expect(html).not.toContain('<script');
        expect(html).toContain('hi');
    });

    it('leaves a registered one-shot provider in charge', () => {
        installIncrementalProvider();
        aparteGlobalConfig.setMarkdownProvider((raw) => `<p class="one-shot">${raw}</p>`);
        expect(aparteGlobalConfig.renderMarkdown('x')).toBe('<p class="one-shot">x</p>');
    });

    it('falls back to the escaping default when the incremental provider throws', () => {
        aparteGlobalConfig.setStreamingMarkdownProvider(() => { throw new Error('boom'); });
        expect(aparteGlobalConfig.renderMarkdown('a < b')).toBe('a &lt; b');
    });

    it('escapes as before when neither provider is registered', () => {
        expect(aparteGlobalConfig.renderMarkdown('a < b\n**b**')).toBe('a &lt; b<br>**b**');
    });
});
