/**
 * Maths through marked: recognised when a `math` renderer is registered, left alone
 * otherwise, and the same whether the reply was parsed in one go or streamed a
 * character at a time.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { Marked, marked } from 'marked';
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
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('use \\( to group, and $$ for a pid')))).toEqual([]);
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$$\nthe reply stopped here')))).toEqual([]);
    });

    it('keeps its own marked options beside maths', () => {
        setupMarkedProvider({ breaks: true, math: true });
        const el = html(aparteGlobalConfig.renderMarkdown('a\nb $x$'));
        expect(el.querySelector('br')).not.toBeNull();
        expect(mathsIn(el)).toEqual([['x', false]]);
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
        for (const md of ['\\[ a + b \\]', '$$\n\\left[ x + y \\right]\n$$', 'a $[0,1)$ ok', 'so $x_1 + y_2$ done', 'see \\[ a `c` b']) {
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

    it('takes maths and marked options together, and maths alone', () => {
        setupMarkedStreamingProvider({ breaks: true, math: true });
        expect(mathsIn(streamCharByChar('a\nb $x$'))).toEqual([['x', false]]);
        aparteGlobalConfig.reset();
        setupMarkedStreamingProvider({ math: true });
        expect(mathsIn(streamCharByChar('$y$'))).toEqual([['y', false]]);
        expect(mathsIn(html(aparteGlobalConfig.renderMarkdown('$z$')))).toEqual([['z', false]]);
    });

    it('streams exactly as before when no maths renderer is registered', () => {
        setupMarkedStreamingProvider();
        const el = streamCharByChar('see $x$ and \\(y\\)');
        expect(mathsIn(el)).toEqual([]);
        expect(el.textContent).toContain('$x$');
    });
});

describe('what the audit found', () => {
    /** A seeded generator, so a failing input is the same input on the next run. */
    function* inputs(count: number): Generator<string> {
        let seed = 7;
        const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        const alphabet = ['a', 'b', ' ', ' ', '\n', '\n\n', '*', '_', '`', '$', '$$', '\\', '(', ')', '[', ']', '#', '- ', '|', '1'];
        for (let n = 0; n < count; n++) {
            let s = '';
            const length = 1 + Math.floor(next() * 24);
            for (let i = 0; i < length; i++) s += alphabet[Math.floor(next() * alphabet.length)];
            yield s;
        }
    }

    it('leaves ordinary Markdown exactly as marked renders it, where nothing is maths', () => {
        // The block `start` once cut a paragraph one character in, so text with no
        // formula in it gained line breaks or split once a maths renderer was installed.
        setupMarkedProvider({ breaks: true });
        drawMaths();
        const plain = new Marked({ breaks: true });
        let compared = 0;
        for (const md of inputs(3000)) {
            const withMaths = aparteGlobalConfig.renderMarkdown(md);
            if (withMaths.includes('language-math')) continue;
            compared++;
            expect(withMaths, JSON.stringify(md)).toBe(aparteGlobalConfig.sanitizeHtml(plain.parse(md, { async: false }) as string));
        }
        expect(compared).toBeGreaterThan(1500);
    });

    it('keeps a sentence whole around display maths, with breaks on', () => {
        setupMarkedProvider({ breaks: true });
        drawMaths();
        const el = html(aparteGlobalConfig.renderMarkdown('I $$\\sum_i a_i$$ is the total.'));
        expect(el.querySelectorAll('p')).toHaveLength(1);
        expect(el.querySelector('br')).toBeNull();
    });

    it('closes an italic outside the formula it holds', () => {
        setupMarkedProvider();
        drawMaths();
        // marked hands its emphasis hook a copy where `\(` is already `++`, so the
        // backslash delimiters were invisible to the mask built from it.
        const cases: Array<[string, string]> = [
            ['*the optimum $x^*$ is unique*', 'x^*'],
            ['The *optimum \\(x^*\\) is unique*.', 'x^*'],
            ['*see \\[x^*\\] here*', 'x^*'],
            ['*where \\(\\alpha_i^*\\) is the dual*', '\\alpha_i^*'],
        ];
        for (const [md, tex] of cases) {
            const el = html(aparteGlobalConfig.renderMarkdown(md));
            expect(el.querySelector('em code.language-math')?.textContent, md).toBe(tex);
            for (const code of el.querySelectorAll('code')) code.remove();
            expect(el.textContent, md).not.toContain('*');
        }
    });

    it('reads an emphasis around escapes exactly as marked does', () => {
        // The emphasis mask reads the real text now: brackets the tokenizer leaves
        // escaped, and an escaped backslash before a parenthesis, are no formula to it.
        setupMarkedProvider();
        drawMaths();
        for (const md of ['*see array\\[i*\\] b*', '*a \\\\(x^*\\\\) b*']) {
            expect(aparteGlobalConfig.renderMarkdown(md), md).toBe(aparteGlobalConfig.sanitizeHtml(marked.parse(md, { async: false }) as string));
        }
    });

    it('closes a bold around a formula still arriving, not inside it', () => {
        // remend completes `**Theorem \(f` with a `**`; were the open formula masked from
        // the emphasis scan, that `**` would close inside it and be drawn as TeX.
        setupMarkedStreamingProvider();
        drawMaths();
        const cases: Array<[string, string]> = [['**Theorem: \\(f(x)=x^2', 'f(x)=x^2'], ['**Theorem $$f(x)', 'f(x)']];
        for (const [md, tex] of cases) {
            const target = document.createElement('div');
            const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
            for (const ch of md) renderer.write(ch);
            expect(target.querySelector('strong code.language-math[data-aparte-open]')?.textContent, md).toBe(tex);
            renderer.end();
        }
    });

    it('does not draw a fence, a list or a heading inside a formula still arriving', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        for (const md of [
            'Bash:\n$$ is the PID.\n```sh\necho $$ and more\n```\n\nNext.',
            'Shell:\n$$ is the PID.\n~~~sh\necho $$ and more\n~~~\n\nNext.',
            'Variables:\n$$ is the PID\n- item one\n- item two\n\nNext.',
            'Notes:\n$$ is the PID\n## Next section\nText here.',
        ]) {
            streamCharByChar(md, (el) => {
                for (const code of el.querySelectorAll('code.language-math')) expect(code.textContent, md).not.toMatch(/`|~~~|\n- |\n#/);
            });
        }
    });

    it('keeps a list line inside a display formula opened on its own line', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        const target = document.createElement('div');
        const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
        renderer.write('$$\n- x^2 + y');
        expect(target.querySelector('[data-aparte-open] code.language-math')?.textContent).toBe('- x^2 + y');
        renderer.write('\n$$\n');
        renderer.end();
        expect(mathsIn(target)).toEqual([['- x^2 + y', true]]);
    });

    it('settles where its last chunk left it, when an unclosed opener turns out to be prose', () => {
        // An unclosed `$$` or `\(` that has met a blank line, a block or a backquote can
        // never close: it is text from then on — for `$$ is the PID`, the paragraph it
        // begins, not a second one that merges into the first at the end.
        setupMarkedStreamingProvider();
        drawMaths();
        for (const md of [
            'Bash variables:\n$$ is the PID, $! the last job.\n\nSecond paragraph.',
            'Notes:\n$$ is the PID\n## Next section\nText here.',
            'Variables:\n$$ is the PID\n- item one\n\nNext.',
            'Use \\(a + `b` to group.',
        ]) {
            const target = document.createElement('div');
            const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
            for (const ch of md) renderer.write(ch);
            const last = target.innerHTML;
            renderer.end();
            expect(target.innerHTML, md).toBe(last);
            expect(mathsIn(target), md).toEqual([]);
        }
    });

    it('heals the rest of a paragraph after a price', () => {
        // A single `$` still open hides only the brackets after it from remend, not the
        // rest of its paragraph: `**bo` is bold before its `**` arrives.
        setupMarkedStreamingProvider();
        drawMaths();
        const target = document.createElement('div');
        const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
        for (const ch of 'At $10/month, [p](https://x.y) is **bo') renderer.write(ch);
        expect(target.querySelector('strong')?.textContent).toBe('bo');
        expect(target.querySelector('a')?.textContent).toBe('p');
        renderer.end();
    });

    it('does not let an unclosed $$ take the paragraphs after it while streaming', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        const target = document.createElement('div');
        const renderer = aparteGlobalConfig.createStreamingMarkdownRenderer(target)!;
        renderer.write('Bash variables:\n$$ is the PID, $! the last job.\n\nSecond paragraph with *emphasis*.\n\nThird');
        const open = target.querySelector('code.language-math');
        expect(open?.textContent ?? '').not.toContain('Second paragraph');
        expect(target.querySelector('em')?.textContent).toBe('emphasis');
    });

    it('draws no link while a single $ formula with a bracket is still open', () => {
        setupMarkedStreamingProvider();
        drawMaths();
        streamCharByChar('Let $[a, b]$ be an interval.', (el) => {
            expect(el.querySelector('a')).toBeNull();
        });
    });
});

describe('maskMath', () => {
    it('hides each formula and puts it back verbatim', () => {
        const src = 'a $x_1$ and \\[ y \\] and `$k$` and \\$5 and $5 and ``unclosed';
        const { masked, unmask } = maskMath(src);
        expect(masked).not.toContain('x_1');
        expect(masked).toContain('`$k$`');
        expect(masked).toContain('$5');
        expect(unmask(masked)).toBe(src);
    });

    it('hides only the brackets after a single $ still open', () => {
        const src = 'At $10/month, [p](https://x.y) is **bo';
        const { masked, unmask } = maskMath(src);
        expect(masked).not.toContain('[');
        expect(masked).toContain('p](https://x.y) is **bo');
        expect(unmask(masked)).toBe(src);
    });

    it('leaves a $ alone across a blank line, and a marker it never made', () => {
        const { masked, unmask } = maskMath('$a\n\nb$');
        expect(masked).toBe('$a\n\nb$');
        expect(unmask('\uE0007\uE001')).toBe('');
    });
});
