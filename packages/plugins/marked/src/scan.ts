/**
 * Finding formulas in Markdown source: the scanners the maths tokenizer and the
 * streaming entry's `remend` mask share. Internal to the package.
 */

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);

/**
 * Index of the `$` closing a single-`$` formula that opens at 0, or -1 — Pandoc's rule,
 * which gives up rather than looking further: a `$` with a space before it ends the
 * attempt (`$a $b$` is text), and so does a closer with a digit after it (`$x$5`).
 */
export function dollarCloser(src: string): number {
    if (src[0] !== '$' || isSpace(src[1]) || src[1] === '$') return -1;
    for (let i = 1; i < src.length; i++) {
        const c = src[i];
        if (c === '\\') { i++; continue; }
        if (c === '`') return -1;
        if (c === '\n' && src[i + 1] === '\n') return -1;
        if (c !== '$') continue;
        if (isSpace(src[i - 1]) || /\d/.test(src[i + 1] ?? '')) return -1;
        return i;
    }
    return -1;
}

/** Index of `close` after `from`, skipping TeX escapes (`\$` inside `$$…$$`), or -1. */
export function closerAfter(src: string, from: number, close: string): number {
    for (let i = from; i < src.length; i++) {
        if (src.startsWith(close, i)) return i;
        if (src[i] === '\\' && close !== '\\)' && close !== '\\]') i++;
    }
    return -1;
}

/** The delimiters a formula can open with, and what closes each. */
export const PAIRS: ReadonlyArray<{ open: string; close: string; display: boolean }> = [
    { open: '$$', close: '$$', display: true },
    { open: '\\[', close: '\\]', display: true },
    { open: '\\(', close: '\\)', display: false },
];

/**
 * Hide the maths in `src` from a text rewriter, and put it back afterwards.
 *
 * `remend` completes Markdown as it streams — it closes `**`, a backquote, a link — and
 * it reads TeX as Markdown too, so it "completes" `\[ a+b` into a link and the `_` of
 * `x_1` into emphasis. Each formula is swapped for a private-use marker it cannot read,
 * the rewriter runs, and the formulas go back. Code spans are left as they are.
 */
export function maskMath(src: string): { masked: string; unmask: (s: string) => string } {
    const spans: string[] = [];
    let out = '';
    for (let i = 0; i < src.length;) {
        const c = src[i]!;
        if (c === '`') {
            const run = /^`+/.exec(src.slice(i))![0];
            const close = src.indexOf(run, i + run.length);
            const end = close === -1 ? src.length : close + run.length;
            out += src.slice(i, end);
            i = end;
            continue;
        }
        if (c === '\\' && src[i + 1] === '$') { out += '\\$'; i += 2; continue; }
        let end = -1;
        const pair = PAIRS.find((p) => src.startsWith(p.open, i));
        if (pair) {
            const close = closerAfter(src, i + pair.open.length, pair.close);
            end = close === -1 ? src.length : close + pair.close.length;
        } else if (c === '$') {
            const close = dollarCloser(src.slice(i));
            if (close !== -1) end = i + close + 1;
        }
        if (end === -1) { out += c; i++; continue; }
        out += `${spans.length}`;
        spans.push(src.slice(i, end));
        i = end;
    }
    return {
        masked: out,
        unmask: (s) => s.replace(/(\d+)/g, (_m, n: string) => spans[Number(n)] ?? ''),
    };
}
