import {
    aparteGlobalConfig,
    escapeAttr,
    type AparteConfig,
    type AparteCodeLanguageContext,
    type AparteToolCallSegment,
    type AparteToolMatcher,
    type AparteToolRenderer,
} from '@aparte/core';
import { drawable, parseOption, sanitizeEChartsOption, tableOf, titleOf, type EChartsOption } from './option.js';
import { echartsTheme, readTokens } from './theme.js';
import { languageOf, word, type WordKey } from './strings.js';

export { sanitizeEChartsOption, type EChartsOption } from './option.js';
export { echartsTheme, echartsPalette, ECHARTS_SERIES_HUES, type EChartsTokens } from './theme.js';

/** The part of a chart ECharts hands back from `init` that this plugin calls. */
export interface EChartsInstanceLike {
    setOption(option: Record<string, unknown>, opts?: { notMerge?: boolean }): void;
    setTheme(theme: Record<string, unknown>): void;
    resize(): void;
    dispose(): void;
}

/**
 * The part of ECharts this plugin calls. Structural, so this module imports nothing from
 * `echarts` — a bundle that hands over its own build (`echarts/core` with the charts it
 * uses) carries one copy.
 */
export interface EChartsLike {
    init(dom: HTMLElement, theme?: Record<string, unknown> | string | null, opts?: { renderer?: 'svg' | 'canvas'; locale?: string }): EChartsInstanceLike;
}

