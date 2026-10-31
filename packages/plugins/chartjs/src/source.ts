/**
 * Reading a Chart.js config out of what a model wrote or a tool returned: untrusted
 * JSON, kept as data and cut down to what a chart needs to be drawn harmlessly.
 */
import { escapeAttr, escapeHtml } from '@aparte/core';

/** A Chart.js config as JSON can carry it: `{ type, data, options }`. */
export interface ChartjsConfig {
    type: string;
    data: { labels?: unknown[]; datasets: Array<Record<string, unknown>>; [key: string]: unknown };
    options?: Record<string, unknown>;
    [key: string]: unknown;
}

/** The most data points a chart may carry, all datasets together — and the most labels, and datasets. */
export const MAX_POINTS = 5000;
/** The most ticks a scale may ask for: Chart.js builds one object per tick it is told to make. */
const MAX_TICKS = 100;
/** The most dataset columns the hidden table lists. */
const MAX_COLUMNS = 50;
/** The most cells in the hidden table's body, row names included, whatever the labels and datasets. */
const MAX_CELLS = 10_000;
/**
 * The positions Chart.js' tooltip knows. Any other name is looked up and CALLED on every
 * hover (`positioners[name].call(…)`), and throws.
 */
const TOOLTIP_POSITIONS = new Set(['average', 'nearest']);
/** Deeper than any real config; a bound so a hostile one cannot exhaust the stack. */
const MAX_DEPTH = 32;
/**
 * Keys never copied. The first three are what a merge could follow to a prototype;
 * the others are what Chart.js CALLS on a value it takes for an object of its own (a
 * `pointStyle` object is drawn as an image when `toString()` names one), so a JSON
 * object carrying them as strings would make it throw on every frame.
 */
const DROPPED_KEYS = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'toJSON']);

/**
 * A plain copy of `value`: objects, arrays, strings, finite numbers, booleans and
 * `null` only, without the dropped keys. `undefined` when it is too deep to be a config.
 *
 * Inside an `animation` or `animations` object, `loop` goes too: a looping animation plays
 * as long as the chart is on the page, motion no reader asked for and a frame drawn every
 * 16 ms for nothing.
 */
function plain(value: unknown, depth = 0, animating = false): unknown {
    if (depth > MAX_DEPTH) throw new RangeError('too deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((item) => plain(item, depth + 1, animating));
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (DROPPED_KEYS.has(key) || (animating && key === 'loop')) continue;
            const copy = plain(item, depth + 1, animating || key === 'animation' || key === 'animations');
            if (copy !== undefined) out[key] = copy;
        }
        return out;
    }
    return undefined;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** `parent[key]` when it is an object. */
const child = (parent: unknown, key: string): Record<string, unknown> | undefined => {
    const value = isObject(parent) ? parent[key] : undefined;
    return isObject(value) ? value : undefined;
};

/** Delete `keys` from `target`: options Chart.js calls as functions, which JSON never carries. */
function dropCalls(target: Record<string, unknown> | undefined, keys: string[]): void {
    if (target) for (const key of keys) delete target[key];
}

/** Whether `Intl` takes `tag`: Chart.js formats every tick with it, and a bad one throws. */
function isLocale(tag: unknown): boolean {
    if (typeof tag !== 'string') return false;
    try { return Intl.NumberFormat.supportedLocalesOf(tag).length > 0; } catch { return false; }
}

/**
 * The config in `value`, copied and made harmless, or `null` when it is not one Chart.js
 * could draw: a `type`, and `data.datasets` as a list of objects whose `data` are lists.
 *
 * What is taken out, and why — Chart.js draws everything on the canvas, so no string in
 * a config becomes HTML, and JSON carries no function, so no callback can arrive:
 * - the config's own `plugins` list. Chart.js runs each entry's hooks; from JSON an entry
 *   is an object with no function in it, so it can do nothing — and a list that can do
 *   nothing is better not handed over at all. Options for the plugins the app REGISTERED
 *   (`options.plugins.legend`, `.title`, `.tooltip`…) stay; Chart.js ignores the rest;
 * - `options.devicePixelRatio`: it multiplies the canvas' pixels, and a large one asks the
 *   browser for a canvas bigger than any it will allocate;
 * - `options.locale` when `Intl` refuses it, which would throw on the first tick;
 * - a string where Chart.js CALLS a function, on every hover: the tooltip's `external`,
 *   `filter`, `itemSort` and `callbacks`, the legend labels' `generateLabels`, `filter` and
 *   `sort` — and a tooltip `position` that is not one of Chart.js' own;
 * - `loop` in any animation (see `plain`).
 * `options.aspectRatio` is held to 1:4–4:1 for the same reason as the pixel ratio: a tiny
 * one makes the canvas millions of pixels tall. A scale's `ticks.count` and
 * `ticks.maxTicksLimit` are held to 100: Chart.js makes as many ticks as `count` says, and
 * a hundred million of them is a tab out of memory. `maxPoints` bounds the labels and the
 * datasets as well as the points: each is a row or a column of work.
 */
