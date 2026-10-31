/**
 * The chat's look as an ECharts theme.
 *
 * A theme, not values merged into the option, because that is how ECharts layers a look:
 * it sits under every component of its kind (each axis, each legend, each series of a
 * type), and anything the option sets itself wins over it, by ECharts' own rule. And
 * `setTheme()` swaps it on a chart already drawn, so a light/dark switch recolours the
 * chart without drawing it again from nothing.
 */
import { SAFE_FONT } from './option.js';

/** The chat's colours and font, resolved, as the theme is built from them. */
export interface EChartsTokens {
    /** Text: titles, legends, values (`--aparte-text`). */
    text: string;
    /** Quieter text: axis labels, subtitles (`--aparte-text-muted`). */
    muted: string;
    /** Lines: axes, grid, the tooltip's edge (`--aparte-border`). */
    border: string;
    /** The tooltip's ground (`--aparte-surface-1`). */
    surface: string;
    /** The page behind the chart (`--aparte-bg`): decides dark or light, and the gap between slices. */
    background: string;
    /** The first series' colour (`--aparte-primary`). */
    primary: string;
    /** The chat's font (`--aparte-font-family`). Left out, ECharts' own. */
    fontFamily?: string;
    /** Dark or light; left out, read from `background`. */
    dark?: boolean;
}

/**
 * The series colours after the primary, light and dark. They are the eight hues of a
 * palette validated for colour-vision deficiency (adjacent pairs ≥ 8 ΔE in OKLab ×100 under
 * protanopia, deuteranopia and tritanopia, ≥ 15 for full-colour vision), each stepped once for
 * a light ground and once for a dark one — so a series stays the same hue across the switch
 * and keeps 3:1 against the dark ground. Not cycled from a generator: a ninth series repeats.
 */
export const ECHARTS_SERIES_HUES = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;

/** `#rgb`, `#rrggbb`, `rgb()` / `rgba()` as 0–255 channels; `null` for anything else. */
export function rgbOf(color: string): [number, number, number] | null {
    const c = color.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(c)?.[1];
    if (hex) {
        const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex;
        return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
    }
    const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
}

/** sRGB → OKLab: the space where a distance is a difference a person sees. */
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
    const lin = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/** Whether a ground is dark: its OKLab lightness under 0.6. An unreadable colour reads light. */
export function isDark(color: string): boolean {
    const rgb = rgbOf(color);
    return rgb ? oklab(rgb)[0] < 0.6 : false;
}

/**
 * The series colours: the chat's primary first, then the validated hues. The primary takes
 * the place of the hue nearest to it, and the ring is read on from there — so a brass
 * primary does not sit beside the yellow it nearly is, and every pair that ends up side by
 * side is one the validation already passed.
 */
export function echartsPalette(primary: string, dark = false): string[] {
    const ring: string[] = [...(dark ? ECHARTS_SERIES_HUES.dark : ECHARTS_SERIES_HUES.light)];
    const rgb = rgbOf(primary);
    if (!rgb) return [primary, ...ring];
    const p = oklab(rgb);
    // Nearest by hue — a brass is the yellow's twin however much darker it is — unless the
    // primary is all but grey, where a hue means nothing and the plain distance decides.
    const grey = Math.hypot(p[1], p[2]) < 0.04;
    const hueOf = (c: number[]): number => Math.atan2(c[2]!, c[1]!);
    const distance = (q: number[]): number => {
        if (grey) return Math.hypot(p[0] - q[0]!, p[1] - q[1]!, p[2] - q[2]!);
        const d = Math.abs(hueOf(p) - hueOf(q));
        return Math.min(d, 2 * Math.PI - d);
    };
    let nearest = 0;
    let best = Infinity;
    ring.forEach((hue, i) => {
        const d = distance(oklab(rgbOf(hue)!));
        if (d < best) { best = d; nearest = i; }
    });
    return [primary, ...ring.slice(nearest + 1), ...ring.slice(0, nearest)];
}

/**
 * The ECharts theme the chat's tokens make: text, muted axis labels, grid and axis lines,
 * a transparent ground, the chat's font, the series palette, a tooltip on the chat's
 * surface. Hand it to `init` or `setTheme`; whatever the option sets itself wins over it.
 * Pure: the same tokens make the same theme, in Node as in a browser.
 */