export interface EChartsOptions {
    /**
     * Redraw a chart while its fence arrives, from the part of its JSON that has arrived
     * (default `true`). `false` draws it once the fence has closed.
     */
    progressive?: boolean;
    /** The chart's height: pixels, or a CSS length (`'18rem'`, the default). It fills the width, up to 40rem. */
    height?: number | string;
    /**
     * ECharts' renderer (default `'svg'`): crisp at any zoom, sized by the page like any
     * element, and its text is real text. `'canvas'` for a chart with tens of thousands of
     * points, where an SVG node per mark costs more than a bitmap.
     */
    renderer?: 'svg' | 'canvas';
    /**
     * The tool (or tools) whose result IS an ECharts option: it is drawn as the chart in
     * place of the tool's row. Its `structuredContent` when it has one, else its text read
     * as JSON — or what `map` makes of it.
     */
    tool?: AparteToolMatcher | AparteToolMatcher[];
    /**
     * Turn a tool's own result (and the arguments it was called with) into an ECharts option.
     * The result is `any`, as in `@aparte/plugin-cards`: its shape is your tool's, and `map` is
     * where you read it.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map?: (result: any, input: Record<string, unknown>) => unknown;
}

/** The fence languages this plugin draws. */
const LANGUAGES = ['echarts', 'echart'] as const;
/** The element a chart lives in: its own lifetime is the chart's — see `defineElement`. */
const TAG = 'aparte-echarts';
const DEFAULT_HEIGHT = '18rem';
const MAX_WIDTH = '40rem';
/** The least time between two drawings of a chart still arriving. */
const PROGRESSIVE_MS = 300;
/**
 * How long a chart taken off the page waits before it is disposed. A Markdown provider
 * rebuilds a block, and core moves a drawing across, within a pass or two: a chart that
 * comes back in that time keeps its instance rather than being drawn again from nothing.
 */
const LINGER_MS = 1000;
/** Unique to this copy of the plugin, so two bundles on one page never answer each other's charts. */
const ID_PREFIX = `aparte-echarts-${Math.random().toString(36).slice(2, 8)}`;
let setups = 0;
let streamIds = 0;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The plugin's setups on this page, by id, shared across copies of the plugin through a
 * global symbol: whichever copy defined the element, the setup that drew a chart answers it.
 */
interface Charts {
    connected(el: HTMLElement): void;
    disconnected(el: HTMLElement): void;
}
const REGISTRY = Symbol.for('aparte.plugin-echarts.setups');
function registry(): Map<string, Charts> {
    const scope = globalThis as unknown as Record<symbol, Map<string, Charts> | undefined>;
    return (scope[REGISTRY] ??= new Map());
}

/**
 * `<aparte-echarts>`: a chart's box. A code-language renderer hands core markup, not a node,
 * and ECharts needs a live element to draw in and to be disposed with — so the markup is
 * this element, which mounts its chart when it reaches the page and lets it go when it
 * leaves. The class only forwards to the setup that drew it.
 */
function defineElement(): void {
    if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined' || customElements.get(TAG)) return;
    customElements.define(TAG, class extends HTMLElement {
        connectedCallback(): void { registry().get(this.getAttribute('data-aparte-echarts') ?? '')?.connected(this); }
        disconnectedCallback(): void { registry().get(this.getAttribute('data-aparte-echarts') ?? '')?.disconnected(this); }
    });
}

/**
 * Draw charts with an ECharts you provide — the module, or a function that loads it on the
 * first chart. The entry point for a bundle that controls what it ships:
 * `@aparte/plugin-echarts` itself is this, with `() => import('echarts')`.
 *
 * @returns a disposer that unregisters the renderers, stops watching the theme and
 * disposes every chart on the page.
 * @example
 * import * as echarts from 'echarts';
 * import { setupEChartsWith } from '@aparte/plugin-echarts/core';
 * setupEChartsWith(echarts);
 */
export function setupEChartsWith(
    echarts: EChartsLike | (() => Promise<EChartsLike>),
    options: EChartsOptions = {},
    config: AparteConfig = aparteGlobalConfig,
): () => void {
    const load = typeof echarts === 'function' ? echarts : () => Promise.resolve(echarts);
    defineElement();
    const id = `${ID_PREFIX}-${++setups}`;
    const charts = createCharts(load, options, config);
    registry().set(id, charts);
    const unregister = config.registerCodeLanguageRenderer(createFenceRenderer(id, options, charts));
    const matchers = options.tool === undefined ? [] : Array.isArray(options.tool) ? options.tool : [options.tool];
    const tool = createToolRenderer(id, options, config, charts);
    for (const match of matchers) config.registerToolRenderer(match, tool);
    return () => {
        for (const match of matchers) config.unregisterToolRenderer(match);
        unregister();
        charts.stop();
        registry().delete(id);
    };
}

/** A height the option gave, as CSS; anything else is the default. */
function cssLength(height: number | string | undefined): string {
    if (typeof height === 'number' && height > 0) return `${height}px`;
    if (typeof height === 'string' && /^\d+(\.\d+)?(px|rem|em|vh|svh|dvh|lh|%)$/.test(height.trim())) return height.trim();
    return DEFAULT_HEIGHT;
}

function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A quiet box where a chart will be. */
function skeleton(height: string): HTMLElement {
    const box = document.createElement('span');
    box.className = 'aparte-skeleton aparte-skeleton--rect';
    box.setAttribute('aria-hidden', 'true');
    box.style.setProperty('block-size', height);
    box.style.setProperty('max-inline-size', MAX_WIDTH);
    return box;
}

/** A sentence in place of a chart. Its text follows the locale (`relabelWords`). */
function note(config: AparteConfig, key: WordKey, className = 'aparte-echarts-note'): HTMLElement {
    const p = document.createElement('p');
    p.className = className;
    p.setAttribute('role', 'note');
    p.setAttribute('data-aparte-echarts-word', key);
    p.textContent = word(config, key);
    return p;
}

function relabelWords(root: Element, config: AparteConfig): void {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-aparte-echarts-word]'))) {
        el.textContent = word(config, el.getAttribute('data-aparte-echarts-word') as WordKey);
    }
}

/**
 * The option with what the plugin keeps. ECharts' own description is on, in the plugin's
 * settings: an option's `aria.label.enabled: false`, or a `description` of its own, would
 * make what a screen reader hears differ from what is drawn — only its `decal` (patterns
 * that tell the series apart without colour) is the option's to set. And no motion when it
 * is unwanted (`motionless`).
 */
function finalOption(option: EChartsOption, width = 0): EChartsOption {
    const decal = isObject(option['aria']) && isObject(option['aria']['decal']) ? { decal: option['aria']['decal'] } : {};
    const out: EChartsOption = { ...option, aria: { enabled: true, label: { enabled: true }, ...decal } };
    const title = fittedTitles(option, width);
    if (title !== undefined) out['title'] = title;
    return prefersReducedMotion() ? motionless(out) : out;
}

