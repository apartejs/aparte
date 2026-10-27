/**
 * Finding formulas in Markdown source: the scanners the maths tokenizer, its emphasis
 * mask and the streaming entry's `remend` mask share. Internal to the package.
 *
 * One rule set for all three, so what is maths to the tokenizer is exactly what the two
 * masks hide. A formula never crosses a blank line (Pandoc: maths lives inside one
 * paragraph), and code wins: a backquote before the closer ends the attempt.
 */

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);

/** A blank line at `i`: a newline, then only spaces or tabs up to the next one. */
function blankLineAt(src: string, i: number): boolean {
    if (src[i] !== '\n') return false;
    for (let j = i + 1; j < src.length; j++) {
        if (src[j] === '\n') return true;
        if (src[j] !== ' ' && src[j] !== '\t') return false;
    }
    return false;
}

/**
 * Index of the `$` closing a single-`$` formula that opens at 0, or -1 — Pandoc's rule,
 * which gives up rather than looking further: a `$` with a space before it ends the
 * attempt (`$a $b$` is text), and so does a closer with a digit after it (`$x$5`). A `$`
 * inside braces — `\text{in $x$ units}` — is TeX, not the closer.
 */
export function dollarCloser(src: string): number {
    if (src[0] !== '$' || isSpace(src[1]) || src[1] === '$') return -1;
    let depth = 0;
    for (let i = 1; i < src.length; i++) {
        const c = src[i];
        if (c === '\\') { i++; continue; }
        if (c === '`' || blankLineAt(src, i)) return -1;
        if (c === '{') { depth++; continue; }
        if (c === '}') { depth = Math.max(0, depth - 1); continue; }
        if (c !== '$' || depth > 0) continue;
        if (isSpace(src[i - 1]) || /\d/.test(src[i + 1] ?? '')) return -1;
        return i;
    }
    return -1;
}

/**
 * Index of `close` after `from`, skipping TeX escapes (`\$` inside `$$…$$`), or -1 when
 * a blank line or a backquote comes first.
 */
export function closerAfter(src: string, from: number, close: string): number {
    for (let i = from; i < src.length; i++) {
        if (src.startsWith(close, i)) return i;
        if (src[i] === '`' || blankLineAt(src, i)) return -1;
        if (src[i] === '\\' && close !== '\\)' && close !== '\\]') i++;
    }
    return -1;
}

/** Where an unclosed formula opened at `from` would run to: the next blank line, or the end. */
export function openEnd(src: string, from: number): number {
    for (let i = from; i < src.length; i++) if (blankLineAt(src, i)) return i;
    return src.length;
}

/** The delimiters a formula can open with, and what closes each. */
export const PAIRS: ReadonlyArray<{ open: string; close: string; display: boolean }> = [
    { open: '$$', close: '$$', display: true },
    { open: '\\[', close: '\\]', display: true },
    { open: '\\(', close: '\\)', display: false },
];

/**
 * The formulas in `src`, as `[start, end)` ranges. With `open`, a formula whose opener
 * has no closer yet runs to its paragraph's end, as one still arriving; `openDollar` is
 * where the first single `$` opens something nothing closes yet (it may be a price), or -1.
 */
export function mathSpans(src: string, open: boolean): { spans: Array<[number, number]>; openDollar: number } {
    const spans: Array<[number, number]> = [];
    let openDollar = -1;
    for (let i = 0; i < src.length;) {
        const c = src[i]!;
        if (c === '`') {
            const run = /^`+/.exec(src.slice(i))![0];
            const close = src.indexOf(run, i + run.length);
            i = close === -1 ? i + run.length : close + run.length;
            continue;
        }
        if (c === '\\' && src[i + 1] === '$') { i += 2; continue; }
        let end = -1;
        const pair = PAIRS.find((p) => src.startsWith(p.open, i));
        if (pair) {
            const close = closerAfter(src, i + pair.open.length, pair.close);
            if (close !== -1) end = close + pair.close.length;
            else if (open) end = openEnd(src, i);
        } else if (c === '$') {
            const close = dollarCloser(src.slice(i));
            if (close !== -1) end = i + close + 1;
            else if (openDollar < 0 && !isSpace(src[i + 1]) && src[i + 1] !== '$') openDollar = i;
        }
        if (end <= i) { i++; continue; }
        spans.push([i, end]);
        i = end;
    }
    return { spans, openDollar };
}

/**
 * Hide the maths in `src` from a text rewriter, and put it back afterwards.
 *
 * `remend` completes Markdown as it streams — it closes `**`, a backquote, a link — and
 * it reads TeX as Markdown too, so it "completes" `\[ a+b` into a link and the `_` of
 * `x_1` into emphasis. Each formula is swapped for a private-use marker it cannot read,
 * the rewriter runs, and the formulas go back. Code spans are left as they are.
 */
export function maskMath(src: string): { masked: string; unmask: (s: string) => string } {
    const { spans, openDollar } = mathSpans(src, true);
    // A single `$` still open may be a formula on its way: `$[a, b` of an interval, whose
    // bracket remend would complete into a link — and its `links: false` does not stop it.
    // So the rest of its paragraph is hidden too when it holds a bracket; a price followed
    // by a real link only loses the link's pending look until the link is complete.
    if (openDollar >= 0) {
        const end = openEnd(src, openDollar);
        if (src.slice(openDollar, end).includes('[') && !spans.some(([a, b]) => a < end && b > openDollar)) {
            spans.push([openDollar, end]);
            spans.sort((a, b) => a[0] - b[0]);
        }
    }
    const kept: string[] = [];
    let out = '';
    let at = 0;
    for (const [start, end] of spans) {
        out += src.slice(at, start) + `\uE000${kept.length}\uE001`;
        kept.push(src.slice(start, end));
        at = end;
    }
    out += src.slice(at);
    return {
        masked: out,
        unmask: (s) => s.replace(/\uE000(\d+)\uE001/g, (_m, n: string) => kept[Number(n)] ?? ''),
    };
}

/**
 * `src` with every formula replaced by as many neutral letters, for marked's emphasis
 * scan: it looks ahead for a closing `*` or `_` on a masked copy of the text, and a `*`
 * inside `$x^*$` would otherwise close an italic opened before the formula.
 */
export function blankMath(src: string, open: boolean): string {
    // marked hands this a copy where code spans and links are already `[aaa]`: read those
    // as the code they were, or a formula would be found where the tokenizer sees none.
    const { spans } = mathSpans(src.replace(/\[a+\]/g, (run) => `\`${'a'.repeat(run.length - 2)}\``), open);
    let out = '';
    let at = 0;
    for (const [start, end] of spans) {
        out += src.slice(at, start) + 'a'.repeat(end - start);
        at = end;
    }
    return out + src.slice(at);
}
