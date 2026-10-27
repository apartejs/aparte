import type { MarkedExtension, Tokens } from 'marked';
import { PAIRS, closerAfter, dollarCloser } from './scan.js';

/**
 * Maths in Markdown, recognised before Markdown can touch it.
 *
 * marked reads TeX as Markdown: `\,` and `\\` are escapes to it, `a*b*c` is emphasis,
 * `x_1 + y_2` is too. So maths has to be claimed by the tokenizer, ahead of escapes and
 * emphasis — which is what a marked extension's tokenizer is — and written out as the
 * placeholder every code-language renderer reads: `<code class="language-math
 * math-inline">TeX</code>` inline, `<pre><code class="language-math math-display">`
 * for a block. A renderer such as `@aparte/plugin-katex` draws it; with none, the TeX
 * shows intact, as code.
 *
 * The delimiters: `$$…$$` and `\[…\]` for display maths (a block on its own lines, or
 * inside a paragraph), `\(…\)` and `$…$` inline. A single `$` follows Pandoc's rule, so
 * a price stays a price: the opening `$` has a character right after it, the closing one
 * a character right before it and no digit right after it — `$5 and $10` is text. A
 * backquote before the closer ends the attempt: code wins.
 */

export interface MarkedMathOptions {
    /**
     * Read a formula that has not closed yet as one still arriving, marked
     * `data-aparte-open`, instead of as text. For the block a stream is still writing;
     * never for finished text, where an unclosed `\(` is just a parenthesis.
     */
    live?: boolean;
}

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


interface MathToken extends Tokens.Generic {
    text: string;
    display: boolean;
    open: boolean;
}

function placeholder(token: MathToken, block: boolean): string {
    const open = token.open ? ' data-aparte-open' : '';
    const kind = token.display ? 'math-display' : 'math-inline';
    const code = `<code class="language-math ${kind}"${open}>${escapeHtml(token.text)}</code>`;
    return block ? `<pre${open}>${code}</pre>\n` : code;
}

/**
 * The marked extension: maths as code-language placeholders.
 *
 * @example
 * import { Marked } from 'marked';
 * import { markedMath } from '@aparte/plugin-marked/math';
 * const md = new Marked(markedMath());
 */
export function markedMath(options: MarkedMathOptions = {}): MarkedExtension {
    const live = options.live === true;
    return {
        extensions: [
            {
                name: 'aparteMathBlock',
                level: 'block',
                start(src: string) {
                    const m = /(^|\n) {0,3}(\$\$|\\\[)/.exec(src);
                    return m ? m.index + m[1]!.length : undefined;
                },
                tokenizer(src: string): MathToken | undefined {
                    const head = /^ {0,3}(\$\$|\\\[)/.exec(src);
                    if (!head) return undefined;
                    const pair = PAIRS.find((p) => p.open === head[1])!;
                    const from = head[0].length;
                    const end = closerAfter(src, from, pair.close);
                    if (end === -1) {
                        if (!live) return undefined;
                        return { type: 'aparteMathBlock', raw: src, text: src.slice(from).trim(), display: true, open: true };
                    }
                    // A block owns its last line: text after the closer makes it inline maths.
                    const rest = /^[ \t]*(\n|$)/.exec(src.slice(end + pair.close.length));
                    if (!rest) return undefined;
                    const raw = src.slice(0, end + pair.close.length + rest[0].length);
                    return { type: 'aparteMathBlock', raw, text: src.slice(from, end).trim(), display: true, open: false };
                },
                renderer: (token) => placeholder(token as MathToken, true),
            },
            {
                name: 'aparteMathInline',
                level: 'inline',
                start(src: string) {
                    const i = src.search(/\$|\\[([]/);
                    return i === -1 ? undefined : i;
                },
                tokenizer(src: string): MathToken | undefined {
                    for (const pair of PAIRS) {
                        if (!src.startsWith(pair.open)) continue;
                        const end = closerAfter(src, pair.open.length, pair.close);
                        if (end === -1) {
                            if (!live) return undefined;
                            return { type: 'aparteMathInline', raw: src, text: src.slice(pair.open.length), display: pair.display, open: true };
                        }
                        const raw = src.slice(0, end + pair.close.length);
                        return { type: 'aparteMathInline', raw, text: src.slice(pair.open.length, end), display: pair.display, open: false };
                    }
                    const end = dollarCloser(src);
                    if (end === -1) return undefined;
                    return { type: 'aparteMathInline', raw: src.slice(0, end + 1), text: src.slice(1, end), display: false, open: false };
                },
                renderer: (token) => placeholder(token as MathToken, false),
            },
        ],
    };
}