/**
 * The option's titles held to the chart's width. ECharts never wraps a title: one a model
 * wrote long ("Thousands of trips, April 2025 – March 2026") ran off both sides of a narrow
 * chart. Each is cut with an ellipsis instead — the full title stays the figure's name and
 * the table's caption, so nothing is lost to a screen reader. A title that sets its own
 * width is left as it is.
 */
function fittedTitles(option: EChartsOption, width: number): unknown {
    const titles = option['title'];
    if (width <= 0 || titles === undefined) return undefined;
    const fit = (t: unknown): unknown => {
        if (!isObject(t)) return t;
        const style = isObject(t['textStyle']) ? t['textStyle'] : {};
        if (style['width'] !== undefined) return t;
        return { ...t, textStyle: { ...style, width: Math.max(60, width - 32), overflow: 'truncate' } };
    };
    return Array.isArray(titles) ? titles.map(fit) : fit(titles);
}

/**
 * `option` with nothing that moves. A root `animation: false` is not enough: ECharts lets a
 * series, a `graphic` component and an option's `baseOption` / timeline `options` / `media`
 * turn it back on, and some motion is not an animation at all — an `effectScatter`'s ripple
 * and a `lines` series' trail loop forever, a timeline plays itself.
 */
function motionless(option: EChartsOption): EChartsOption {
    const still = (o: unknown): unknown => {
        if (!isObject(o)) return o;
        const out: Record<string, unknown> = { ...o, animation: false };
        const series = (s: unknown): unknown => {
            if (!isObject(s)) return s;
            const next: Record<string, unknown> = { ...s, animation: false };
            // The ripple then shows on hover only, the trail not at all.
            if (s['type'] === 'effectScatter') next['showEffectOn'] = 'emphasis';
            if (isObject(s['effect'])) next['effect'] = { ...s['effect'], show: false };
            return next;
        };
        const each = (v: unknown, f: (x: unknown) => unknown): unknown => (Array.isArray(v) ? v.map(f) : f(v));
        if (o['series'] !== undefined) out['series'] = each(o['series'], series);
        if (o['graphic'] !== undefined) out['graphic'] = each(o['graphic'], (g) => (isObject(g) ? { ...g, animation: false } : g));
        if (o['timeline'] !== undefined) out['timeline'] = each(o['timeline'], (t) => (isObject(t) ? { ...t, autoPlay: false } : t));
        return out;
    };
    const out = still(option) as EChartsOption;
    if (isObject(option['baseOption'])) out['baseOption'] = still(option['baseOption']);
    if (Array.isArray(option['options'])) out['options'] = option['options'].map(still);
    if (Array.isArray(option['media'])) {
        out['media'] = option['media'].map((m) => (isObject(m) && isObject(m['option']) ? { ...m, option: still(m['option']) } : m));
    }
    return out;
}

/** The chart's numbers for a screen reader, or `null` when its shape does not say plainly what they are. */
function tableElement(option: EChartsOption, name: string, config: AparteConfig): HTMLTableElement | null {
    const data = tableOf(option);
    if (!data) return null;
    const table = document.createElement('table');
    table.className = 'aparte-sr-only aparte-echarts-table';
    const caption = table.createCaption();
    caption.textContent = name;
    const headRow = table.createTHead().insertRow();
    for (const text of data.head) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = text;
        headRow.append(th);
    }
    if (data.cut) {
        // Visually hidden like the table: a reader told the list stops, not left to think the chart does.
        const cell = table.createTFoot().insertRow().insertCell();
        cell.colSpan = data.head.length;
        cell.setAttribute('data-aparte-echarts-word', 'echartsTableCut');
        cell.textContent = word(config, 'echartsTableCut');
    }
    const body = table.createTBody();
    for (const row of data.rows) {
        const tr = body.insertRow();
        row.forEach((text, i) => {
            const cell = document.createElement(i === 0 ? 'th' : 'td');
            if (i === 0) (cell as HTMLTableCellElement).scope = 'row';
            cell.textContent = text;
            tr.append(cell);
        });
    }
    return table;
}

/** One chart on the page: the box ECharts draws in, its instance, and what it last drew. */
interface Chart {
    el: HTMLElement;
    box: HTMLElement;
    table: HTMLTableElement | null;
    instance: EChartsInstanceLike | null;
    option: EChartsOption;
    /** The colours the instance was themed with, so a theme change that changes nothing costs nothing. */
    colours: string;
    observer: ResizeObserver | undefined;
    linger: ReturnType<typeof setTimeout> | undefined;
    dead: boolean;
}

