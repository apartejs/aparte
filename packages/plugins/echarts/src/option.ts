/**
 * Reading an ECharts `option` that a model wrote or a tool returned: making it harmless,
 * reading a fence that is still arriving, and the words and numbers a screen reader gets.
 * Pure — no DOM, no ECharts — so all of it can be checked in Node.
 */

export type EChartsOption = Record<string, unknown>;

/** Deeper than any real option; past it, the rest is dropped rather than walked. */
const MAX_DEPTH = 64;
/** The most rows the hidden table reads out. */
const MAX_ROWS = 1000;
/** The most columns it reads out: a category and 49 series. */
const MAX_COLUMNS = 50;
/** The most cells, its header included, whatever the rows and columns: the table is rebuilt on every frame. */
const MAX_CELLS = 10_000;

/** Keys that would reach an object's prototype once an option is merged into another. */
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * The keys ECharts writes into a text's `style` attribute in its SVG output
 * (`style="font-size:…;font-family:…"`): a value with a `;` in it would add declarations
 * of its own — a `fill: url(https://…)` that fetches.
 */
const FONT_KEYS = new Set(['font', 'fontFamily', 'fontStyle', 'fontWeight', 'fontSize']);
/** What a font name, size, style or weight is made of — and nothing a declaration needs. */
export const SAFE_FONT = /^[\p{L}\p{N}\s,'"._/%-]*$/u;

/**
 * A string ECharts turns into a request: `image://…` (a symbol, a legend icon, a handle drawn
 * from a picture) and a CSS `url(…)` (a fill or a stroke pointing at another document).
 * Not `curl (…)`: the `url` must start a word. Tested on the string with its CSS escapes
 * read (`cssUnescape`), since zrender copies a colour into a `fill` / `stroke` attribute as
 * it is, and CSS reads `u\rl(` or `\75 rl(` as `url(` there.
 */
const IMAGE_SCHEME = /^\s*image:\/\//i;
const CSS_URL = /(^|[^\w-])(url|src)\s*\(/i;
/** A CSS escape: up to six hex digits and the one space that may end them, or any other character. */
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|([^\n\r\f]))/gi;

/**
 * What a colour may be where ECharts draws one: a name (`red`, `transparent`, `none`, and the
 * words ECharts reads itself — `auto`, `inherit`, `source`), `#hex`, or `rgb()` / `rgba()` /
 * `hsl()` / `hsla()` holding only numbers. A gradient or a pattern is an OBJECT, which ECharts
 * builds itself, and is walked like any other.
 */
const SAFE_COLOUR = /^\s*(?:[a-z]+|#[0-9a-f]{3,8}|(?:rgba?|hsla?)\(\s*[\d.,%\s/+-]*(?:deg)?[\d.,%\s/+-]*\))\s*$/i;
/**
 * The keys zrender reads a colour from: `fill`, `stroke`, and any key naming a colour —
 * `color`, every `…Color`, a candlestick's `color0` / `borderColor0` / `borderColorDoji`. The
 * few that hold no colour (`colorBy`, `colorAlpha`…) hold a word or a number, which pass.
 */
const isColourKey = (key: string): boolean => key === 'fill' || key === 'stroke' || /(^c|C)olor/.test(key);

/** `s` as CSS reads it once its escapes are decoded. */
function cssUnescape(s: string): string {
    return s.replace(CSS_ESCAPE, (_all, hex: string | undefined, other: string | undefined) => {
        if (other !== undefined) return other;
        const code = parseInt(hex!, 16);
        return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '�' :String.fromCodePoint(code);
    });
}

/**
 * Keys ECharts compiles: a dataset `filter` transform's `reg` is `new RegExp(…)` run on every
 * value, and a pattern a model wrote can backtrack for minutes (`^(a+)+$`).
 */
const COMPILED_KEYS = new Set(['reg']);

/** The tooltip options that only an HTML tooltip reads: its class, its CSS, where it is put. */
const HTML_TOOLTIP_KEYS = ['extraCssText', 'className', 'appendTo', 'appendToBody'];
/** The toolbox buttons that leave the drawing: a download / new tab, and an HTML table. */
const HTML_FEATURES = ['saveAsImage', 'dataView'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * An ECharts option made harmless to draw. The option comes from a model or a tool, so
 * whatever in it ECharts would turn into HTML, a request or a navigation goes:
 *
 * - every `tooltip` (the root's, a series', a data item's) is drawn, not written as HTML:
 *   `renderMode: 'richText'`, and the HTML-only `extraCssText`, `className`, `appendTo`,
 *   `appendToBody` go. A string `formatter` stays — in rich-text mode it is drawn as text;
 * - `toolbox.feature.saveAsImage` (a download, or a new tab) and `dataView` (an HTML table
 *   with a textarea) go;
 * - a value with an `image` (a picture fill, a rich-text background) or an `svgElement` (an
 *   SVG pattern ECharts would build node by node — a `<script>` included) goes whole, and so
 *   does a `graphic` element of `type: 'image'`;
 * - a string `image://…` (a symbol, an icon) or holding a CSS `url(…)` goes, its CSS escapes
 *   read first; so does any string pairing a backslash with a bracket;
 * - where a colour goes (`color`, `fill`, `stroke`, any `…Color`), only colour syntax stays:
 *   zrender copies it into an SVG attribute as it is;
 * - a dataset filter's `reg` goes: ECharts compiles it, and a pattern can backtrack for minutes;
 * - a string `link` / `sublink` (a title, a treemap or sunburst node: ECharts opens it on a
 *   click, and a `javascript:` URL would run in the page) goes;
 * - a font value with anything beyond a font name in it (`;`, `:`, brackets) goes: ECharts
 *   writes it into a `style` attribute;
 * - `__proto__`, `constructor` and `prototype` keys go.
 *
 * Anything else is kept as it was. `null` when the option is not an object.
 */
export function sanitizeEChartsOption(option: unknown): EChartsOption | null {
    if (!isObject(option)) return null;
    const clean = walk(option, '', 0);
    return isObject(clean) ? clean : null;
}

function walk(value: unknown, key: string, depth: number): unknown {
    if (depth > MAX_DEPTH) return undefined;
    if (typeof value === 'string') {
        if (IMAGE_SCHEME.test(value) || CSS_URL.test(value) || CSS_URL.test(cssUnescape(value))) return undefined;
        // Whatever an escape could spell, a backslash beside a bracket is no label anyone writes.
        if (value.includes('\\') && value.includes('(')) return undefined;
        if (isColourKey(key) && !SAFE_COLOUR.test(value)) return undefined;
        if (FONT_KEYS.has(key) && !SAFE_FONT.test(value)) return undefined;
        if (key === 'link' || key === 'sublink') return undefined;
        return value;
    }
    if (Array.isArray(value)) {
        const out: unknown[] = [];
        for (const item of value) {
            const clean = walk(item, key, depth + 1);
            // A dropped object leaves no hole (a graphic element, a feature); a dropped
            // value keeps its place, so the data after it keeps its index.
            if (clean !== undefined) out.push(clean);
            else if (!isObject(item)) out.push(null);
        }
        return out;
    }
    if (!isObject(value)) return value;
    if ('image' in value || 'svgElement' in value || value['type'] === 'image') return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        if (PROTO_KEYS.has(k) || COMPILED_KEYS.has(k)) continue;
        const clean = walk(v, k, depth + 1);
        if (clean !== undefined) out[k] = clean;
    }
    if (key === 'tooltip') {
        out['renderMode'] = 'richText';
        for (const k of HTML_TOOLTIP_KEYS) delete out[k];
    }
    if (key === 'feature') for (const k of HTML_FEATURES) delete out[k];
    return out;
}

/**
 * The option a fence holds, read as JSON: the whole of it once it parses, else — while it is
 * still arriving (`open`) — the longest prefix that does once its open brackets are closed,
 * so a series appears as its numbers arrive. `undefined` when nothing parses.
 */
export function parseOption(source: string, open = false): unknown {
    try { return JSON.parse(source); } catch { /* still arriving, or broken */ }
    return open ? parsePrefix(source) : undefined;
}

/**
 * The longest complete-looking prefix of a JSON text, closed. The places it may be cut are
 * where a value has just ended — before a `,`, after a `}` or a `]` — or a container has
 * just opened, and at each the brackets still open are known. Never inside a string: a
 * label half written is not drawn.
 */
function parsePrefix(source: string): unknown {
    const stack: string[] = [];
    const cuts: Array<{ at: number; closers: string }> = [];
    const cut = (at: number): void => {
        cuts.push({ at, closers: stack.slice().reverse().join('') });
        if (cuts.length > 8) cuts.shift();
    };
    let inString = false;
    let escaped = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); cut(i + 1); }
        else if (ch === '}' || ch === ']') { stack.pop(); cut(i + 1); }
        else if (ch === ',') cut(i);
    }
    for (let i = cuts.length - 1; i >= 0; i--) {
        const { at, closers } = cuts[i]!;
        try { return JSON.parse(source.slice(0, at) + closers); } catch { /* an earlier cut */ }
    }
    return undefined;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/**
 * Whether an option has something to draw yet: a series, or a dataset — at its root, or in
 * the `baseOption` (and timeline `options`) an option with a timeline or media queries keeps
 * them in.
 */
export function drawable(option: EChartsOption): boolean {
    const has = (o: unknown): boolean => {
        if (!isObject(o)) return false;
        const series = o['series'];
        if (Array.isArray(series) ? series.some(isObject) : isObject(series)) return true;
        return o['dataset'] !== undefined;
    };
    return has(option) || has(option['baseOption']) || list(option['options']).some(has);
}

/** The option's own title — its first `title.text` — if it has one. */
export function titleOf(option: EChartsOption): string | undefined {
    const title = list(option['title'])[0];
    const text = isObject(title) ? title['text'] : undefined;
    return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

/** One cell as a screen reader hears it. */
function cell(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(cell).join(', ');
    if (isObject(v)) return cell(v['value']);
    return '';
}

export interface ChartTable {
    head: string[];
    rows: string[][];
    /** Set when the chart holds more than the table lists: past `MAX_COLUMNS`, `MAX_ROWS` or `MAX_CELLS`. */
    cut?: true;
}

/**
 * A table `width` columns by `height` rows, read cell by cell, held to the bounds: a model's
 * few bytes (ten thousand empty series beside a thousand categories) never become millions of
 * cells, built again on every frame of a chart still arriving. `null` when it has no column.
 */
function grid(width: number, height: number, headAt: (c: number) => string, cellAt: (r: number, c: number) => string): ChartTable | null {
    const columns = Math.min(width, MAX_COLUMNS);
    if (columns <= 0) return null;
    // The header row counts: columns × (rows + 1) stays within MAX_CELLS.
    const rows = Math.max(0, Math.min(height, MAX_ROWS, Math.floor(MAX_CELLS / columns) - 1));
    const table: ChartTable = {
        head: Array.from({ length: columns }, (_, c) => headAt(c)),
        rows: Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => cellAt(r, c))),
    };
    if (columns < width || rows < height) table.cut = true;
    return table;
}

