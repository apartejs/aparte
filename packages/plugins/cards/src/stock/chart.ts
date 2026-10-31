/**
 * The stock card's charts: a price line, and candlesticks.
 *
 * **The line**: an area under the series, split at a baseline into the part above it (the
 * "up" colour) and the part below (the "down" colour), the last point marked, the high and
 * the low written where they happen. Why two clip paths rather than two areas: an area cut
 * at the baseline needs the exact crossing points of every segment that crosses it, which
 * is arithmetic per segment and a polygon per run. Clipping the SAME path twice, once to
 * the band above the baseline and once to the band below, splits it exactly where the line
 * crosses, for any series, with two rectangles. The strokes are split the same way, so the
 * line changes colour at the crossing too.
 *
 * **The candles**: a body from the open to the close, a wick from the low to the high, the
 * volume as faint bars along the bottom. A rising candle is HOLLOW and a falling one FILLED
 * (the classic convention), and that is a choice for the reader, not for the look: a filled
 * body alone does not say which end is the open, so its colour would be the only telling.
 * Hollow-or-filled says it without colour. Every body of a kind is one path, every wick of
 * a kind another: eighty candles are a handful of nodes, not four hundred.
 *
 * Both are SVG built with `createElementNS` from numbers only, so a tool's values never
 * reach a parser, stretched to the card's width (`preserveAspectRatio="none"`, the strokes
 * kept at their width by `vector-effect`). That would squash anything round, so the dot,
 * the dashed baseline, the cursor and the labels are HTML laid over the SVG, placed in
 * percent of the same box.
 *
 * Time runs left to right in every script, as it does on the market's own charts: the
 * plot is `dir="ltr"`, the text around it follows the page.
 */
import type { CardContext } from '../kit/define.js';
import { el } from '../kit/dom.js';
import { word, type CardWord } from '../kit/strings.js';

/** What the plot is called where a screen reader would say "application". */
const CHART_ROLE: CardWord = { en: 'chart', fr: 'graphique', de: 'Diagramm', es: 'gráfico', it: 'grafico', ja: 'チャート', ko: '차트', pt: 'gráfico', ru: 'график', zh: '图表' };

const SVG = 'http://www.w3.org/2000/svg';

/** One point of a series: its value, and when it was, when the tool said. */
export interface ChartPoint {
    value: number;
    time?: Date;
}