/** Every chart of one setup: mounting, adopting, theming, resizing and disposing them. */
function createCharts(load: () => Promise<EChartsLike>, options: EChartsOptions, config: AparteConfig) {
    const height = cssLength(options.height);
    let library: Promise<EChartsLike> | undefined;
    // Not poisoned: a failed load is tried again on the next chart.
    const libraryOf = (): Promise<EChartsLike> => (library ??= load().catch((error: unknown) => { library = undefined; throw error; }));
    const states = new WeakMap<HTMLElement, Chart>();
    /** Every chart with an instance or about to have one: what `stop()` disposes. */
    const all = new Set<Chart>();
    /** The charts on the page: what a theme change recolours. */
    const live = new Set<Chart>();
    /** The element showing each chart still arriving: its next frame takes the instance over. */
    const streams = new Map<string, HTMLElement>();
    /** The config each element was drawn for, as core hands it over: its locale names the chart. */
    const configs = new WeakMap<HTMLElement, AparteConfig>();
    const roots = new WeakSet<Node>();
    let warned = false;
    const warnOnce = (error: unknown): void => {
        if (warned) return;
        warned = true;
        console.warn('[aparte-echarts] a chart could not be drawn; a note is shown instead.', error);
    };

    const configOf = (el: HTMLElement): AparteConfig => configs.get(el) ?? config;
    const nameOf = (c: Chart): string => titleOf(c.option) ?? word(configOf(c.el), 'echartsChart');

    const themeAt = (el: HTMLElement): { theme: Record<string, unknown>; key: string } => {
        const tokens = readTokens(el);
        return { theme: echartsTheme(tokens), key: JSON.stringify(tokens) };
    };

    const retheme = (c: Chart): void => {
        if (!c.instance || !c.el.isConnected) return;
        const { theme, key } = themeAt(c.el);
        if (key === c.colours) return;
        c.colours = key;
        c.instance.setTheme(theme);
    };
    const watch = watchTheme(() => { for (const c of live) retheme(c); });

    const destroy = (c: Chart): void => {
        c.dead = true;
        clearTimeout(c.linger);
        c.observer?.disconnect();
        c.instance?.dispose();
        c.instance = null;
        live.delete(c);
        all.delete(c);
        if (states.get(c.el) === c) states.delete(c.el);
        const stream = c.el.getAttribute('data-aparte-echarts-stream');
        if (stream && streams.get(stream) === c.el) streams.delete(stream);
    };

    const fail = (c: Chart, error: unknown): void => {
        warnOnce(error);
        destroy(c);
        c.el.replaceChildren(note(configOf(c.el), 'echartsError', 'aparte-code-error'));
    };

    /** Draw `option` in `c`: its name, its table, and — once ECharts is there — the chart. */
    const apply = (c: Chart, option: EChartsOption, fresh: boolean): void => {
        c.option = option;
        const name = nameOf(c);
        c.el.setAttribute('aria-label', name);
        c.table?.remove();
        c.table = tableElement(option, name, configOf(c.el));
        if (c.table) c.el.append(c.table);
        if (!c.instance) return;
        try {
            // A chart still arriving only grows, so a newer frame is merged into the drawing
            // and ECharts animates the bars that appeared; a chart drawn anew replaces it.
            c.instance.setOption(finalOption(option, c.box.clientWidth), fresh ? { notMerge: true } : undefined);
        } catch (error) {
            fail(c, error);
        }
    };

    const watchRoot = (el: HTMLElement): void => {
        const root = el.getRootNode();
        if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot) || roots.has(root)) return;
        roots.add(root);
        watch.add(root);
    };

    const mount = (el: HTMLElement, option: EChartsOption): void => {
        const box = document.createElement('div');
        box.className = 'aparte-echarts-chart';
        box.style.setProperty('block-size', height);
        box.style.setProperty('inline-size', '100%');
        const waiting = skeleton('100%');
        box.append(waiting);
        el.replaceChildren(box);
        const c: Chart = { el, box, table: null, instance: null, option, colours: '', observer: undefined, linger: undefined, dead: false };
        states.set(el, c);
        all.add(c);
        live.add(c);
        apply(c, option, true);
        libraryOf().then((lib) => {
            if (c.dead) return;
            const { theme, key } = themeAt(c.el);
            c.colours = key;
            waiting.remove();
            c.instance = lib.init(box, theme, {
                renderer: options.renderer ?? 'svg',
                // ECharts' own description (aria) in the chat's language, when that language
                // is registered with ECharts; English otherwise.
                locale: languageOf(configOf(c.el)).toUpperCase(),
            });
            if (typeof ResizeObserver !== 'undefined') {
                c.observer = new ResizeObserver(() => {
                    if (!c.instance) return;
                    try {
                        c.instance.resize();
                        // The titles are held to the width, which just changed.
                        const title = fittedTitles(c.option, c.box.clientWidth);
                        if (title !== undefined) c.instance.setOption({ title });
                    } catch (error) {
                        fail(c, error);
                    }
                });
                c.observer.observe(box);
            }
            apply(c, c.option, true);
        }).catch((error: unknown) => { if (!c.dead) fail(c, error); });
    };

    return {
        connected(el: HTMLElement): void {
            el.style.setProperty('display', 'block');
            el.style.setProperty('inline-size', '100%');
            el.style.setProperty('max-inline-size', MAX_WIDTH);
            el.setAttribute('role', 'figure');
            watchRoot(el);
            const kept = states.get(el);
            if (kept) {
                // Moved, not replaced: the chart is still in it.
                clearTimeout(kept.linger);
                kept.linger = undefined;
                live.add(kept);
                return;
            }
            const option = sanitizeEChartsOption(parseOption(el.getAttribute('data-aparte-echarts-option') ?? ''));
            if (!option) {
                el.replaceChildren(note(configOf(el), 'echartsError', 'aparte-code-error'));
                return;
            }
            const stream = el.getAttribute('data-aparte-echarts-stream');
            const before = stream ? streams.get(stream) : undefined;
            if (stream) streams.set(stream, el);
            const adopted = before && before !== el && !before.isConnected ? states.get(before) : undefined;
            if (adopted && !adopted.dead) {
                // The next frame of a chart still arriving: it takes the drawing over and
                // updates it, rather than drawing the chart again from nothing.
                clearTimeout(adopted.linger);
                adopted.linger = undefined;
                states.delete(adopted.el);
                adopted.el = el;
                states.set(el, adopted);
                live.add(adopted);
                el.replaceChildren(adopted.box);
                apply(adopted, option, false);
                return;
            }
            mount(el, option);
        },
        disconnected(el: HTMLElement): void {
            const c = states.get(el);
            if (!c) return;
            live.delete(c);
            clearTimeout(c.linger);
            c.linger = setTimeout(() => { if (c.el === el && !el.isConnected) destroy(c); }, LINGER_MS);
        },
        /** The element is gone for good (a tool row's cleanup): no linger. */
        dispose(el: HTMLElement): void {
            const c = states.get(el);
            if (c) destroy(c);
        },
        /** Name a chart in the locale of `cfg`, and keep that config for its later words. */
        label(el: HTMLElement, cfg: AparteConfig): void {
            configs.set(el, cfg);
            const c = states.get(el);
            const name = c ? nameOf(c) : word(cfg, 'echartsChart');
            el.setAttribute('aria-label', name);
            const caption = el.querySelector('caption');
            if (caption) caption.textContent = name;
            relabelWords(el, cfg);
        },
        stop(): void {
            watch.stop();
            for (const c of [...all]) destroy(c);
        },
    };
}

