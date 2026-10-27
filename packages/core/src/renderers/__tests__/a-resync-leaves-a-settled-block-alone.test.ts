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
