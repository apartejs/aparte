// @vitest-environment jsdom
/**
 * The Markdown surfaces draw the code languages a renderer is registered for.
 *
 * Every way out of `writeStreamedMarkdown` draws: after each token an incremental
 * provider wrote, after the one-shot render, and at the settle — including the settle
 * that keeps the parser's DOM and runs it through the sanitizer again, which would strip
 * what a drawing is made of if the drawing were still there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeStreamedMarkdown, highlightMarkdownFences, type AparteMarkdownStreamHost } from '../markdown-stream.js';
import { textRenderer } from '../segments/text.js';
import { aparteGlobalConfig } from '../../config/index.js';

/** `$…$` → the inline placeholder a maths-aware Markdown provider writes; nothing else. */
const placeholders = (md: string): string => `<p>${md.replace(/\$([^$]+)\$/g, '<code class="language-math math-inline">$1</code>')}</p>`;

/**
 * An incremental provider, re-painting its target as tokens arrive. Its `end()` writes
 * nothing, as streaming-markdown's flushes only what it held back: what is on screen at
 * the settle is what the last token left, drawings included. It fails on a complete
 * string (`renderMarkdown` runs it on a detached element), which is what sends the
 * settle down the path that keeps its DOM and sanitizes it again.
 */
function installIncremental(): void {
    aparteGlobalConfig.setStreamingMarkdownProvider((target: HTMLElement) => {
        let buffer = '';
        return {
            write: (chunk: string) => {
                if (!target.isConnected) throw new Error('only streams into the page');
                buffer += chunk;
                target.innerHTML = placeholders(buffer);
            },
            end: () => { /* nothing held back */ },
        };
    });
}

/**
 * A renderer drawing what KaTeX draws: MathML, which the sanitizer strips whole, and
 * positioned HTML, which it would keep half of — the classes without the styles.
 */
function installMath(): string[] {
    const asked: string[] = [];
    aparteGlobalConfig.registerCodeLanguageRenderer({
        languages: ['math'],
        render: ({ source }) => {
            asked.push(source);
            return `<span class="katex"><math><mi>${source}</mi></math><span class="katex-html" style="vertical-align:-0.25em">${source}</span></span>`;
        },
    });
    return asked;
}

function mount(): { host: AparteMarkdownStreamHost; contentEl: HTMLElement } {
    const host = document.createElement('div') as AparteMarkdownStreamHost;
    const contentEl = document.createElement('div');
    host.appendChild(contentEl);
    document.body.appendChild(host);
    return { host, contentEl };
}

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('writing Markdown draws its code languages', () => {
    it('draws a formula as soon as an incremental provider has written it', () => {
        installIncremental();
        installMath();
        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, 'see $x$', true);
        expect(contentEl.querySelector('math')?.textContent).toBe('x');
    });

    it('keeps the drawing through the settle that re-sanitizes the parser DOM', () => {
        installIncremental();
        const asked = installMath();
        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, 'see $x$ and', true);
        writeStreamedMarkdown(host, contentEl, 'see $x$ and', false);

        expect(contentEl.querySelector('math')?.textContent).toBe('x');
        // One formula: a drawing left in place through the sanitizer would survive as a
        // second, broken one — its classes kept, its positioning gone.
        expect(contentEl.querySelectorAll('.katex')).toHaveLength(1);
        expect(contentEl.querySelector<HTMLElement>('.katex-html')!.style.verticalAlign).toBe('-0.25em');
        // The source is still there, hidden. The settle closed it, which asked once more.
        expect(contentEl.querySelector('code.language-math')?.textContent).toBe('x');
        expect(asked.filter((s) => s === 'x').length).toBeLessThanOrEqual(2);
    });

    it('draws what the one-shot render wrote, while streaming and at the settle', () => {
        aparteGlobalConfig.setMarkdownProvider(placeholders);
        installMath();
        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, '$a$ then', true);
        expect(contentEl.querySelector('math')?.textContent).toBe('a');
        writeStreamedMarkdown(host, contentEl, '$a$ then $b$', false);
        expect(Array.from(contentEl.querySelectorAll('math')).map((m) => m.textContent)).toEqual(['a', 'b']);
    });

    it('draws a renderer registered after the reply settled, on the next settle', () => {
        installIncremental();
        const { host, contentEl } = mount();
        writeStreamedMarkdown(host, contentEl, '$x$', true);
        writeStreamedMarkdown(host, contentEl, '$x$', false);
        expect(contentEl.querySelector('math')).toBeNull();

        installMath();
        writeStreamedMarkdown(host, contentEl, '$x$', false);
        expect(contentEl.querySelector('math')).not.toBeNull();
    });

    it('leaves a drawn language to its renderer when fences are highlighted', async () => {
        const highlighted: string[] = [];
        aparteGlobalConfig.setHighlightProvider((code, lang) => { highlighted.push(lang); return `<pre class="shiki"><code>${code}</code></pre>`; });
        aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['mermaid'], render: () => '<img alt="d">' });
        const { contentEl } = mount();
        contentEl.innerHTML = '<pre><code class="language-mermaid">flowchart TD</code></pre><pre><code class="language-ts">const a</code></pre>';
        highlightMarkdownFences(contentEl);
        await Promise.resolve();
        expect(highlighted).toEqual(['ts']);
    });

    it('draws a text segment restored from storage', () => {
        aparteGlobalConfig.setMarkdownProvider(placeholders);
        installMath();
        const segment = { id: 't1', type: 'text' as const, content: 'saved $y$', isStreaming: false };
        const holder = document.createElement('div');
        holder.innerHTML = textRenderer.render(segment) as string;
        const el = holder.firstElementChild as HTMLElement;
        document.body.appendChild(el);
        textRenderer.setup?.(el, segment);
        expect(el.querySelector('math')?.textContent).toBe('y');
    });
});