/** One candle: a stretch of time's first, highest, lowest and last price. */
export interface Candle {
    time?: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface ChartGeometry {
    /** The line, in a 100 × 100 box. */
    line: string;
    /** The area between the line and the baseline. */
    area: string;
    points: Array<[number, number]>;
    /** The baseline's height in the box. */
    baseY: number;
    /** Where the highest and the lowest values are (their first occurrence). */
    hi: number;
    lo: number;
}

/** Room above the highest point and under the lowest, as a share of the height: the labels sit there. */
const PAD = 0.2;

/**
 * The chart's shape for `values` against `baseline`, or `null` under two points. The
 * baseline is inside the scale, so it is always on the chart; a series that does not
 * move is a flat line through the middle.
 */
export function chartGeometry(values: number[], baseline: number): ChartGeometry | null {
    if (values.length < 2) return null;
    let hi = 0;
    let lo = 0;
    values.forEach((v, i) => {
        if (v > values[hi]!) hi = i;
        if (v < values[lo]!) lo = i;
    });
    const top = Math.max(values[hi]!, baseline);
    const bottom = Math.min(values[lo]!, baseline);
    const span = top - bottom;
    const y = (v: number) => (span === 0 ? 50 : 100 - (PAD * 100 + ((v - bottom) / span) * (100 - 2 * PAD * 100)));
    const step = 100 / (values.length - 1);
    const points = values.map((v, i): [number, number] => [i * step, y(v)]);
    const at = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
    const line = `M${points.map(at).join(' L')}`;
    const baseY = y(baseline);
    const area = `${line} L100 ${baseY.toFixed(2)} L0 ${baseY.toFixed(2)} Z`;
    return { line, area, points, baseY, hi, lo };
}

/**
 * At most `max` points, keeping each stretch's lowest and highest: a day of minutes
 * (390 points) or a year of hours is more than a card's width can show, and a plain
 * stride would drop the very high and low the labels name. The first and the last
 * point always stay.
 */
export function thin<T extends ChartPoint>(points: T[], max = 240): T[] {
    if (points.length <= max) return points;
    const buckets = Math.max(1, Math.floor(max / 2) - 1);
    const size = points.length / buckets;
    const out: T[] = [points[0]!];
    for (let b = 0; b < buckets; b++) {
        const slice = points.slice(Math.floor(b * size), Math.floor((b + 1) * size));
        if (!slice.length) continue;
        let low = slice[0]!;
        let high = slice[0]!;
        for (const p of slice) {
            if (p.value < low.value) low = p;
            if (p.value > high.value) high = p;
        }
        for (const p of slice.indexOf(low) <= slice.indexOf(high) ? [low, high] : [high, low]) {
            if (out[out.length - 1] !== p) out.push(p);
        }
    }
    const last = points[points.length - 1]!;
    if (out[out.length - 1] !== last) out.push(last);
    return out;
}

/**
 * At most `max` candles, by merging neighbours into wider ones — the way a chart moves
 * from hourly to daily candles — rather than dropping any: a merged candle opens with the
 * first, closes with the last, and keeps the highest high, the lowest low and the summed
 * volume, so nothing that happened leaves the chart. Its time is the first one's.
 */
export function groupCandles(candles: Candle[], max = 80): Candle[] {
    if (candles.length <= max) return candles;
    const size = Math.ceil(candles.length / max);
    const out: Candle[] = [];
    for (let i = 0; i < candles.length; i += size) {
        const group = candles.slice(i, i + size);
        const first = group[0]!;
        const volumes = group.map((c) => c.volume).filter((v): v is number => v !== undefined);
        out.push({
            ...(first.time ? { time: first.time } : {}),
            open: first.open,
            close: group[group.length - 1]!.close,
            high: Math.max(...group.map((c) => c.high)),
            low: Math.min(...group.map((c) => c.low)),
            ...(volumes.length ? { volume: volumes.reduce((a, b) => a + b, 0) } : {}),
        });
    }
    return out;
}

/** One candle's place in the 100 × 100 box. */
export interface CandleShape {
    /** The centre of its slot, and its body's width. */
    x: number;
    width: number;
    /** The body's top and bottom, the wick's ends, the close. */
    top: number;
    bottom: number;
    high: number;
    low: number;
    close: number;
    direction: 'up' | 'down' | 'flat';
    /** Its volume bar's height, from the bottom of the box. */
    volume: number;
}

export interface CandleGeometry {
    shapes: CandleShape[];
    /** The candles with the highest high and the lowest low. */
    hi: number;
    lo: number;
    /** Whether a volume band is drawn along the bottom. */
    volume: boolean;
}

/** The band the volume bars take at the bottom, when there are any. */
const VOLUME_BAND = 16;

/**
 * The candles' shapes, or `null` with none. The prices take the box above the volume
 * band, with the same room above and below as the line for the labels.
 */
export function candleGeometry(candles: Candle[]): CandleGeometry | null {
    if (candles.length === 0) return null;
    let hi = 0;
    let lo = 0;
    candles.forEach((c, i) => {
        if (c.high > candles[hi]!.high) hi = i;
        if (c.low < candles[lo]!.low) lo = i;
    });
    const maxVolume = Math.max(0, ...candles.map((c) => c.volume ?? 0));
    const floor = maxVolume > 0 ? 100 - VOLUME_BAND : 100;
    const pad = PAD * 80;
    const top = candles[hi]!.high;
    const bottom = candles[lo]!.low;
    const span = top - bottom;
    const y = (v: number) => (span === 0 ? floor / 2 : floor - pad - ((v - bottom) / span) * (floor - 2 * pad));
    const slot = 100 / candles.length;
    const shapes = candles.map((c, i): CandleShape => {
        const open = y(c.open);
        const close = y(c.close);
        return {
            x: (i + 0.5) * slot,
            width: slot * 0.62,
            top: Math.min(open, close),
            bottom: Math.max(open, close),
            high: y(c.high),
            low: y(c.low),
            close,
            direction: c.close > c.open ? 'up' : c.close < c.open ? 'down' : 'flat',
            volume: maxVolume > 0 ? ((c.volume ?? 0) / maxVolume) * (VOLUME_BAND - 2) : 0,
        };
    });
    return { shapes, hi, lo, volume: maxVolume > 0 };
}

let serial = 0;

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    return node;
}

