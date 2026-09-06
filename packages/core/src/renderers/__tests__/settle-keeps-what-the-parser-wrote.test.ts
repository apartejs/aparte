// @vitest-environment jsdom
/**
 * What a finished message shows when the only Markdown renderer is an incremental one.
 *
 * The settling update flushes the incremental parser and then re-renders once
 * through the one-shot provider, for full fidelity. That trade only holds while a
 * one-shot provider exists: with `@aparte/plugin-streaming-markdown` installed
 * alone, the one-shot side is core's zero-dependency default — escape plus `<br>` —
 * so the re-render replaced the rendered DOM with the raw Markdown source, and a
 * reply that read richly all the way through its stream collapsed the instant the
 * turn completed.
 *
 * The providers here stand in for the real plugins (core cannot import one): the
 * incremental one writes DOM the way `streaming-markdown` does, the one-shot one is
 * `marked`-shaped. What is real is `writeStreamedMarkdown`, the config seam and the
 * sanitizer — the settle still runs it, which is what lets an incremental provider
 * write DOM directly at all.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeStreamedMarkdown, type AparteMarkdownStreamHost } from '../markdown-stream.js';
import { aparteGlobalConfig } from '../../config/index.js';

/** Bold and fences, which is all these cases need to tell one renderer from the other. */
function mini(md: string): string {
    return md
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) =>
            `<pre><code class="language-${lang}">${code}</code></pre>`)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** A stand-in for `@aparte/plugin-streaming-markdown`: it writes DOM as tokens arrive. */
function installIncrementalProvider(render: (buffer: string) => string = mini): void {
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        const paint = (): void => { target.innerHTML = render(buffer); };
        return {
            write: (chunk: string): void => { buffer += chunk; paint(); },
            end: (): void => { paint(); },
        };
    });
}

/** A `marked`-shaped one-shot provider, marked so its output is recognisable. */
function installOneShotProvider(): void {
    aparteGlobalConfig.setMarkdownProvider((raw: string) => `<p class="one-shot">${mini(raw)}</p>`);
}

const SRC = 'Hello **world**\n\n```js\nconst a = 1;\n```\n';

/** Stream `content` one character at a time, then complete the turn. */
function streamThenSettle(content: string): HTMLElement {
    const host = document.createElement('div') as AparteMarkdownStreamHost;
    const contentEl = document.createElement('div');
    host.appendChild(contentEl);
    document.body.appendChild(host);
    for (let i = 1; i <= content.length; i++) {
        writeStreamedMarkdown(host, contentEl, content.slice(0, i), true);
    }
    writeStreamedMarkdown(host, contentEl, content, false);
    return contentEl;
}

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('the settling update', () => {
    it('keeps what the incremental parser wrote when no one-shot provider is registered', () => {
        installIncrementalProvider();
        const contentEl = streamThenSettle(SRC);

        expect(contentEl.querySelector('strong')?.textContent).toBe('world');
        expect(contentEl.querySelector('pre > code')?.className).toBe('language-js');
        expect(contentEl.innerHTML).not.toContain('**world**');
    });

    it('still runs the sanitizer over what the incremental parser wrote', () => {
        // The provider writes markup no sanitizer may keep — the case the settle exists for.
        installIncrementalProvider(() => '<p>hi<img src="x" onerror="alert(1)"><script>alert(2)</script></p>');
        const contentEl = streamThenSettle('hi');

        expect(contentEl.innerHTML).not.toContain('onerror');
        expect(contentEl.querySelector('script')).toBeNull();
        expect(contentEl.textContent).toContain('hi');
    });

    it('re-renders through the one-shot provider when one is registered', () => {
        installIncrementalProvider();
        installOneShotProvider();
        const contentEl = streamThenSettle(SRC);

        expect(contentEl.querySelector('.one-shot')).not.toBeNull();
        expect(contentEl.querySelector('strong')?.textContent).toBe('world');
    });

    it('re-renders through a one-shot provider that hands prose back untouched', () => {
        // A provider only has to be REGISTERED to own the settle: one that renders
        // fences and passes everything else through is still the caller's choice,
        // not core's default, so its answer stands.
        installIncrementalProvider();
        aparteGlobalConfig.setMarkdownProvider((raw: string) => raw);
        const contentEl = streamThenSettle('Hello **world**');

        expect(contentEl.querySelector('strong')).toBeNull();
        expect(contentEl.innerHTML).toContain('**world**');
    });

    it('shows the tail a completing update brought with it', () => {
        // A completion can carry the final content and `isStreaming: false` in ONE
        // update, so the settle is the first time the parser sees that last chunk.
        // Nothing renders it afterwards now that the flushed DOM is what stays.
        installIncrementalProvider();
        const host = document.createElement('div') as AparteMarkdownStreamHost;
        const contentEl = document.createElement('div');
        host.appendChild(contentEl);
        document.body.appendChild(host);

        writeStreamedMarkdown(host, contentEl, 'Hello', true);
        writeStreamedMarkdown(host, contentEl, 'Hello and **goodbye**', false);

        expect(contentEl.textContent).toContain('goodbye');
        expect(contentEl.querySelector('strong')?.textContent).toBe('goodbye');
    });

    it('escapes the raw Markdown when neither provider is registered', () => {
        const contentEl = streamThenSettle('a < b\n**bold**');

        expect(contentEl.innerHTML).toBe('a &lt; b<br>**bold**');
    });
});