export function readChartConfig(value: unknown, maxPoints = MAX_POINTS): ChartjsConfig | null {
    let copy: unknown;
    try { copy = plain(value); } catch { return null; }
    if (!isObject(copy) || typeof copy['type'] !== 'string' || !/^[A-Za-z][\w-]*$/.test(copy['type'])) return null;
    const data = copy['data'];
    if (!isObject(data) || !Array.isArray(data['datasets'])) return null;
    const datasets = data['datasets'] as unknown[];
    if (!datasets.every((d) => isObject(d) && Array.isArray(d['data']))) return null;
    if (data['labels'] !== undefined && !Array.isArray(data['labels'])) return null;
    const points = datasets.reduce<number>((sum, d) => sum + ((d as Record<string, unknown[]>)['data']!).length, 0);
    const labels = Array.isArray(data['labels']) ? data['labels'].length : 0;
    if (points > maxPoints || labels > maxPoints || datasets.length > maxPoints) return null;

    delete copy['plugins'];
    if (copy['options'] !== undefined && !isObject(copy['options'])) delete copy['options'];
    const options = copy['options'] as Record<string, unknown> | undefined;
    if (options) {
        delete options['devicePixelRatio'];
        if (options['locale'] !== undefined && !isLocale(options['locale'])) delete options['locale'];
        const ratio = options['aspectRatio'];
        if (ratio !== undefined) {
            if (typeof ratio !== 'number' || ratio <= 0) delete options['aspectRatio'];
            else options['aspectRatio'] = Math.min(4, Math.max(0.25, ratio));
        }
        const scales = child(options, 'scales');
        for (const id of scales ? Object.keys(scales) : []) {
            const ticks = child(scales![id], 'ticks');
            if (!ticks) continue;
            for (const key of ['count', 'maxTicksLimit']) {
                const n = ticks[key];
                if (n === undefined) continue;
                if (typeof n !== 'number' || n < 1) delete ticks[key];
                else ticks[key] = Math.min(MAX_TICKS, Math.floor(n));
            }
        }
        const plugins = child(options, 'plugins');
        const tooltip = child(plugins, 'tooltip');
        dropCalls(tooltip, ['external', 'filter', 'itemSort', 'callbacks']);
        if (tooltip && tooltip['position'] !== undefined && !TOOLTIP_POSITIONS.has(tooltip['position'] as string)) delete tooltip['position'];
        dropCalls(child(child(plugins, 'legend'), 'labels'), ['generateLabels', 'filter', 'sort']);
    }
    return copy as unknown as ChartjsConfig;
}

/** Whether a config has a point to draw: a chart still arriving shows nothing until it does. */
export function hasPoints(config: ChartjsConfig): boolean {
    return config.data.datasets.some((d) => (d['data'] as unknown[]).length > 0);
}

/**
 * The longest prefix of a JSON text still being written that is a whole value once its
 * open brackets are closed, closed — or `null` when there is none yet.
 *
 * A Chart.js config is one object, so it parses only once its last brace has arrived:
 * without this, a chart streams as a blank box and appears at the end. The cut points are
 * where a value has just ended — before a comma, after a closing bracket — or a container
 * has just opened, so a half-written string, number or key is never part of the result
 * (`[1, 2` gives `[1]`: the `2` may be the start of `25`).
 */
export function closeJson(text: string): string | null {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let cut = -1;
    let closers = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (inString) {
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === '{' || c === '[') {
            stack.push(c === '{' ? '}' : ']');
            cut = i + 1;
            closers = stack.slice().reverse().join('');
        } else if (c === '}' || c === ']') {
            if (stack.pop() !== c) return null;
            cut = i + 1;
            closers = stack.slice().reverse().join('');
            if (stack.length === 0) return text.slice(0, cut);
        } else if (c === ',') {
            cut = i;
            closers = stack.slice().reverse().join('');
        }
    }
    return cut < 0 ? null : text.slice(0, cut) + closers;
}

