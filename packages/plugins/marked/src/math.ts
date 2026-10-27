import { Tokenizer, type MarkedExtension, type Tokens } from 'marked';
import { PAIRS, blankMath, closerAfter, dollarCloser, isEscapedBrackets, openEnd } from './scan.js';

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
 * backquote before the closer ends the attempt: code wins. So does a blank line, and a
 * line opening a block TeX never starts a line with (a `~~~` fence, a heading, a quote,
 * an HTML block, a rule; a list item after `$$ is the PID`).
 */

export interface MarkedMathOptions {
    /**
     * Read a formula that has not closed yet as one still arriving, marked
     * `data-aparte-open`, instead of as text — while nothing it cannot run into has come
     * after it, since then it can never close. For the block a stream is still writing;
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
 * The marked extension: maths as code-language placeholders. Internal: the providers in
 * this package install it when a `math` renderer is registered.
 */
export function markedMath(options: MarkedMathOptions = {}): MarkedExtension {
    const live = options.live === true;
    return {
        // marked looks ahead for the `*`, `_` or `~` closing an emphasis or a strikethrough
        // on a masked copy of the text; a formula left in it closes an italic opened before
        // it (`*the optimum $x^*$*`). Its `emStrongMask` hook cannot hide one: it receives a
        // copy where `\(` is already `++`, so the formulas are found on the real text here.
        tokenizer: {
            emStrong(src, maskedSrc, prevChar) {
                return Tokenizer.prototype.emStrong.call(this, src, blankMath(src, maskedSrc), prevChar);
            },
            del(src, maskedSrc, prevChar) {
                return Tokenizer.prototype.del.call(this, src, blankMath(src, maskedSrc), prevChar);
            },
        },
        extensions: [
            {
                name: 'aparteMathBlock',
                level: 'block',
                // Where a block may start inside this paragraph. marked hands `start` the
                // source minus its first character, so only a real newline marks a line.
                start(src: string) {
                    const stop = src.search(/\n[ \t]*\n/);
                    const m = /\n {0,3}(\$\$|\\\[)/.exec(stop < 0 ? src : src.slice(0, stop));
                    return m ? m.index + 1 : undefined;
                },
                tokenizer(src: string): MathToken | undefined {
                    const head = /^ {0,3}(\$\$|\\\[)/.exec(src);
                    if (!head) return undefined;
                    const pair = PAIRS.find((p) => p.open === head[1])!;
                    const from = head[0].length;
                    const end = closerAfter(src, from, pair.close);
                    if (end === -1) {
                        // Still arriving only while it runs to the end of what has come:
                        // past a blank line, a backquote or a block's line it can never
                        // close, and it is text — the paragraph it begins, as at the end.
                        if (!live || openEnd(src, from, pair.close) < src.length) return undefined;
                        return { type: 'aparteMathBlock', raw: src, text: src.slice(from).trim(), display: true, open: true };
                    }
                    const text = src.slice(from, end).trim();
                    if (isEscapedBrackets(pair.open, text, '')) return undefined;
                    // A block owns its last line: text after the closer makes it inline maths.
                    const rest = /^[ \t]*(\n|$)/.exec(src.slice(end + pair.close.length));
                    if (!rest) return undefined;
                    const raw = src.slice(0, end + pair.close.length + rest[0].length);
                    return { type: 'aparteMathBlock', raw, text, display: true, open: false };
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
                tokenizer(src: string, tokens: Array<{ raw: string }>): MathToken | undefined {
                    for (const pair of PAIRS) {
                        if (!src.startsWith(pair.open)) continue;
                        const end = closerAfter(src, pair.open.length, pair.close);
                        if (end === -1) {
                            if (!live || pair.open !== '$$' && /[\p{L}\p{N}]$/u.test(tokens.at(-1)?.raw ?? '')) return undefined;
                            if (openEnd(src, pair.open.length, pair.close) < src.length) return undefined;
                            return { type: 'aparteMathInline', raw: src, text: src.slice(pair.open.length), display: pair.display, open: true };
                        }
                        const text = src.slice(pair.open.length, end);
                        if (isEscapedBrackets(pair.open, text, tokens.at(-1)?.raw ?? '')) return undefined;
                        const raw = src.slice(0, end + pair.close.length);
                        return { type: 'aparteMathInline', raw, text, display: pair.display, open: false };
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
