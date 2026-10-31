/**
 * The series colours: the chat's `--aparte-primary` first, then a fixed set of hues.
 *
 * The fixed set is the eight hues of a categorical palette validated for a chart surface
 * in BOTH modes (OKLCH lightness 0.43–0.77 on light and 0.48–0.67 on dark, chroma
 * ≥ 0.1, ≥ 3:1 against a white and a near-black surface), each taken at the one step that
 * passes both, so the same eight read on a light and a dark chat without a second table:
 *
 *   blue #2a78d6 · orange #d95926 · aqua #199e70 · yellow #c98500 ·
 *   magenta #d55181 · green #008300 · violet #9085e9 · red #e34948
 *
 * The primary is the app's, so the order after it cannot be fixed in advance: a brass
 * primary sits on top of the orange and the yellow, a blue one on the blue. So the order
 * is CHOSEN once per primary, by the same measures a palette validator applies (OKLab
 * ΔE×100): a hue is dropped when it is within 15 of the primary under normal vision (a
 * series that reads as the brand's), and each next series is the first remaining hue
 * at least 15 from the one before it under normal vision and at least 8 under simulated
 * protanopia and deuteranopia (Machado 2009, severity 1) — the pairs a stacked bar or a
 * legend puts side by side. Measured over thirteen primaries (aparté's brass in both
 * modes, Tailwind's blue/red/green/violet/teal/pink/orange, black, grey): every one
 * passes those checks, with five to eight hues.
 *
 * A series past the last hue is drawn in the muted text colour, never a recycled hue:
 * a ninth series painted like the first would claim to BE the first. A chart with that
 * many series wants grouping ("Other"), not more colours.
 */

/** The fixed hues, in order of preference. */
export const SERIES_HUES = ['#2a78d6', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e34948'] as const;

const NORMAL_MIN = 15;
const CVD_MIN = 8;
const MAX_SERIES = 8;

type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb`, `rgb()`/`rgba()` → 0–255 channels; `null` for anything else. */
export function parseColor(color: string): Rgb | null {
    const value = color.trim().toLowerCase();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];
    if (hex) {
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
    }
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return null;
}

/** `color` at `alpha`, or `color` itself when it cannot be read (a keyword, `oklch()`…). */
export function withAlpha(color: string, alpha: number): string {
    const rgb = parseColor(color);
    return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : color;
}

const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Machado, Oliveira & Fernandes (2009), severity 1, on linear sRGB. */
const CVD: Record<'protan' | 'deutan', number[][]> = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};

function oklab([r, g, b]: number[]): number[] {
    const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
    const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
    const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

/** OKLab distance ×100 between two colours, as seen normally or under a colour-vision deficiency. */
function distance(a: Rgb, b: Rgb, kind?: 'protan' | 'deutan'): number {
    const see = (c: Rgb): number[] => {
        const lin = c.map(toLinear);
        if (!kind) return oklab(lin);
        return oklab(CVD[kind].map((row) => Math.min(1, Math.max(0, row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!))));
    };
    const [x, y] = [see(a), see(b)];
    return 100 * Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

const cache = new Map<string, string[]>();

/**
 * The series colours for a chat whose primary is `primary`: the primary, then the fixed
 * hues in the order chosen for it (see the module's comment). A primary that cannot be
 * read as a colour is kept first, followed by the fixed hues as they are.
 */
export function seriesPalette(primary: string): string[] {
    const hit = cache.get(primary);
    if (hit) return hit;
    const brand = parseColor(primary);
    let palette: string[];
    if (!brand) {
        palette = [primary, ...SERIES_HUES].slice(0, MAX_SERIES);
    } else {
        palette = [primary];
        let previous = brand;
        const left = SERIES_HUES.map((hex) => ({ hex, rgb: parseColor(hex)! }))
            .filter(({ rgb }) => distance(rgb, brand) >= NORMAL_MIN);
        while (palette.length < MAX_SERIES) {
            const i = left.findIndex(({ rgb }) => distance(rgb, previous) >= NORMAL_MIN
                && Math.min(distance(rgb, previous, 'protan'), distance(rgb, previous, 'deutan')) >= CVD_MIN);
            if (i < 0) break;
            const [next] = left.splice(i, 1);
            palette.push(next!.hex);
            previous = next!.rgb;
        }
    }
    if (cache.size > 32) cache.clear();
    cache.set(primary, palette);
    return palette;
}