/** The config a fence holds: all of it once closed, its closed prefix while it arrives. */
export function parseFence(source: string, open: boolean, maxPoints = MAX_POINTS): ChartjsConfig | null {
    const text = open ? closeJson(source) : source;
    if (text === null) return null;
    try { return readChartConfig(JSON.parse(text), maxPoints); } catch { return null; }
}

/** The title a config gives itself (`options.plugins.title.text`), as one line. */
export function titleOf(config: ChartjsConfig): string | undefined {
    const title = ((config.options?.['plugins'] as Record<string, unknown> | undefined)?.['title'] as Record<string, unknown> | undefined)?.['text'];
    const text = Array.isArray(title) ? title.filter((t) => typeof t === 'string').join(' ') : typeof title === 'string' ? title : '';
    return text.trim() || undefined;
}

/** One value of a dataset as text: a number, or the `y` of a point (with its `r` for a bubble). */
function cell(value: unknown, format: (n: number) => string): string {
    if (typeof value === 'number') return format(value);
    if (typeof value === 'string') return value;
    if (isObject(value)) {
        const y = value['y'];
        const shown = typeof y === 'number' ? format(y) : typeof y === 'string' ? y : '';
        return typeof value['r'] === 'number' ? `${shown} (${format(value['r'])})` : shown;
    }
    return '';
}

/** The name of a row: its label, else the `x` of its first point among `datasets`, else its rank. */
function rowName(config: ChartjsConfig, datasets: Array<Record<string, unknown>>, index: number, format: (n: number) => string): string {
    const label = config.data.labels?.[index];
    if (typeof label === 'string' || typeof label === 'number') return String(label);
    if (Array.isArray(label)) return label.join(' ');
    for (const dataset of datasets) {
        const point = (dataset['data'] as unknown[])[index];
        if (isObject(point) && (typeof point['x'] === 'number' || typeof point['x'] === 'string')) {
            return typeof point['x'] === 'number' ? format(point['x']) : point['x'];
        }
    }
    return String(index + 1);
}

/**
 * The data as a table, for a screen reader: one row per label, one column per dataset with
 * data. Every value is escaped; a dataset with no label has an empty header that `relabel`
 * fills with "Series n" in the chat's language, as it fills the caption. Held to
 * `MAX_COLUMNS` columns and `MAX_CELLS` cells — a few bytes of empty datasets beside many
 * labels would otherwise be millions of cells — with a last line, filled by `relabel`, when
 * it lists only part of the data.
 */
export function dataTable(config: ChartjsConfig, locale?: string): string {
    let formatter: Intl.NumberFormat;
    try { formatter = new Intl.NumberFormat(locale); } catch { formatter = new Intl.NumberFormat(); }
    const format = (n: number): string => formatter.format(n);
    // Each dataset with data, and its rank among all of them, which an unlabelled one is called by.
    const all = config.data.datasets
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => (d['data'] as unknown[]).length > 0);
    const datasets = all.slice(0, MAX_COLUMNS);
    const withData = all.map(({ d }) => d);
    const height = Math.max(config.data.labels?.length ?? 0, ...datasets.map(({ d }) => (d['data'] as unknown[]).length));
    const rows = Math.min(height, Math.floor(MAX_CELLS / (datasets.length + 1)));
    const head = datasets.map(({ d, i }) => {
        const label = typeof d['label'] === 'string' && d['label'].trim() ? d['label'] : '';
        return label
            ? `<th scope="col">${escapeHtml(label)}</th>`
            : `<th scope="col" data-aparte-chartjs-series="${escapeAttr(String(i + 1))}"></th>`;
    }).join('');
    const body: string[] = [];
    for (let r = 0; r < rows; r++) {
        const cells = datasets.map(({ d }) => `<td>${escapeHtml(cell((d['data'] as unknown[])[r], format))}</td>`).join('');
        body.push(`<tr><th scope="row">${escapeHtml(rowName(config, withData, r, format))}</th>${cells}</tr>`); // safe-text: cells are built above, every value through escapeHtml
    }
    const cut = datasets.length < all.length || rows < height
        ? `<tfoot><tr><td colspan="${datasets.length + 1}" data-aparte-chartjs-cut></td></tr></tfoot>` // safe-attr: a count, computed here
        : '';
    return `<table><caption data-aparte-chartjs-name></caption><thead><tr><td></td>${head}</tr></thead>${cut}<tbody>${body.join('')}</tbody></table>`; // safe-text: head and rows are built above, every value through escapeHtml
}