function stretchedSvg(): SVGSVGElement {
    const svg = svgNode('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    svg.setAttribute('class', 'aparte-stock__svg');
    return svg;
}

/** A spot laid over the plot at a point, in percent of its box. */
function place(node: HTMLElement, x: number, y: number): void {
    node.style.setProperty('--aparte-stock-x', `${x.toFixed(2)}%`);
    node.style.setProperty('--aparte-stock-y', `${y.toFixed(2)}%`);
}

/** Where a label sits against its point, so one at an edge stays inside the card. */
const alignOf = (x: number) => (x < 14 ? 'start' : x > 86 ? 'end' : 'center');

/** The high or the low, written where it happened. */
function extreme(ctx: CardContext, kind: 'hi' | 'lo', x: number, y: number, text: () => string): HTMLElement {
    const label = el('span', { class: `aparte-stock__extreme aparte-stock__extreme--${kind}`, attrs: { 'aria-hidden': 'true', 'data-align': alignOf(x) } });
    place(label, x, y);
    ctx.bind(label, text);
    return label;
}

/** What a chart's frame needs from its drawing. */
interface FrameOptions {
    kind: 'line' | 'candles';
    svg: SVGSVGElement;
    /** Laid over the SVG, under the cursor. */
    under: Array<HTMLElement | null>;
    /** Laid over the cursor (the last point's dot). */
    over?: HTMLElement[];
    count: number;
    /** The point a share of the width falls on. */
    indexAt(ratio: number): number;
    /** Where the cursor sits on point `i`. */
    at(i: number): [number, number];
    /** What point `i` reads as: shown in the line, and said in full. */
    readout(i: number): { shown: string; spoken: string };
    label(): string;
    info?: Node[];
}

/**
 * A chart's frame: the plot, then a line under it with the range and the legend. Hovering,
 * touching or arrowing through the focused plot puts a cursor on a point and writes it in
 * that line, which is a polite live region — the short form shown, the full one said.
 */
function frame(ctx: CardContext, options: FrameOptions): HTMLElement {
    const cursor = el('span', { class: 'aparte-stock__cursor', attrs: { 'aria-hidden': 'true' } });
    const cursorDot = el('span', { class: 'aparte-stock__cursor-dot', attrs: { 'aria-hidden': 'true' } });
    // Not `img`: an image takes no keys, so a screen reader in browse mode keeps the arrows
    // for itself and the cursor never moves. Not `slider` either: its value would be a point's
    // index, and the readout below already says each point. `application` is the role whose
    // contract is "the keys are this element's" — safe here because everything inside is
    // `aria-hidden` (there is nothing to browse), and named a "chart" so that is what is said.
    const plot = el('div', { class: 'aparte-stock__plot', attrs: { tabindex: 0, role: 'application', dir: 'ltr', 'data-kind': options.kind } },
        options.svg, ...options.under, cursor, cursorDot, ...(options.over ?? []));
    ctx.bind(plot, options.label, 'aria-label');
    ctx.bind(plot, () => word(ctx.config, 'cardsStockChartRole', CHART_ROLE), 'aria-roledescription');

    const shown = el('span', { class: 'aparte-stock__readout-shown', attrs: { 'aria-hidden': 'true' } });
    const spoken = el('span', { class: 'aparte-sr-only' });
    const readout = el('span', { class: 'aparte-stock__readout', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } }, shown, spoken);
    const info = el('div', { class: 'aparte-stock__chart-info' }, ...(options.info ?? []));
    const root = el('div', { class: 'aparte-stock__chart' }, plot, el('div', { class: 'aparte-stock__chart-foot' }, readout, info));

    const last = options.count - 1;
    let current = -1;
    // A cursor put there by the keyboard stays when the mouse wanders off; one put there
    // by the mouse goes with it, even though the click focused the plot.
    let byKeyboard = false;
    function show(index: number): void {
        current = Math.max(0, Math.min(last, index));
        const [x, y] = options.at(current);
        place(cursor, x, y);
        place(cursorDot, x, y);
        root.setAttribute('data-scrub', '');
        const text = options.readout(current);
        shown.textContent = text.shown;
        spoken.textContent = text.spoken;
    }
    function hide(): void {
        current = -1;
        root.removeAttribute('data-scrub');
        shown.textContent = '';
        spoken.textContent = '';
    }
    const fromPointer = (event: PointerEvent) => {
        const box = plot.getBoundingClientRect();
        if (!box.width) return;
        show(options.indexAt(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))));
    };
    plot.addEventListener('pointermove', fromPointer);
    plot.addEventListener('pointerdown', (event) => {
        byKeyboard = false;
        fromPointer(event);
    });
    // A touch the browser takes over to scroll the page (`touch-action: pan-y`) is cancelled.
    plot.addEventListener('pointerleave', () => { if (!byKeyboard || document.activeElement !== plot) hide(); });
    plot.addEventListener('pointercancel', hide);
    plot.addEventListener('focus', () => {
        if (current >= 0) return;
        byKeyboard = true;
        show(last);
    });
    plot.addEventListener('blur', hide);
    plot.addEventListener('keydown', (event) => {
        const page = Math.max(1, Math.round(options.count / 10));
        const from = current < 0 ? last : current;
        const moves: Record<string, number> = {
            ArrowLeft: from - (event.shiftKey ? page : 1),
            ArrowRight: from + (event.shiftKey ? page : 1),
            PageUp: from - page,
            PageDown: from + page,
            Home: 0,
            End: last,
        };
        if (event.key === 'Escape') {
            hide();
            return;
        }
        const to = moves[event.key];
        if (to === undefined) return;
        event.preventDefault();
        byKeyboard = true;
        show(to);
    });
    return root;
}