/**
 * How many rows of a dataset are its header, as ECharts reads `sourceHeader`: a number, `true`
 * for one, `false` for none, and — `'auto'`, the default — one when the first values of the
 * first row hold a string and no number (`null` and `'-'` say nothing).
 */
function headerRows(dataset: Record<string, unknown>, first: unknown[]): number {
    const option = dataset['sourceHeader'];
    if (typeof option === 'number') return Number.isFinite(option) && option > 0 ? Math.floor(option) : 0;
    if (typeof option === 'boolean') return option ? 1 : 0;
    let rows: number | undefined;
    for (const v of first.slice(0, 10)) {
        if (v === null || v === undefined || v === '-') continue;
        if (typeof v === 'string') rows ??= 1;
        else rows = 0;
    }
    return rows ?? 0;
}

/**
 * The numbers of a chart as a table, when its shape says plainly what they are: a
 * `dataset.source` (rows of values, or of objects), a category axis with series beside it,
 * or a series of named values (a pie, a funnel). `null` for anything else — a scatter of
 * pairs, a graph — which ECharts' own description still reads out. A series with no data
 * has no column; past the bounds, the table is `cut`.
 */
export function tableOf(option: EChartsOption): ChartTable | null {
    const dataset = list(option['dataset'])[0];
    const source = isObject(dataset) ? dataset['source'] : undefined;
    if (isObject(dataset) && Array.isArray(source) && source.length > 0) {
        const named = Array.isArray(dataset['dimensions'])
            ? dataset['dimensions'].map((d) => (isObject(d) ? cell(d['name']) : cell(d)))
            : undefined;
        if (Array.isArray(source[0])) {
            const skip = headerRows(dataset, source[0]);
            const rows = source.slice(skip);
            const head = named ?? (skip > 0 ? source[0].map(cell) : []);
            const width = Math.max(head.length, ...rows.slice(0, MAX_ROWS).map((r) => list(r).length));
            return grid(width, rows.length, (c) => head[c] ?? '', (r, c) => cell(list(rows[r])[c]));
        }
        if (isObject(source[0])) {
            const dims = named ?? Object.keys(source[0]);
            return grid(dims.length, source.length, (c) => dims[c]!, (r, c) => {
                const row = source[r];
                return cell(isObject(row) ? row[dims[c]!] : undefined);
            });
        }
    }
    // Each series with its rank among all of them, which an unnamed one is called by.
    const series = list(option['series'])
        .map((s, i) => ({ s, i }))
        .filter((e): e is { s: Record<string, unknown>; i: number } => isObject(e.s) && Array.isArray(e.s['data']) && e.s['data'].length > 0);
    if (series.length === 0) return null;
    const axis = [...list(option['xAxis']), ...list(option['yAxis'])]
        .find((a): a is Record<string, unknown> => isObject(a) && Array.isArray(a['data']));
    const name = ({ s, i }: { s: Record<string, unknown>; i: number }): string => cell(s['name']) || `${i + 1}`;
    const dataOf = (c: number): unknown[] => series[c]!.s['data'] as unknown[];
    if (axis) {
        const categories = axis['data'] as unknown[];
        return grid(series.length + 1, categories.length,
            (c) => (c === 0 ? cell(axis['name']) : name(series[c - 1]!)),
            (r, c) => cell(c === 0 ? categories[r] : dataOf(c - 1)[r]));
    }
    const named = series.find(({ s }) => (s['data'] as unknown[]).some((d) => isObject(d) && 'name' in d));
    if (named) {
        const data = named.s['data'] as unknown[];
        return grid(2, data.length, (c) => (c === 0 ? '' : name(named)), (r, c) => {
            const d = data[r];
            return c === 0 ? cell(isObject(d) ? d['name'] : '') : cell(d);
        });
    }
    return null;
}
