/**
 * Finding formulas in Markdown source: the scanners the maths tokenizer, its emphasis
 * mask and the streaming entry's `remend` mask share. Internal to the package.
 *
 * One rule set for all three, so what is maths to the tokenizer is exactly what the two
 * masks hide. A formula never crosses a blank line (Pandoc: maths lives inside one
 * paragraph), and code wins: a backquote before the closer ends the attempt. Nor does
 * it run into a line that opens a block TeX never starts a line with — a `~~~` fence,
 * a heading, a quote, an HTML block, a rule — or into a list item when the opener had
 * text after it (`$$ is the PID`): a `$$` alone on its line opens a display formula,
 * whose lines may start like one (`- x^2`).
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
 * A line opening a block no formula runs into: a `~~~` fence, a heading, a quote, a rule,
 * an HTML block — only one that can interrupt a paragraph in CommonMark (a block tag, a
 * comment, a declaration), so a TeX line such as `<x, y> = 0` stays in its formula.
 */
const BLOCK_LINE = /^ {0,3}(?:~~~|#{1,6}(?:[ \t]|$)|>|<(?:[/!?]|(?:address|article|aside|blockquote|details|dialog|div|dl|fieldset|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|script|section|style|table|textarea|ul)(?=[\s/>]|$))|([-*_])(?:[ \t]*\1){2,}[ \t]*$)/i;
/** A list item's line. */
const LIST_LINE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]/;

/** Whether the newline at `i` starts a line a formula stops before. */
function blockLineAt(src: string, i: number, listStops: boolean): boolean {
    const next = src.indexOf('\n', i + 1);
    const line = src.slice(i + 1, next < 0 ? src.length : next);
    return BLOCK_LINE.test(line) || listStops && LIST_LINE.test(line);
}

/**
 * Scan the body of a formula from `from` for `close`, skipping TeX escapes (`\$` inside
 * `$$…$$`): the closer's index, or where the scan gives up — at a backquote, a blank
 * line or a block's line — and `src.length` when it runs out of text first. An empty
 * `close` is never found.
 */