type ChartsOf = ReturnType<typeof createCharts>;

/** The ```` ```echarts ```` fence: a chart's box as markup, paced while the fence arrives. */
function createFenceRenderer(setupId: string, options: EChartsOptions, charts: ChartsOf) {
    const progressive = options.progressive !== false;
    const height = cssLength(options.height);
    /**
     * A chart still arriving, by the part of the reply it is in and its rank there — a
     * rebuild replaces its placeholder, never its part: the id its frames share (so each
     * takes the drawing over from the last), the latest source waiting to be drawn, the
     * time of the last drawing, and what it drew.
     */
    interface Arriving {
        id: string;
        waiting: { source: string; answer: (html: string | null) => void } | null;
        timer: ReturnType<typeof setTimeout> | undefined;
        at: number;
        /** The source of the chart this position has started showing, or `null` before its first frame. */
        started: string | null;
        /** The option last drawn, as JSON: a frame that changes nothing is not drawn again. */
        drawn: string | null;
    }
    const parts = new WeakMap<Element, Map<number, Arriving>>();

    const arrivingOf = (host: HTMLElement): Arriving => {
        const part = host.closest('[data-segment-id]') ?? host.closest('pre')?.parentElement ?? host.parentElement ?? host;
        const fences = Array.from(part.querySelectorAll(LANGUAGES.map((l) => `code.language-${l}`).join(', ')));
        const rank = Math.max(0, fences.indexOf(host));
        let byRank = parts.get(part);
        if (!byRank) { byRank = new Map(); parts.set(part, byRank); }
        let state = byRank.get(rank);
        if (!state) {
            state = { id: `${setupId}-s${++streamIds}`, waiting: null, timer: undefined, at: 0, started: null, drawn: null };
            byRank.set(rank, state);
        }
        return state;
    };

    const markup = (json: string, stream: string): string =>
        `<aparte-echarts class="aparte-echarts" data-aparte-echarts="${escapeAttr(setupId)}" data-aparte-echarts-stream="${escapeAttr(stream)}" data-aparte-echarts-option="${escapeAttr(json)}"></aparte-echarts>`;
    /** A chart's first frame, before it has a series: a quiet box, not its JSON scrolling by. */
    const PENDING = '<span class="aparte-skeleton aparte-skeleton--rect aparte-echarts-pending" aria-hidden="true"></span>';
    /** The note and the source, for a fence that is not an option. Their text is set by `relabel`. */
    const FAILED = '<span class="aparte-code-error" role="note" data-aparte-echarts-error></span><pre class="aparte-code-error" data-aparte-echarts-source></pre>';

    const schedule = (state: Arriving): void => {
        if (state.timer !== undefined || !state.waiting) return;
        const wait = Math.max(0, state.at + PROGRESSIVE_MS - performance.now());
        state.timer = setTimeout(() => {
            state.timer = undefined;
            const job = state.waiting;
            state.waiting = null;
            if (!job) return;
            state.at = performance.now();
            const option = sanitizeEChartsOption(parseOption(job.source, true));
            const json = option && drawable(option) ? JSON.stringify(option) : null;
            if (json === null || json === state.drawn) { job.answer(null); return; }
            state.drawn = json;
            job.answer(markup(json, state.id));
        }, wait);
    };

    return {
        languages: LANGUAGES,
        lazy: true,
        render(ctx: AparteCodeLanguageContext): string | null | Promise<string | null> {
            if (!ctx.display) return null;
            const state = arrivingOf(ctx.host);
            // A newer source, or the end of this one, supersedes the frame still waiting.
            state.waiting?.answer(null);
            state.waiting = null;
            if (!ctx.open) {
                state.started = null;
                state.drawn = null;
                // Valid JSON with no series and no dataset draws an empty box: the note says so,
                // as it does for a tool's result.
                const option = sanitizeEChartsOption(parseOption(ctx.source));
                return option && drawable(option) ? markup(JSON.stringify(option), state.id) : FAILED;
            }
            if (!progressive) return null;
            // A chart's first frame: the box it will be drawn in, at once, in place of its
            // JSON. The frames after it draw what has arrived, and a frame that draws nothing
            // new keeps what is shown.
            if (state.started === null || !ctx.source.startsWith(state.started)) {
                state.started = ctx.source;
                state.drawn = null;
                return PENDING;
            }
            return new Promise<string | null>((answer) => {
                state.waiting = { source: ctx.source, answer };
                schedule(state);
            });
        },
        relabel(drawing: HTMLElement, ctx: AparteCodeLanguageContext): void {
            const error = drawing.querySelector<HTMLElement>('[data-aparte-echarts-error]');
            if (error) error.textContent = word(ctx.config, 'echartsError');
            const source = drawing.querySelector<HTMLElement>('[data-aparte-echarts-source]');
            if (source) source.textContent = ctx.source;
            for (const box of Array.from(drawing.querySelectorAll<HTMLElement>('.aparte-echarts-pending'))) {
                box.style.setProperty('block-size', height);
                box.style.setProperty('max-inline-size', MAX_WIDTH);
            }
            for (const el of Array.from(drawing.querySelectorAll<HTMLElement>(TAG))) charts.label(el, ctx.config);
        },
    };
}

