/**
 * The chat's look, as a Chart.js config: the colours and the font a chart takes from the
 * chat's tokens wherever its config does not set its own.
 */
import type { ChartjsConfig } from './source.js';
import { seriesPalette, withAlpha } from './palette.js';

/** The chat's tokens a chart is drawn in, as colours a canvas reads. */
export interface ChartjsTokens {
    /** Text: titles, legends, point labels (`--aparte-text`). */
    text: string;
    /** Quieter text: axis ticks and titles, subtitles (`--aparte-text-muted`). */
    muted: string;
    /** Grid and axis lines, the tooltip's border (`--aparte-border`). */
    border: string;
    /** The tooltip's ground (`--aparte-surface-1`). */
    surface: string;
    /** The page behind the chart: the gap between slices, a radial tick's backdrop (`--aparte-bg`). */
    background: string;
    /** The first series (`--aparte-primary`); the others follow it, see `seriesPalette`. */
    primary: string;
    /** The chat's font (`--aparte-font-family`). */
    fontFamily: string;
}

type Obj = Record<string, unknown>;

/** `parent[key]` as an object, made one if it is not set; `null` if it is set to anything else. */
function child(parent: Obj, key: string): Obj | null {
    const value = parent[key];
    if (value === undefined) return (parent[key] = {}) as Obj;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Obj : null;
}

/** Set `key` only where the config left it unset: the config's own values win. */
function fill(target: Obj | null, values: Obj): void {
    if (!target) return;
    for (const [key, value] of Object.entries(values)) if (target[key] === undefined) target[key] = value;
}

/** The scales a chart of this type draws, when its config names none. */
function defaultScales(type: string): string[] {
    if (type === 'radar' || type === 'polarArea') return ['r'];
    if (type === 'pie' || type === 'doughnut') return [];
    return ['x', 'y'];
}

const ARCS = new Set(['pie', 'doughnut', 'polarArea']);

/** One dataset with no colour of its own, given its series colour by its type's convention. */
function colourDataset(dataset: Obj, type: string, colour: string, palette: (i: number) => string, tokens: ChartjsTokens): void {
    if (dataset['backgroundColor'] !== undefined || dataset['borderColor'] !== undefined) return;
    if (ARCS.has(type)) {
        // A slice per point, each its own series; the page's colour between them is the gap.
        const count = (dataset['data'] as unknown[]).length;
        const alpha = type === 'polarArea' ? 0.7 : 1;
        dataset['backgroundColor'] = Array.from({ length: count }, (_, i) => withAlpha(palette(i), alpha));
        dataset['borderColor'] = tokens.background;
        fill(dataset, { borderWidth: 2 });
        return;
    }
    if (type === 'line' || type === 'radar') {
        // The area under a line only shows when `fill` is set; the line itself is solid.
        dataset['borderColor'] = colour;
        dataset['backgroundColor'] = withAlpha(colour, 0.2);
        fill(dataset, { pointBackgroundColor: colour, borderWidth: 2 });
        return;
    }
    dataset['borderColor'] = colour;
    dataset['backgroundColor'] = withAlpha(colour, type === 'bar' ? 0.8 : 0.6);
    if (type === 'bar') fill(dataset, { borderWidth: 1, borderRadius: 4 });
}

/**
 * `config` in the chat's look: a new config, `config` itself untouched. Every value the
 * config sets stays; what it leaves out is taken from `tokens`.
 *
 * - text in `text`, axis ticks and titles in `muted`, grid and axis lines in `border`;
 * - the tooltip on `surface`, with a `border` outline;
 * - the chat's font;
 * - each dataset with no colour of its own in its series colour: the primary, then the
 *   fixed hues (`seriesPalette`) — solid lines and borders, translucent fills for bars,
 *   areas and points; one colour per slice for a pie, a doughnut or a polar area, with
 *   the page's colour between slices. A series past the last hue is drawn in `muted`.
 *
 * The background stays transparent: the chart sits on whatever the bubble is.
 *
 * @example
 * themeChartjsConfig({ type: 'bar', data: { labels: ['a'], datasets: [{ data: [1] }] } }, tokens);
 */