function scanBody(src: string, from: number, close: string): { at: number; closed: boolean } {
    const eol = src.indexOf('\n', from);
    const listStops = /\S/.test(src.slice(from, eol < 0 ? src.length : eol));
    for (let i = from; i < src.length; i++) {
        if (close !== '' && src.startsWith(close, i)) return { at: i, closed: true };
        if (src[i] === '`' || src[i] === '\n' && (blankLineAt(src, i) || blockLineAt(src, i, listStops))) return { at: i, closed: false };
        if (src[i] === '\\' && close !== '\\)' && close !== '\\]') i++;
    }
    return { at: src.length, closed: false };
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
 * something a formula does not run into comes first: a backquote, a blank line, a
 * block's line.
 */
export function closerAfter(src: string, from: number, close: string): number {
    const { at, closed } = scanBody(src, from, close);
    return closed ? at : -1;
}

/**
 * Where a formula whose body starts at `from` and that `close` has not closed runs to:
 * where the scan for its closer gives up, by the same rule. Short of `src.length`, the
 * formula can never close — it has met something it does not run into.
 */
export function openEnd(src: string, from: number, close: string): number {
    return scanBody(src, from, close).at;
}

/**
 * Whether a `\(…\)` or `\[…\]` is a Markdown escape rather than maths: in Markdown those
 * are how a reply writes literal brackets — a citation `\[1\]`, an index `array\[0\]`. So
 * a pair that follows a letter or a digit, or holds nothing but a number, is left to
 * Markdown. A `$` or `$$` pair is never an escape.
 */
export function isEscapedBrackets(open: string, text: string, before: string): boolean {
    if (!open.startsWith('\\')) return false;
    return /[\p{L}\p{N}]$/u.test(before) || /^\s*[\d.,]*\s*$/.test(text);
}

/** The delimiters a formula can open with, and what closes each. */
export const PAIRS: ReadonlyArray<{ open: string; close: string; display: boolean }> = [
    { open: '$$', close: '$$', display: true },
    { open: '\\[', close: '\\]', display: true },
    { open: '\\(', close: '\\)', display: false },
];

/**
 * The formulas in `src`, as `[start, end)` ranges. With `open`, a formula whose opener
 * has no closer yet runs to where the scan for its closer gives up, as one still
 * arriving; `openDollar` is where the first single `$` opens something nothing closes
 * yet (it may be a price), or -1.
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
        let end = -1;
        const pair = PAIRS.find((p) => src.startsWith(p.open, i));
        if (pair) {
            const from = i + pair.open.length;
            const close = closerAfter(src, from, pair.close);
            if (close !== -1) end = close + pair.close.length;
            else if (open) end = openEnd(src, from, pair.close);
        } else if (c === '\\') {
            // A Markdown escape, as marked reads one where no formula opens: `\$` is a
            // dollar, and `\\(` a backslash before a parenthesis.
            i += 2;
            continue;
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
 *
 * An opener that will never close — `\[ a` followed by a backquote — is text to the
 * tokenizer but stays hidden up to where it stops: remend ignores the backslash, and
 * would complete that `[` into a link whose tail marked then prints as text.
 */
export function maskMath(src: string): { masked: string; unmask: (s: string) => string } {
    const { spans, openDollar } = mathSpans(src, true);
    // A single `$` still open may be a formula on its way: `$[a, b` of an interval, whose
    // bracket remend would complete into a link — and its `links: false` does not stop it.
    // So each bracket after it is hidden, and only the brackets: a price (`$10/month`)
    // must not cost the rest of the paragraph its healing. A real link after the price
    // only loses its pending look until it is complete.
    if (openDollar >= 0) {
        const end = openEnd(src, openDollar + 1, '');
        if (!spans.some(([a, b]) => a < end && b > openDollar)) {
            for (let k = openDollar; k < end; k++) if (src[k] === '[') spans.push([k, k + 1]);
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
 * marked's masked copy of the text, with every formula in `src` blanked too, for its
 * emphasis and strikethrough scans: they look ahead for the closing `*`, `_` or `~` on
 * that copy, and a `*` inside `$x^*$` would otherwise close an italic opened before the
 * formula.
 *
 * `src` is the text from where the tokenizer stands; `masked` is marked's copy of the
 * whole text, of the same length, so `src` lines up with its tail — as marked's own
 * scans read it.
 */
export function blankMath(src: string, masked: string): string {
    const offset = masked.length - src.length;
    // marked's copy is no place to look for maths: every backslash escape is `++` in it,
    // `\(` and `\[` included. Read the real text, except where marked set a code span, a
    // link or a tag aside as `[aaa]` — read as code, since the tokenizer never looks for
    // a formula inside one.
    let reading = '';
    for (let i = 0; i < src.length; i++) reading += masked[offset + i] === '+' ? src[i]! : masked[offset + i]!;
    reading = reading.replace(/\[a+\]/g, (run) => `\`${'a'.repeat(run.length - 2)}\``);
    // Only the formulas the tokenizer will draw. Not one still open: the `**` remend adds
    // after `**Theorem \(f` closes the bold around it, not inside it. Nor brackets the
    // tokenizer leaves escaped (`array\[i*\]`), which marked reads as it always has.
    const spans = mathSpans(reading, false).spans
        .filter(([start, end]) => !isEscapedBrackets(reading.slice(start, start + 2), reading.slice(start + 2, end - 2), reading.slice(0, start)));
    let out = masked.slice(0, offset);
    let at = 0;
    for (const [start, end] of spans) {
        out += masked.slice(offset + at, offset + start) + 'a'.repeat(end - start);
        at = end;
    }
    return out + masked.slice(offset + at);
}
