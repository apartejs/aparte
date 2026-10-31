/**
 * A small line chart in SVG, with no dependency: the temperature over the next hours, a
 * price over a day. Built with `createElementNS` from numbers only, so a tool's values
 * never reach a parser. Stretched to its box (`preserveAspectRatio="none"`), the stroke
 * kept at its width by `vector-effect`.
 */
const SVG = 'http://www.w3.org/2000/svg';

export interface SparklineOptions {
    /** Extra class on the `<svg>`. */
    className?: string;
    /** Fill the area under the line (a gradient from the stroke's colour, in the sheet). */
    area?: boolean;
    /** Padding above and below the line, as a share of the height (0.15 by default). */
    pad?: number;
    /** The value range to scale against, when several charts must share one. */
    range?: [number, number];
}

/** The points of a smooth line through `values`, in a 100 × 40 box. */
export function sparklinePath(values: number[], { pad = 0.15, range }: SparklineOptions = {}): { line: string; area: string; points: Array<[number, number]> } {
    // A gap (`null`, `NaN`) is left out: written into the path it would stop the drawing there.
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return { line: '', area: '', points: [] };
    // One value is a level, drawn flat across the box: a single point would draw nothing.
    const series = finite.length === 1 ? [finite[0]!, finite[0]!] : finite;
    const lo = range ? range[0] : Math.min(...finite);
    const hi = range ? range[1] : Math.max(...finite);
    const span = hi - lo;
    const h = 40;
    const step = 100 / (series.length - 1);
    // A series that does not move is a flat line through the middle, not along the floor.
    const points = series.map((v, i): [number, number] => [
        i * step,
        span === 0 ? h / 2 : h - (pad * h + ((v - lo) / span) * (h - 2 * pad * h)),
    ]);
    // A Catmull-Rom curve through the points, written as cubic Béziers.
    let line = `M${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i]!;
        const p1 = points[i]!;
        const p2 = points[i + 1]!;
        const p3 = points[i + 2] ?? p2;
        const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        line += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    const last = points[points.length - 1]!;
    const area = `${line} L${last[0].toFixed(2)} ${h} L${points[0]![0].toFixed(2)} ${h} Z`;
    return { line, area, points };
}

/** The chart as an `<svg>`; decorative (`aria-hidden`), so put the numbers in text beside it. */
export function sparkline(values: number[], options: SparklineOptions = {}): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 100 40');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('aparte-rich-card__sparkline');
    // The caller's own class (its own prefix is its business), added beside ours.
    for (const name of options.className?.split(/\s+/) ?? []) if (name) svg.classList.add(name);
    const { line, area } = sparklinePath(values, options);
    if (!line) return svg;
    if (options.area) {
        const fill = document.createElementNS(SVG, 'path');
        fill.setAttribute('d', area);
        fill.setAttribute('class', 'aparte-rich-card__sparkline-area');
        svg.append(fill);
    }
    const stroke = document.createElementNS(SVG, 'path');
    stroke.setAttribute('d', line);
    stroke.setAttribute('class', 'aparte-rich-card__sparkline-line');
    stroke.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(stroke);
    return svg;
}