export function themeChartjsConfig(config: ChartjsConfig, tokens: ChartjsTokens): ChartjsConfig {
    // A JSON config copies as JSON; Chart.js also takes ownership of the arrays it is given.
    const out = JSON.parse(JSON.stringify(config)) as ChartjsConfig;
    const options = child(out as unknown as Obj, 'options')!;
    fill(options, { color: tokens.text, borderColor: tokens.border });
    fill(child(options, 'font'), { family: tokens.fontFamily });

    const plugins = child(options, 'plugins');
    if (plugins) {
        const legend = child(plugins, 'legend');
        if (legend) fill(child(legend, 'labels'), { color: tokens.text });
        fill(child(plugins, 'title'), { color: tokens.text });
        fill(child(plugins, 'subtitle'), { color: tokens.muted });
        fill(child(plugins, 'tooltip'), {
            backgroundColor: tokens.surface, titleColor: tokens.text, bodyColor: tokens.text,
            footerColor: tokens.muted, borderColor: tokens.border, borderWidth: 1,
        });
    }

    const scales = child(options, 'scales');
    if (scales) {
        for (const id of defaultScales(out.type)) if (scales[id] === undefined) scales[id] = {};
        for (const id of Object.keys(scales)) {
            const scale = child(scales, id);
            if (!scale) continue;
            fill(child(scale, 'grid'), { color: tokens.border });
            fill(child(scale, 'border'), { color: tokens.border });
            fill(child(scale, 'ticks'), { color: tokens.muted, backdropColor: tokens.background });
            fill(child(scale, 'title'), { color: tokens.muted });
            if (id === 'r' || scale['type'] === 'radialLinear') {
                fill(child(scale, 'angleLines'), { color: tokens.border });
                fill(child(scale, 'pointLabels'), { color: tokens.text });
            }
        }
        // A pie with no scales of its own gets none: every key here is drawn as an axis.
        if (Object.keys(scales).length === 0) delete options['scales'];
    }

    const palette = seriesPalette(tokens.primary);
    const colourAt = (i: number): string => palette[i] ?? tokens.muted;
    out.data.datasets.forEach((dataset, i) => {
        const type = typeof dataset['type'] === 'string' ? dataset['type'] : out.type;
        colourDataset(dataset, type, colourAt(i), colourAt, tokens);
    });
    return out;
}

/** The fallbacks when a token is not set, or cannot be read (no `getComputedStyle`). */
const TOKENS: Record<Exclude<keyof ChartjsTokens, 'fontFamily'>, [string, string]> = {
    text: ['--aparte-text', '#1a1a1a'],
    muted: ['--aparte-text-muted', '#666666'],
    border: ['--aparte-border', '#d0d0d0'],
    surface: ['--aparte-surface-1', '#ffffff'],
    background: ['--aparte-bg', '#ffffff'],
    primary: ['--aparte-primary', '#3b5bdb'],
};

let scratch: CanvasRenderingContext2D | null | undefined;

/**
 * The chat's tokens at `host`, as colours a canvas and Chart.js' colour helpers read. A
 * token may be `color-mix()` or `oklch()`, which Chart.js cannot lighten for a hover, so
 * each is resolved by the browser — a probe's computed colour — and normalised by a
 * canvas to hex or `rgba()`.
 */
export function readTokens(host: HTMLElement): ChartjsTokens {
    const fontFamily = (typeof getComputedStyle === 'function' ? getComputedStyle(host).fontFamily : '')
        || 'system-ui, sans-serif';
    const fallback = Object.fromEntries(Object.entries(TOKENS).map(([k, [, v]]) => [k, v])) as Omit<ChartjsTokens, 'fontFamily'>;
    if (typeof getComputedStyle !== 'function') return { ...fallback, fontFamily };
    const probe = document.createElement('span');
    probe.style.display = 'none';
    host.appendChild(probe);
    scratch ??= document.createElement('canvas').getContext?.('2d') ?? null;
    const read = ([token, fallbackColour]: [string, string]): string => {
        probe.style.color = `var(${token}, ${fallbackColour})`;
        const computed = getComputedStyle(probe).color || fallbackColour;
        if (!scratch) return computed;
        scratch.fillStyle = '#000';
        scratch.fillStyle = computed;
        return String(scratch.fillStyle);
    };
    try {
        return {
            text: read(TOKENS.text), muted: read(TOKENS.muted), border: read(TOKENS.border),
            surface: read(TOKENS.surface), background: read(TOKENS.background), primary: read(TOKENS.primary),
            fontFamily,
        };
    } finally {
        probe.remove();
    }
}

/** Forget the scratch canvas: for tests that swap `getContext`. */
export function resetScratch(): void { scratch = undefined; }
