import {
    aparteGlobalConfig,
    escapeAttr,
    escapeHtml,
    type AparteConfig,
    type AparteCodeLanguageContext,
    type AparteToolCallSegment,
    type AparteToolMatcher,
    type AparteToolRenderer,
} from '@aparte/core';
import styles from './chartjs.css?raw';
import { MAX_POINTS, dataTable, hasPoints, parseFence, readChartConfig, titleOf, type ChartjsConfig } from './source.js';
import { readTokens, themeChartjsConfig } from './theme.js';
import { word } from './words.js';

export { themeChartjsConfig, type ChartjsTokens } from './theme.js';
export { readChartConfig, type ChartjsConfig } from './source.js';
export { seriesPalette, SERIES_HUES } from './palette.js';

/**
 * The part of a Chart.js chart this plugin calls. Structural, so this module imports
 * nothing from `chart.js` — a bundle that hands over its own `Chart` carries one copy.
 */
export interface ChartjsChart {
    options: unknown;
    data: unknown;
    update(mode?: 'none'): void;
    resize(width?: number, height?: number): void;
    destroy(): void;
}

/** Chart.js' `Chart` class, or anything constructed the same way. */
export interface ChartjsConstructor {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chart.js' own config type, unnamed here so nothing is imported from it.
    new (canvas: HTMLCanvasElement, config: any): ChartjsChart;
}

/** A function that loads Chart.js on the first chart: the class, or a module carrying it. */
export type ChartjsLoader = () => Promise<ChartjsConstructor | { Chart?: ChartjsConstructor; default?: ChartjsConstructor }>;

export interface ChartjsOptions {
    /**
     * Redraw a chart while its fence arrives, from the part of its JSON that has arrived
     * (default `true`). `false` draws it once the fence has closed.
     */
    progressive?: boolean;
    /**
     * The height of a chart, as a CSS length (default `18rem`). A config that sets `aspectRatio`, or
     * `maintainAspectRatio: true`, is as tall as its width says instead.
     */
    height?: string;
    /**
     * Tools whose result is a Chart.js config, drawn as the chart in place of the tool's
     * row: its `structuredContent`, else its text read as JSON. An exact name, a RegExp,
     * or a list of them.
     */
    tool?: AparteToolMatcher | AparteToolMatcher[];
    /**
     * Turn a tool's own result into a Chart.js config — for a tool that returns data
     * rather than a chart. Given the result (as `tool` reads it) and the call's input.
     * The result is `any`, as in `@aparte/plugin-cards`: its shape is your tool's, and `map` is
     * where you read it.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map?: (result: any, input: Record<string, unknown>) => unknown;
    /** The most data points a chart may carry, all datasets together — and the most labels, and datasets (default 5000). */
    maxPoints?: number;
}

/** The fence languages drawn as a chart. */
export const CHARTJS_LANGUAGES = ['chartjs', 'chart.js'] as const;

/** The least time between two drawings of a chart still arriving. */
const PROGRESSIVE_MS = 300;
const CONFIG_ATTR = 'data-aparte-chartjs-config';
/**
 * How many released frames stay watched for a return. Each holds its detached message alive
 * (a reset canvas, the table) until it comes back or is pushed out, so the count is bounded:
 * the oldest stops being watched first.
 */
const PARKED = 32;
const STYLE_ATTR = 'data-aparte-chartjs-styles';