export interface PriceChartOptions {
    points: ChartPoint[];
    /** The value the chart is split at: the previous close, or where the series started. */
    baseline: number;
    /** A value as text, in the quote's currency and precision. */
    value(v: number): string;
    /** A point's time as text. */
    time(d: Date): string;
    /** The plot's accessible name: what the chart shows, in a sentence. */
    label(): string;
    /** The market is open: the last point pulses. */
    live?: boolean;
    /** What sits under the plot (the range, the baseline's legend); the readout takes its place while the chart is explored. */
    info?: Node[];
}

/** The line chart, or `null` under two points. */
export function priceChart(ctx: CardContext, options: PriceChartOptions): HTMLElement | null {
    const shown = thin(options.points);
    const geometry = chartGeometry(shown.map((p) => p.value), options.baseline);
    if (!geometry) return null;
    const { points, baseY } = geometry;

    const id = `aparte-stock-${++serial}`;
    const svg = stretchedSvg();
    const band = (name: string, y: number, height: number) => {
        const clip = svgNode('clipPath', { id: `${id}-${name}`, clipPathUnits: 'userSpaceOnUse' });
        clip.append(svgNode('rect', { x: -5, y: y.toFixed(2), width: 110, height: Math.max(0, height).toFixed(2) }));
        return clip;
    };
    // The fill fades towards the baseline in both directions: strongest at the line.
    const gradient = (name: 'up' | 'down', from: number, to: number) => {
        const g = svgNode('linearGradient', { id: `${id}-fill-${name}`, gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: from.toFixed(2), y2: to.toFixed(2) });
        const stop = (offset: number, opacity: number) => {
            const s = svgNode('stop', { offset, 'stop-opacity': opacity });
            s.setAttribute('class', name === 'up' ? 'aparte-stock__stop aparte-stock__stop--up' : 'aparte-stock__stop aparte-stock__stop--down');
            return s;
        };
        g.append(stop(0, name === 'up' ? 0.3 : 0.02), stop(1, name === 'up' ? 0.02 : 0.3));
        return g;
    };
    const defs = svgNode('defs', {});
    defs.append(
        band('up', -10, baseY + 10),
        band('down', baseY, 110 - baseY),
        gradient('up', Math.min(...points.map((p) => p[1])), baseY),
        gradient('down', baseY, Math.max(...points.map((p) => p[1]))),
    );
    const area = (name: 'up' | 'down') => {
        const path = svgNode('path', { d: geometry.area, fill: `url(#${id}-fill-${name})`, 'clip-path': `url(#${id}-${name})` });
        path.setAttribute('class', name === 'up' ? 'aparte-stock__area aparte-stock__area--up' : 'aparte-stock__area aparte-stock__area--down');
        return path;
    };
    const stroke = (name: 'up' | 'down') => {
        const path = svgNode('path', { d: geometry.line, 'clip-path': `url(#${id}-${name})`, 'vector-effect': 'non-scaling-stroke' });
        path.setAttribute('class', name === 'up' ? 'aparte-stock__line aparte-stock__line--up' : 'aparte-stock__line aparte-stock__line--down');
        return path;
    };
    svg.append(defs, area('up'), area('down'), stroke('up'), stroke('down'));

    const baseline = el('span', { class: 'aparte-stock__baseline', attrs: { 'aria-hidden': 'true' } });
    place(baseline, 0, baseY);
    // The dot takes the colour of the side of the baseline it ends on — over a year that
    // can be the other way from the day's change, which the pill above says.
    const end = shown[shown.length - 1]!.value;
    const side = end > options.baseline ? 'up' : end < options.baseline ? 'down' : 'flat';
    const dot = el('span', { class: 'aparte-stock__dot', attrs: { 'aria-hidden': 'true', 'data-live': options.live === true, 'data-direction': side } });
    const lastPoint = points[points.length - 1]!;
    place(dot, lastPoint[0], lastPoint[1]);
    // The high and the low are not both written when the series does not move.
    const flat = shown[geometry.hi]!.value === shown[geometry.lo]!.value;
    const mark = (kind: 'hi' | 'lo', i: number) => extreme(ctx, kind, points[i]![0], points[i]![1], () => options.value(shown[i]!.value));

    return frame(ctx, {
        kind: 'line',
        svg,
        under: [baseline, flat ? null : mark('hi', geometry.hi), flat ? null : mark('lo', geometry.lo)],
        over: [dot],
        count: points.length,
        indexAt: (ratio) => Math.round(ratio * (points.length - 1)),
        at: (i) => points[i]!,
        readout: (i) => {
            const p = shown[i]!;
            const text = p.time ? `${options.value(p.value)} · ${options.time(p.time)}` : options.value(p.value);
            return { shown: text, spoken: text };
        },
        label: options.label,
        info: options.info ?? [],
    });
}

