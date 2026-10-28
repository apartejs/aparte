// @vitest-environment jsdom
/**
 * A settled reply that a framework re-syncs is left as it is drawn.
 *
 * The settle keeps its DOM now, so every highlight pass after it meets blocks it already
 * highlighted. A whole-block highlighter's `<pre>` carries no `language-*` class, and the
 * second pass highlighted it again as a language-less block: the colours went. A code
 * segment re-sent unchanged was highlighted again too — the same answer, recomputed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeStreamedMarkdown, highlightMarkdownFences, type AparteMarkdownStreamHost } from '../markdown-stream.js';
import { codeRenderer } from '../segments/code.js';
import { aparteGlobalConfig, AparteConfig, runWithConfig } from '../../config/index.js';
import type { AparteCodeSegment } from '../../types/index.js';

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const SRC = 'Run it:\n\n```ts\nconst a = 1;\n```\n';

function mount(): { host: AparteMarkdownStreamHost; contentEl: HTMLElement } {
    const host = document.createElement('div') as AparteMarkdownStreamHost;
    const contentEl = document.createElement('div');
    host.appendChild(contentEl);
    document.body.appendChild(host);
    return { host, contentEl };
}

const markdown = (raw: string) => raw.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => `<pre><code class="language-${lang}">${code}</code></pre>`);

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a re-synced settled reply', () => {
    it('keeps a fence highlighted by a whole-block highlighter', async () => {
        const langs: string[] = [];
        aparteGlobalConfig.setMarkdownProvider(markdown);
        aparteGlobalConfig.setHighlightProvider((code, lang) => { langs.push(lang); return `<pre class="shiki"><code><span class="tok">${code}</span></code></pre>`; });
        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, SRC, false);
        highlightMarkdownFences(contentEl);
        await flush();
        for (let i = 0; i < 3; i++) {
            writeStreamedMarkdown(host, contentEl, SRC, false);
            highlightMarkdownFences(contentEl);
            await flush();
        }
        expect(langs).toEqual(['ts']);
        expect(contentEl.querySelector('pre.shiki .tok')).not.toBeNull();
    });

    it('does not highlight an unchanged code segment again', async () => {
        const highlight = vi.fn((code: string) => `<pre><code>${code}</code></pre>`);
        aparteGlobalConfig.setHighlightProvider(highlight);
        const segment: AparteCodeSegment = { id: 'c1', type: 'code', language: 'ts', content: 'const a = 1;', isStreaming: false };
        const holder = document.createElement('div');
        holder.innerHTML = codeRenderer.render(segment) as string;
        const el = holder.firstElementChild as HTMLElement;
        document.body.appendChild(el);
        codeRenderer.setup?.(el, segment);
        for (let i = 0; i < 3; i++) codeRenderer.update?.(el, { ...segment });
        await flush();
        expect(highlight).toHaveBeenCalledTimes(1);
        codeRenderer.update?.(el, { ...segment, content: 'const b = 2;' });
        expect(highlight).toHaveBeenCalledTimes(2);
    });

    it('draws again under another config, even at the same rendering count', () => {
        const a = new AparteConfig();
        const b = new AparteConfig();
        a.setMarkdownProvider((raw) => `<p class="a">${raw}</p>`);
        b.setMarkdownProvider((raw) => `<p class="b">${raw}</p>`);
        const { host, contentEl } = mount();
        runWithConfig(a, () => writeStreamedMarkdown(host, contentEl, 'hi', false));
        runWithConfig(b, () => writeStreamedMarkdown(host, contentEl, 'hi', false));
        expect(contentEl.querySelector('p.b')).not.toBeNull();
    });
});

describe('what the verification of the audit found', () => {
    function codePane(segment: AparteCodeSegment): HTMLElement {
        const holder = document.createElement('div');
        holder.innerHTML = codeRenderer.render(segment) as string;
        const el = holder.firstElementChild as HTMLElement;
        document.body.appendChild(el);
        codeRenderer.setup?.(el, segment);
        return el;
    }
    const segment: AparteCodeSegment = { id: 'c1', type: 'code', language: 'ts', content: 'const a = 1;', isStreaming: false };

    it('highlights an unchanged code segment again under another config', async () => {
        aparteGlobalConfig.setHighlightProvider((code) => `<pre data-by="global"><code>${code}</code></pre>`);
        const chat = new AparteConfig();
        chat.setHighlightProvider((code) => `<pre data-by="chat"><code>${code}</code></pre>`);
        const el = codePane(segment);
        await flush();
        runWithConfig(chat, () => codeRenderer.update?.(el, { ...segment }));
        await flush();
        expect(el.querySelector('[data-by]')!.getAttribute('data-by')).toBe('chat');
    });

    it('tries a failed highlight again on the next re-sync, in a code segment and in a reply', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let calls = 0;
        aparteGlobalConfig.setMarkdownProvider(markdown);
        aparteGlobalConfig.setHighlightProvider((code) => {
            if (calls++ % 2 === 0) throw new Error('grammars still loading');
            return `<pre class="shiki"><code>${code}</code></pre>`;
        });
        const el = codePane(segment);
        await flush();
        expect(el.querySelector('pre.shiki')).toBeNull();
        codeRenderer.update?.(el, { ...segment });
        await flush();
        expect(el.querySelector('pre.shiki')).not.toBeNull();

        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, SRC, false);
        highlightMarkdownFences(contentEl);
        await flush();
        expect(contentEl.querySelector('pre.shiki')).toBeNull();
        expect(contentEl.querySelector('code[data-aparte-highlighted]')).toBeNull();
        writeStreamedMarkdown(host, contentEl, SRC, false);
        highlightMarkdownFences(contentEl);
        await flush();
        expect(contentEl.querySelector('pre.shiki')).not.toBeNull();
    });

    it('highlights a reply whose bubble left the page while the highlight ran', async () => {
        await import('../../components/bubble/aparte-chat-bubble.js');
        aparteGlobalConfig.setMarkdownProvider(markdown);
        aparteGlobalConfig.setHighlightProvider((code, lang) => `<pre class="shiki" data-lang="${lang}"><code>${code}</code></pre>`);
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & { setContent(raw: string): void };
        bubble.setAttribute('message-id', 'm1');
        bubble.setAttribute('data-role', 'assistant');
        document.body.appendChild(bubble);
        bubble.setContent(SRC);
        bubble.remove();   // a route away, a keep-alive cache
        await flush();
        document.body.appendChild(bubble);
        bubble.setContent(SRC);
        await flush();
        expect(bubble.querySelector('pre.shiki')?.getAttribute('data-lang')).toBe('ts');
    });
});

describe('setHtmlSanitizer', () => {
    it('changes nothing, and tells no one, when given the sanitizer it already has', () => {
        const mine = (html: string) => html;
        aparteGlobalConfig.setHtmlSanitizer(mine);
        const heard = vi.fn();
        const stop = aparteGlobalConfig.subscribe(heard);
        aparteGlobalConfig.setHtmlSanitizer(mine);
        expect(heard).not.toHaveBeenCalled();
        stop();
    });
});