const warned = new WeakSet<object>();
function warnOnce(key: object, message: string, error: unknown): void {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[aparte-chartjs] ${message}`, error);
}

const isChartClass = (value: unknown): value is ChartjsConstructor =>
    typeof value === 'function' && typeof (value as { prototype?: { update?: unknown } }).prototype?.update === 'function';

const reducedMotion = (): boolean =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Put the chart's stylesheet where `node` is drawn: the document's head, or the shadow
 * root a widget mounted the chat in, which a sheet in the head does not reach. A code
 * language has no `getStyles()` seam, and a tool renderer's goes to the head only.
 */
function ensureStyles(node: Node): void {
    const root = node.getRootNode();
    const target = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot ? root
        : root === document ? document.head : null;
    if (!target || target.querySelector(`style[${STYLE_ATTR}]`)) return;
    const sheet = document.createElement('style');
    sheet.setAttribute(STYLE_ATTR, '');
    sheet.textContent = styles;
    target.appendChild(sheet);
}

/**
 * Draw charts with a Chart.js you provide — its `Chart` class, or a function that loads
 * it on the first chart. The entry point for a bundle that controls what it ships:
 * `@aparte/plugin-chartjs` itself is this, with `() => import('chart.js/auto')`.
 *
 * Draws every ```` ```chartjs ```` (or ```` ```chart.js ````) fence whose body is a
 * Chart.js config as JSON, and — with `options.tool` — the result of the tools named
 * there. The chart takes the chat's colours and font wherever its config leaves them
 * out (`themeChartjsConfig`), and follows a light/dark switch in place.
 *
 * @returns a disposer that unregisters the renderers, stops watching the theme and
 * releases every chart drawn.
 * @example
 * import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
 * import { setupChartjsWith } from '@aparte/plugin-chartjs/core';
 * Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
 * setupChartjsWith(Chart);
 */
export function setupChartjsWith(
    chartjs: ChartjsConstructor | ChartjsLoader,
    options: ChartjsOptions = {},
    config: AparteConfig = aparteGlobalConfig,
): () => void {
    const charts = createCharts(chartjs, config);
    const unregister = config.registerCodeLanguageRenderer(createFenceRenderer(charts, options));
    const matchers = options.tool === undefined ? [] : Array.isArray(options.tool) ? options.tool : [options.tool];
    const toolRenderer = createToolRenderer(charts, options, config);
    for (const match of matchers) config.registerToolRenderer(match, toolRenderer);
    return () => {
        unregister();
        for (const match of matchers) config.unregisterToolRenderer(match);
        charts.stop();
    };
}

/** One chart on the page: the Chart.js instance and the config it was drawn from. */
interface Mounted {
    chart: ChartjsChart;
    config: ChartjsConfig;
    /** Whether it follows its frame's size: `false` when its config says `responsive: false`. */
    responsive: boolean;
}

type Charts = ReturnType<typeof createCharts>;

/**
 * The charts of one setup: loading Chart.js, mounting a chart on each drawn canvas,
 * fitting it to its frame, re-theming it, and releasing it once it has left the page.
 *
 * Chart.js' own `responsive` mode is not used. It puts a MutationObserver on the whole
 * document per chart, called on every token a reply streams, and it never releases a
 * chart taken off the page: `Chart.instances` keeps it until `destroy()`. So the plugin
 * passes `responsive: false` and keeps ONE ResizeObserver for all its charts: a frame
 * that changes size is fitted (`chart.resize()`), and a frame reported off the page is
 * released after the task — a framework only MOVING a message puts it back before then.
 * A released frame stays watched (up to `PARKED`), so a message that comes back later — a
 * list that virtualises its rows, a conversation reopened from a cache — is drawn again on
 * its first size, as an ECharts chart is when its element reconnects.
 */
function createCharts(chartjs: ChartjsConstructor | ChartjsLoader, config: AparteConfig) {
    const load: ChartjsLoader = isChartClass(chartjs) ? () => Promise.resolve(chartjs) : chartjs;
    let loading: Promise<ChartjsConstructor> | undefined;
    // Handed over as the class itself: ready at once, so a chart is drawn in the same pass.
    let Chart: ChartjsConstructor | undefined = isChartClass(chartjs) ? chartjs : undefined;
    const mounted = new Map<HTMLElement, Mounted>();
    /** Released frames still watched, oldest first, by their wrapper: what a return redraws. */
    const parked = new Map<HTMLElement, HTMLElement>();
    const shadows = new WeakSet<ShadowRoot>();
    let sweep: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const chartOf = (): Promise<ChartjsConstructor> => {
        // Not poisoned: a failed load is tried again on the next chart.
        loading ??= load().then((m) => {
            const found = isChartClass(m) ? m : (m.default ?? m.Chart);
            if (!isChartClass(found)) throw new TypeError('the loader returned no Chart class');
            Chart = found;
            return found;
        }).catch((error: unknown) => { loading = undefined; throw error; });
        return loading;
    };

    const frameOf = (wrapper: HTMLElement): HTMLElement | null => wrapper.querySelector<HTMLElement>('.aparte-chartjs__frame');

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
        for (const entry of entries) {
            const wrapper = (entry.target as HTMLElement).parentElement;
            if (!wrapper) continue;
            if (!wrapper.isConnected) { release.later(); continue; }
            // Hidden, or skipped by `content-visibility`: nothing to fit until it shows.
            if (entry.contentRect.width === 0 && entry.contentRect.height === 0) continue;
            const chart = mounted.get(wrapper);
            // One chart that throws is that chart's note, not the end of the batch.
            try {
                if (!chart) mount(wrapper);
                else if (chart.responsive) chart.chart.resize();
            } catch (error) {
                release(wrapper);
                fail(wrapper, error);
            }
        }
    });

    /** Stop watching a frame: its chart is gone for good. */
    const unwatch = (wrapper: HTMLElement): void => {
        const frame = parked.get(wrapper) ?? frameOf(wrapper);
        parked.delete(wrapper);
        if (frame) observer?.unobserve(frame);
    };

    /** Destroy a chart. Its frame stays watched when `park`, so the chart is drawn again if it returns. */
    const release = Object.assign((wrapper: HTMLElement, park = false): void => {
        const chart = mounted.get(wrapper);
        if (chart) {
            mounted.delete(wrapper);
            try { chart.chart.destroy(); } catch { /* a chart that failed half-way has nothing more to release */ }
        }
        const frame = frameOf(wrapper);
        if (!park || !frame || !observer) { unwatch(wrapper); return; }
        parked.delete(wrapper);
        parked.set(wrapper, frame);
        for (const [oldest] of parked) {
            if (parked.size <= PARKED) break;
            unwatch(oldest);
        }
    }, {
        /** Release every chart off the page, after the task: a move puts its nodes back before then. */
        later(): void {
            if (sweep !== undefined) return;
            sweep = setTimeout(() => {
                sweep = undefined;
                for (const wrapper of [...mounted.keys()]) if (!wrapper.isConnected) release(wrapper, true);
            }, 0);
        },
    });

    /** The config a chart is drawn with: the chat's look, and the plugin's own sizing. */
    const drawn = (chart: ChartjsConfig, wrapper: HTMLElement, animate: boolean): { config: ChartjsConfig; responsive: boolean } => {
        const themed = themeChartjsConfig(chart, readTokens(wrapper));
        const o = themed.options ??= {};
        const responsive = o['responsive'] !== false;
        o['maintainAspectRatio'] = o['aspectRatio'] !== undefined || o['maintainAspectRatio'] === true;
        o['responsive'] = false;
        if (!animate) o['animation'] = false;
        return { config: themed, responsive };
    };

    const fail = (wrapper: HTMLElement, error: unknown): void => {
        warnOnce(config, 'a chart could not be drawn; its note is shown instead. Is its type registered on your Chart?', error);
        wrapper.setAttribute('data-aparte-chartjs-failed', '');
        const note = document.createElement('span');
        note.className = 'aparte-code-error';
        note.setAttribute('role', 'note');
        note.setAttribute('data-aparte-chartjs-error', '');
        note.textContent = word(config, 'chartjsError');
        unwatch(wrapper);
        frameOf(wrapper)?.replaceWith(note);
    };

    function mount(wrapper: HTMLElement): void {
        if (stopped || mounted.has(wrapper) || !wrapper.isConnected || wrapper.hasAttribute('data-aparte-chartjs-failed')) return;
        if (!Chart) {
            void chartOf().then(() => mount(wrapper), (error: unknown) => warnOnce(load, 'Chart.js could not be loaded.', error));
            return;
        }
        const canvas = wrapper.querySelector('canvas');
        const frame = frameOf(wrapper);
        if (!canvas || !frame) return;
        let source: ChartjsConfig | null;
        try { source = readChartConfig(JSON.parse(wrapper.getAttribute(CONFIG_ATTR) ?? ''), Infinity); } catch { source = null; }
        if (!source) return;
        ensureStyles(wrapper);
        watchRoot(wrapper);
        // A chart still arriving is a new chart every frame: an entrance animation would
        // replay on each. Nor does the chart it settles into (`still`) play one after the
        // reader watched it grow, unless its config asks for an animation itself.
        const animate = !reducedMotion() && !wrapper.hasAttribute('data-aparte-chartjs-open')
            && (!wrapper.hasAttribute('data-aparte-chartjs-still') || source.options?.['animation'] !== undefined);
        const { config: final, responsive } = drawn(source, wrapper, animate);
        let chart: ChartjsChart | undefined;
        try {
            chart = new Chart(canvas, final);
            if (responsive) chart.resize();
        } catch (error) {
            // Constructed and then failed: still in `Chart.instances` until destroyed.
            try { chart?.destroy(); } catch { /* nothing more to release */ }
            fail(wrapper, error);
            return;
        }
        mounted.set(wrapper, { chart, config: source, responsive });
        parked.delete(wrapper);
        release.later();
    }

    /** Re-read the chat's colours for every chart on the page, in place. One that throws shows its note; the rest go on. */
    const retheme = (): void => {
        for (const [wrapper, chart] of [...mounted]) {
            if (!wrapper.isConnected) { release.later(); continue; }
            try {
                const { config: final } = drawn(chart.config, wrapper, false);
                chart.chart.options = final.options;
                chart.chart.data = final.data;
                chart.chart.update('none');
            } catch (error) {
                release(wrapper);
                fail(wrapper, error);
            }
        }
    };
    const watch = watchTheme(retheme);
    const watchRoot = (node: Node): void => {
        const root = node.getRootNode();
        if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot) || shadows.has(root)) return;
        shadows.add(root);
        watch.add(root);
    };

    return {
        chartOf,
        warm(): void { void chartOf().catch(() => undefined); },
        /** Mount a chart on every drawn canvas in `root` that has none. */
        activate(root: Element): void {
            const wrappers = root.matches(`.aparte-chartjs[${CONFIG_ATTR}]`) ? [root as HTMLElement]
                : Array.from(root.querySelectorAll<HTMLElement>(`.aparte-chartjs[${CONFIG_ATTR}]`));
            for (const wrapper of wrappers) {
                // Watched from the start: a canvas drawn off the page (a message being
                // rebuilt) is mounted when its frame first shows.
                const frame = frameOf(wrapper);
                if (frame && !wrapper.hasAttribute('data-aparte-chartjs-failed')) observer?.observe(frame);
                mount(wrapper);
            }
        },
        /** Release the charts in `root` now: it is gone for good. */
        releaseIn(root: Element): void {
            for (const wrapper of [...mounted.keys(), ...parked.keys()]) if (root === wrapper || root.contains(wrapper)) release(wrapper);
        },
        stop(): void {
            stopped = true;
            watch.stop();
            if (sweep !== undefined) clearTimeout(sweep);
            sweep = undefined;
            for (const wrapper of [...mounted.keys()]) release(wrapper);
            parked.clear();
            observer?.disconnect();
        },
    };
}

/** The markup of a chart: the sized frame its canvas is drawn in, and its data as a table. */
function chartMarkup(chart: ChartjsConfig, locale: string | undefined, flags: { open?: boolean; still?: boolean } = {}): string {
    const o = chart.options ?? {};
    const ratio = o['aspectRatio'] !== undefined || o['maintainAspectRatio'] === true;
    const title = titleOf(chart);
    const named = title ? ` data-aparte-chartjs-title="${escapeAttr(title)}"` : '';
    const marks = `${ratio ? ' data-aparte-chartjs-ratio' : ''}${flags.open ? ' data-aparte-chartjs-open' : ''}${flags.still ? ' data-aparte-chartjs-still' : ''}`;
    // A figure, named like the canvas, holding the canvas and the chart's data — the shape an
    // ECharts chart has. The canvas is `role="img"` with the chart's name; its data is a
    // table BESIDE it, not inside it as fallback content: an image's children are
    // presentational, so a screen reader would never reach a table in there. `role` rather
    // than `<figure>`, whose default margins the reply's own styles would have to undo.
    return `<div class="aparte-chartjs" role="figure"${named}${marks} ${CONFIG_ATTR}="${escapeAttr(JSON.stringify(chart))}">`
        + '<div class="aparte-chartjs__frame"><canvas class="aparte-chartjs__canvas" role="img"></canvas></div>'
        + `<div class="aparte-sr-only">${dataTable(chart, locale)}</div></div>`; // safe-text: dataTable escapes every value it writes
}

/** What a chart on its way shows: a quiet box the size the chart will be. */
function pendingMarkup(): string {
    return '<div class="aparte-chartjs"><div class="aparte-chartjs__frame">'
        + '<span class="aparte-skeleton aparte-skeleton--rect" aria-hidden="true"></span></div></div>';
}

/**
 * The words of every chart in `root`, in the chat's language — its name, its unnamed
 * series, its notes — and the height the app asked for (`options.height`), set before
 * the chart's first frame is painted.
 */
function relabelCharts(root: Element, config: AparteConfig, options: ChartjsOptions): void {
    const wrappers = root.matches('.aparte-chartjs') ? [root as HTMLElement] : Array.from(root.querySelectorAll<HTMLElement>('.aparte-chartjs'));
    for (const wrapper of wrappers) {
        if (options.height) wrapper.style.setProperty('--aparte-chartjs-height', options.height);
        const name = wrapper.getAttribute('data-aparte-chartjs-title') || word(config, 'chartjsChart');
        if (wrapper.getAttribute('role') === 'figure') wrapper.setAttribute('aria-label', name);
        wrapper.querySelector('canvas')?.setAttribute('aria-label', name);
        const caption = wrapper.querySelector('[data-aparte-chartjs-name]');
        if (caption) caption.textContent = name;
        for (const th of Array.from(wrapper.querySelectorAll('[data-aparte-chartjs-series]'))) {
            th.textContent = word(config, 'chartjsSeries', { n: th.getAttribute('data-aparte-chartjs-series') ?? '' });
        }
        for (const cut of Array.from(wrapper.querySelectorAll('[data-aparte-chartjs-cut]'))) cut.textContent = word(config, 'chartjsTableCut');
    }
    for (const note of Array.from(root.querySelectorAll('[data-aparte-chartjs-error]'))) note.textContent = word(config, 'chartjsError');
    for (const note of Array.from(root.querySelectorAll('[data-aparte-chartjs-unavailable]'))) note.textContent = word(config, 'chartjsUnavailable');
    for (const note of Array.from(root.querySelectorAll('[data-aparte-chartjs-waiting]'))) note.textContent = config.t('approvalWaiting');
}

const localeOf = (config: AparteConfig): string | undefined => {
    const tag = config.getLocale().tag;
    return typeof tag === 'string' && tag ? tag : undefined;
};

/** The note and the source, for a fence that is not a chart. Its text is set by `relabel`. */
function failed(ctx: AparteCodeLanguageContext): string {
    return `<span class="aparte-code-error" role="note" data-aparte-chartjs-error></span><pre class="aparte-code-error">${escapeHtml(ctx.source)}</pre>`;
}

function createFenceRenderer(charts: Charts, options: ChartjsOptions) {
    const progressive = options.progressive !== false;
    const maxPoints = options.maxPoints ?? MAX_POINTS;
    /**
     * A chart still arriving, by the part of the reply it is in — a rebuild replaces its
     * placeholder, never its part: the latest source waiting to be drawn, whether a timer
     * is set, when the last drawing was made, the source of the chart this part started
     * showing (`null` before its first frame), and the config last drawn, so a token that
     * changes nothing drawable (a key half-written) draws nothing.
     */
    interface Arriving {
        waiting: { ctx: AparteCodeLanguageContext; answer: (html: string | null) => void } | null;
        timer: ReturnType<typeof setTimeout> | undefined;
        at: number;
        started: string | null;
        drawn: string | null;
    }
    const arriving = new WeakMap<Element, Arriving>();

    const stateOf = (host: HTMLElement): Arriving => {
        const part = host.closest('[data-segment-id]') ?? host.closest('pre')?.parentElement ?? host.parentElement ?? host;
        let state = arriving.get(part);
        if (!state) {
            state = { waiting: null, timer: undefined, at: 0, started: null, drawn: null };
            arriving.set(part, state);
        }
        return state;
    };

    const frame = async (ctx: AparteCodeLanguageContext, state: Arriving): Promise<string | null> => {
        const chart = parseFence(ctx.source, true, maxPoints);
        if (!chart || !hasPoints(chart)) return null;
        const key = JSON.stringify(chart);
        if (key === state.drawn) return null;
        await charts.chartOf();
        state.drawn = key;
        return chartMarkup(chart, localeOf(ctx.config), { open: true });
    };

    const schedule = (state: Arriving): void => {
        if (state.timer !== undefined || !state.waiting) return;
        const wait = Math.max(0, state.at + PROGRESSIVE_MS - performance.now());
        state.timer = setTimeout(() => {
            state.timer = undefined;
            const job = state.waiting;
            state.waiting = null;
            if (!job) return;
            state.at = performance.now();
            void frame(job.ctx, state).then(job.answer, () => job.answer(null));
        }, wait);
    };

    return {
        languages: CHARTJS_LANGUAGES,
        lazy: true,
        render(ctx: AparteCodeLanguageContext): string | null | Promise<string | null> {
            if (!ctx.display) return null;
            const state = stateOf(ctx.host);
            const waiting = state.waiting;
            if (!ctx.open) {
                // The end of the chart that was arriving: its waiting frame is not drawn, and
                // its last drawing is not followed by an entrance animation.
                const streamed = state.started !== null && ctx.source.startsWith(state.started);
                if (streamed) {
                    waiting?.answer(null);
                    state.waiting = null;
                    state.started = null;
                    state.drawn = null;
                }
                const chart = parseFence(ctx.source, false, maxPoints);
                if (!chart) return failed(ctx);
                return charts.chartOf().then(() => chartMarkup(chart, localeOf(ctx.config), { still: streamed }));
            }
            // A newer source supersedes the one still waiting.
            waiting?.answer(null);
            state.waiting = null;
            if (!progressive) return null;
            // A chart's first frame: the box it will be drawn in, at once, in place of its
            // JSON — and Chart.js on its way meanwhile.
            if (state.started === null || !ctx.source.startsWith(state.started)) {
                state.started = ctx.source;
                state.drawn = null;
                charts.warm();
                return pendingMarkup();
            }
            return new Promise<string | null>((answer) => {
                state.waiting = { ctx, answer };
                schedule(state);
            });
        },
        relabel(drawing: HTMLElement, ctx: AparteCodeLanguageContext): void {
            relabelCharts(drawing, ctx.config, options);
            // Called once the markup is in the page: the canvas is there to draw on. Nodes
            // core MOVED keep their chart; `activate` skips a canvas that has one.
            charts.activate(drawing);
        },
    };
}

/** A tool's result as data: its `structuredContent`, else its text read as JSON. */
function resultOf(segment: AparteToolCallSegment): unknown {
    if (segment.structuredResult !== undefined) return segment.structuredResult;
    if (typeof segment.result !== 'string') return undefined;
    try { return JSON.parse(segment.result); } catch { return undefined; }
}

function createToolRenderer(charts: Charts, options: ChartjsOptions, config: AparteConfig): AparteToolRenderer {
    const maxPoints = options.maxPoints ?? MAX_POINTS;
    /** What each element was last drawn from, so an update that changes nothing keeps the chart. */
    const drawnFrom = new WeakMap<HTMLElement, string>();

    const note = (attr: string): string => `<span class="aparte-chartjs-note" role="note" ${attr}></span>`;

    /** Draw the call into `element`; `false` when it already shows this. */
    const draw = (element: HTMLElement, segment: AparteToolCallSegment): boolean => {
        const status = segment.status;
        const signature = status === 'resolved' ? `resolved|${segment.result ?? ''}|${JSON.stringify(segment.structuredResult ?? null)}` : status;
        if (drawnFrom.get(element) === signature) return false;
        drawnFrom.set(element, signature);
        charts.releaseIn(element);
        element.removeAttribute('aria-busy');
        let html: string;
        if (status === 'pending') {
            element.setAttribute('aria-busy', 'true');
            charts.warm();
            html = pendingMarkup();
        } else if (status === 'awaiting-approval') {
            html = note('data-aparte-chartjs-waiting');
        } else if (status === 'resolved') {
            let chart: ChartjsConfig | null = null;
            try {
                const result = resultOf(segment);
                chart = readChartConfig(options.map ? options.map(result, segment.toolCall?.input ?? {}) : result, maxPoints);
            } catch (error) {
                warnOnce(options, 'the `map` given for a chart tool threw.', error);
            }
            html = chart
                ? chartMarkup(chart, localeOf(config))
                : `<span class="aparte-code-error" role="note" data-aparte-chartjs-error></span>`;
        } else {
            html = note('data-aparte-chartjs-unavailable');
        }
        element.innerHTML = html;
        relabelCharts(element, config, options);
        return true;
    };

    return {
        render(segment) {
            const element = document.createElement('div');
            element.className = 'aparte-chartjs-tool';
            draw(element, segment);
            return element;
        },
        setup(element) {
            ensureStyles(element);
            charts.activate(element);
        },
        update(element, segment) {
            if (!draw(element, segment)) return;
            ensureStyles(element);
            charts.activate(element);
        },
        relabel(element) {
            relabelCharts(element, config, options);
        },
        cleanup(element) {
            charts.releaseIn(element);
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
    media?.addEventListener('change', changed);
    return {
        add: (root) => observer.observe(root, init),
        stop: () => { observer.disconnect(); media?.removeEventListener('change', changed); },
    };
}