export interface CandleChartOptions {
    candles: Candle[];
    value(v: number): string;
    time(d: Date): string;
    /** A candle under the cursor: the short line shown ("O 1 H 2 L 0 C 1"), and the sentence said. */
    ohlc(c: Candle): { shown: string; spoken: string };
    label(): string;
    info?: Node[];
}

/** The candlestick chart, or `null` without a candle. */
export function candleChart(ctx: CardContext, options: CandleChartOptions): HTMLElement | null {
    const candles = groupCandles(options.candles);
    const geometry = candleGeometry(candles);
    if (!geometry) return null;
    const { shapes } = geometry;

    const svg = stretchedSvg();
    const paths: Record<string, string> = {};
    const add = (key: string, d: string) => { paths[key] = (paths[key] ?? '') + d; };
    const n = (v: number) => v.toFixed(2);
    for (const s of shapes) {
        const x0 = s.x - s.width / 2;
        const x1 = s.x + s.width / 2;
        // A body that did not move still shows, as a line about a pixel high.
        const bottom = Math.max(s.bottom, s.top + 0.8);
        add(`body-${s.direction}`, `M${n(x0)} ${n(s.top)}H${n(x1)}V${n(bottom)}H${n(x0)}Z`);
        // The wick stops at the body: a hollow candle stays hollow.
        add(`wick-${s.direction}`, `M${n(s.x)} ${n(s.high)}V${n(s.top)}M${n(s.x)} ${n(bottom)}V${n(s.low)}`);
        if (s.volume > 0) add(`volume-${s.direction}`, `M${n(x0)} 100H${n(x1)}V${n(100 - s.volume)}H${n(x0)}Z`);
    }
    for (const kind of ['volume', 'wick', 'body'] as const) {
        for (const direction of ['up', 'down', 'flat'] as const) {
            const d = paths[`${kind}-${direction}`];
            if (!d) continue;
            const path = svgNode('path', { d, 'vector-effect': 'non-scaling-stroke' });
            const name = `aparte-stock__${kind}`;
            path.setAttribute('class', [name, `${name}--${direction}`].join(' '));
            svg.append(path);
        }
    }
    const flat = candles[geometry.hi]!.high === candles[geometry.lo]!.low;
    const hi = shapes[geometry.hi]!;
    const lo = shapes[geometry.lo]!;
    return frame(ctx, {
        kind: 'candles',
        svg,
        under: [
            flat ? null : extreme(ctx, 'hi', hi.x, hi.high, () => options.value(candles[geometry.hi]!.high)),
            flat ? null : extreme(ctx, 'lo', lo.x, lo.low, () => options.value(candles[geometry.lo]!.low)),
        ],
        count: shapes.length,
        indexAt: (ratio) => Math.min(shapes.length - 1, Math.floor(ratio * shapes.length)),
        at: (i) => [shapes[i]!.x, shapes[i]!.close],
        readout: (i) => {
            const c = candles[i]!;
            const text = options.ohlc(c);
            const when = c.time ? ` · ${options.time(c.time)}` : '';
            return { shown: `${text.shown}${when}`, spoken: `${text.spoken}${when}` };
        },
        label: options.label,
        info: options.info ?? [],
    });
}