export function echartsTheme(tokens: EChartsTokens): Record<string, unknown> {
    const { text, muted, border, surface, background } = tokens;
    const dark = tokens.dark ?? isDark(background);
    const font = tokens.fontFamily && SAFE_FONT.test(tokens.fontFamily) ? { fontFamily: tokens.fontFamily } : {};
    const axis = (splitLine: boolean) => ({
        axisLine: { lineStyle: { color: border } },
        axisTick: { lineStyle: { color: border } },
        axisLabel: { color: muted },
        nameTextStyle: { color: muted },
        splitLine: { show: splitLine, lineStyle: { color: border } },
        minorSplitLine: { lineStyle: { color: border } },
        splitArea: { areaStyle: { color: ['transparent', surface] } },
    });
    return {
        darkMode: dark,
        color: echartsPalette(tokens.primary, dark),
        backgroundColor: 'transparent',
        textStyle: { color: text, ...font },
        title: { textStyle: { color: text }, subtextStyle: { color: muted } },
        legend: {
            textStyle: { color: text },
            pageTextStyle: { color: muted },
            pageIconColor: text,
            pageIconInactiveColor: border,
            inactiveColor: border,
        },
        tooltip: { backgroundColor: surface, borderColor: border, textStyle: { color: text } },
        axisPointer: {
            lineStyle: { color: muted },
            crossStyle: { color: muted },
            label: { color: surface, backgroundColor: muted },
        },
        // A category axis draws no grid by default, in ECharts as here.
        categoryAxis: axis(false),
        valueAxis: axis(true),
        logAxis: axis(true),
        timeAxis: axis(true),
        radar: {
            axisName: { color: muted },
            axisLine: { lineStyle: { color: border } },
            splitLine: { lineStyle: { color: border } },
            splitArea: { areaStyle: { color: ['transparent', surface] } },
        },
        dataZoom: {
            borderColor: border,
            textStyle: { color: muted },
            handleStyle: { color: surface, borderColor: muted },
            moveHandleStyle: { color: muted },
            dataBackground: { lineStyle: { color: muted }, areaStyle: { color: border } },
        },
        visualMap: { textStyle: { color: text } },
        timeline: {
            lineStyle: { color: border },
            label: { color: muted },
            controlStyle: { color: muted, borderColor: muted },
        },
        toolbox: { iconStyle: { borderColor: muted } },
        calendar: {
            itemStyle: { color: 'transparent', borderColor: border },
            splitLine: { lineStyle: { color: muted } },
            dayLabel: { color: muted },
            monthLabel: { color: muted },
            yearLabel: { color: text },
        },
        gauge: { title: { color: muted }, detail: { color: text }, axisLabel: { color: muted } },
        // The gap between two slices is the ground showing through.
        pie: { itemStyle: { borderColor: background } },
        funnel: { itemStyle: { borderColor: background } },
        sunburst: { itemStyle: { borderColor: background } },
        map: { label: { color: text }, itemStyle: { areaColor: surface, borderColor: border } },
        geo: { label: { color: text }, itemStyle: { areaColor: surface, borderColor: border } },
    };
}

/** The tokens a chart reads, with the colour each falls back to. */
const TOKENS = {
    text: ['--aparte-text', '#1a1a1a'],
    muted: ['--aparte-text-muted', '#666666'],
    border: ['--aparte-border', '#d0d0d0'],
    surface: ['--aparte-surface-1', '#fafafa'],
    background: ['--aparte-bg', '#ffffff'],
    primary: ['--aparte-primary', '#3b5bdb'],
} as const;

/**
 * The tokens as they apply at `el`, each resolved by the browser. A token may be
 * `color-mix()` or `oklch()`, which ECharts' colour parser cannot read (it derives hover and
 * label colours from them), so each is painted on a one-pixel canvas and read back as
 * `rgb()` — whatever the browser's own serialisation of it.
 */
export function readTokens(el: HTMLElement): EChartsTokens {
    const style = getComputedStyle(el);
    const probe = document.createElement('span');
    probe.style.display = 'none';
    el.appendChild(probe);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const paint = canvas.getContext?.('2d', { willReadFrequently: true }) ?? null;
    const read = (token: string, fallback: string): string => {
        probe.style.color = `var(${token}, ${fallback})`;
        const computed = getComputedStyle(probe).color || fallback;
        if (!paint) return computed;
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = '#000';
        paint.fillStyle = computed;
        paint.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
        return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${((a ?? 0) / 255).toFixed(3)})`;
    };
    try {
        const tokens = Object.fromEntries(
            Object.entries(TOKENS).map(([name, [token, fallback]]) => [name, read(token, fallback)]),
        ) as unknown as EChartsTokens;
        const font = style.getPropertyValue('--aparte-font-family').trim() || style.fontFamily;
        if (font) tokens.fontFamily = font;
        return tokens;
    } finally {
        probe.remove();
    }
}
