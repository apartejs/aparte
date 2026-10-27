/**
 * Maths through marked: recognised when a `math` renderer is registered, left alone
 * otherwise, and the same whether the reply was parsed in one go or streamed a
 * character at a time.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { marked } from 'marked';
import { setupMarkedProvider } from './index.js';
import { setupMarkedStreamingProvider } from './streaming.js';
import { maskMath } from './scan.js';
import { MATH_CORPUS } from './__tests__/math-corpus.js';

/** The formulas a render produced, as the corpus states them. */
function mathsIn(root: ParentNode): Array<[string, boolean]> {
    return Array.from(root.querySelectorAll('code.language-math'))
        .map((c) => [c.textContent ?? '', c.classList.contains('math-display')]);
}

function html(markup: string): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = markup;
    return el;
}

/** Stream `md` one character at a time through the registered streaming provider. */
function streamCharByChar(md: string, onEach?: (el: HTMLElement) => void): HTMLElement {
    const target = document.createElement('div');
    const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
    for (const ch of md) { renderer.write(ch); onEach?.(target); }
    renderer.end();
    return target;
}

const drawMaths = () => aparteGlobalConfig.registerCodeLanguageRenderer({ languages: ['math'], render: () => null });

afterEach(() => aparteGlobalConfig.reset());

describe('maths in one go', () => {
    it.each(MATH_CORPUS.map((c) => [c.md, c] as const))('%j', (_md, c) => {
        setupMarkedProvider();
        drawMaths();
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown(c.md)))).toEqual(c.maths);
    });

    it('is left alone when no maths renderer is registered: today\'s output, exactly', () => {
        setupMarkedProvider();
        for (const c of MATH_CORPUS) {
            expect(aparteGlobalConfig.renderMarkdown(c.md)).toBe(aparteGlobalConfig.sanitizeHtml(marked.parse(c.md, { async: false }) as string));
        }
    });

    it('is on when asked for, and off when refused, whatever is registered', () => {
        setupMarkedProvider({ math: true });
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$x$')))).toEqual([['x', false]]);
        aparteGlobalConfig.reset();
        setupMarkedProvider({ math: false });
        drawMaths();
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$x$')))).toEqual([]);
    });

    it('turns on when a renderer is registered after the provider', () => {
        setupMarkedProvider();
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$x$')))).toEqual([]);
        drawMaths();
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$x$')))).toEqual([['x', false]]);
    });

    it('reads an unclosed formula in finished text as text', () => {
        setupMarkedProvider();
        drawMaths();
        const el = html(aparteGlobalConfig.renderMarkdown('use \\( to group, and $$ for a pid'));
        expect(mathsIn(el)).toEqual([]);
    });
});

describe('maths while it streams', () => {
    it.each(MATH_CORPUS.map((c) => [c.md, c] as const))('%j, a character at a time', (_md, c) => {
        setupMarkedStreamingProvider();
        drawMaths();
        expect(mathsIn(streamCharByChar(c.md))).toEqual(c.maths);
    });

    it('never lets remend complete TeX into a link or emphasis', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        for (const md of ['\\[ a + b \\]', '$$\n\\left[ x + y \\right]\n$$', 'a $[0,1)$ ok', 'so $x_1 + y_2$ done']) {
            streamCharByChar(md, (el) => {
                expect(el.textContent).not.toContain('streamdown');
                expect(el.querySelector('em, strong')).toBeNull();
            });
        }
    });

    it('marks a formula still arriving as open, and draws it as it grows', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        const target = document.createElement('div');
        const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
        renderer.write('$$\nx^');
        const open = target.querySelector('code.language-math');
        expect(open?.closest('[data-aparte-open]')).not.toBeNull();
        expect(open?.textContent).toBe('x^');
        renderer.write('2\n$$\n');
        renderer.end();
        expect(target.querySelector('[data-aparte-open]')).toBeNull();
        expect(mathsIn(target)).toEqual([['x^2', true]]);
    });

    it('keeps a single $ as text until it closes', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        const target = document.createElement('div');
        const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
        renderer.write('costs $5 and more');
        expect(mathsIn(target)).toEqual([]);
        expect(target.textContent).toContain('$5 and more');
    });

    it('streams exactly as before when no maths renderer is registered', () => {
        setupMarkedStreamingProvider();
        const el = streamCharByChar('see $x$ and \\(y\\)');
        expect(mathsIn(el)).toEqual([]);
        expect(el.textContent).toContain('$x$');
    });
});

describe('maskMath', () => {
    it('hides each formula and puts it back verbatim', () => {
        const src = 'a $x_1$ and \\[ y \\] and `$k$` and $5';
        const { masked, unmask } = maskMath(src);
        expect(masked).not.toContain('x_1');
        expect(masked).toContain('`$k$`');
        expect(masked).toContain('$5');
        expect(unmask(masked)).toBe(src);
    });
});