/** A tool whose result is an ECharts option: the chart in place of its row. */
function createToolRenderer(setupId: string, options: EChartsOptions, config: AparteConfig, charts: ChartsOf): AparteToolRenderer {
    const height = cssLength(options.height);
    /** What each element shows, so an update that changes nothing redraws nothing. */
    const shown = new WeakMap<HTMLElement, string>();
    let warned = false;

    const optionOf = (segment: AparteToolCallSegment): EChartsOption | null => {
        let raw: unknown = segment.structuredResult;
        if (raw === undefined && typeof segment.result === 'string') raw = parseOption(segment.result.trim()) ?? segment.result;
        const input = isObject(segment.toolCall?.input) ? segment.toolCall.input : {};
        try {
            if (options.map) raw = options.map(raw, input);
        } catch (error) {
            if (!warned) { warned = true; console.warn(`[aparte-echarts] the \`map\` for tool "${segment.toolCall?.name}" threw:`, error); }
            return null;
        }
        const option = sanitizeEChartsOption(raw);
        return option && drawable(option) ? option : null;
    };

    const chartOf = (option: EChartsOption): HTMLElement => {
        const el = document.createElement(TAG);
        el.className = 'aparte-echarts';
        el.setAttribute('data-aparte-echarts', setupId);
        el.setAttribute('data-aparte-echarts-option', JSON.stringify(option));
        return el;
    };

    const fill = (root: HTMLElement, segment: AparteToolCallSegment): void => {
        let structured = '';
        try { structured = JSON.stringify(segment.structuredResult) ?? ''; } catch { /* a cycle: compared by the text alone */ }
        const signature = `${segment.status}\u0001${segment.result ?? ''}\u0001${structured}`;
        if (shown.get(root) === signature) return;
        shown.set(root, signature);
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(TAG))) charts.dispose(el);
        root.removeAttribute('aria-busy');
        root.removeAttribute('aria-label');
        root.removeAttribute('data-aparte-echarts-label');
        switch (segment.status) {
            case 'pending':
                root.setAttribute('aria-busy', 'true');
                root.setAttribute('data-aparte-echarts-label', 'echartsLoading');
                root.setAttribute('aria-label', word(config, 'echartsLoading'));
                root.replaceChildren(skeleton(height));
                return;
            case 'resolved': {
                const option = optionOf(segment);
                root.replaceChildren(option ? chartOf(option) : note(config, 'echartsError'));
                return;
            }
            case 'awaiting-approval':
                root.replaceChildren(note(config, 'echartsWaiting'));
                return;
            case 'rejected':
            case 'aborted':
                root.replaceChildren(note(config, 'echartsNotRun'));
                return;
            default:
                root.replaceChildren(note(config, 'echartsFailed'));
        }
    };

    return {
        render(segment) {
            const root = document.createElement('div');
            root.className = 'aparte-echarts-tool';
            fill(root, segment);
            return root;
        },
        // Same element, new inside only when the call changed: a chart the reader is
        // looking at is not drawn again because an approval or a relabel passed by.
        update: (root, segment) => fill(root, segment),
        relabel(root) {
            const key = root.getAttribute('data-aparte-echarts-label') as WordKey | null;
            if (key) root.setAttribute('aria-label', word(config, key));
            relabelWords(root, config);
            for (const el of Array.from(root.querySelectorAll<HTMLElement>(TAG))) charts.label(el, config);
        },
        cleanup(root) {
            for (const el of Array.from(root.querySelectorAll<HTMLElement>(TAG))) charts.dispose(el);
        },
    };
}

/**
 * Call `changed` when the chat's theme or the system's colour scheme changes — on the
 * page, and in each shadow root handed to `add`.
 */
function watchTheme(changed: () => void): { add: (root: ShadowRoot) => void; stop: () => void } {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return { add: () => {}, stop: () => {} };
    const observer = new MutationObserver(changed);
    const init: MutationObserverInit = { attributes: true, subtree: true, attributeFilter: ['data-aparte-theme'] };
    observer.observe(document.documentElement, init);
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', changed);
    return {
        add: (root) => observer.observe(root, init),
        stop: () => { observer.disconnect(); media?.removeEventListener?.('change', changed); },
    };
}
