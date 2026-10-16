/**
 * The weight of a working chat, from scripts/measure-bundles.mjs (run by hand: it downloads every
 * library), shaped for the site's two readers of it: the home's compact chart and the compare
 * page's full one. Every bar is the JavaScript and the CSS a page downloads at startup; a React
 * library's React is its own share. Lightest first.
 */
import type { BarRow } from '../components/home/bar-chart';
import bundles from '../data/bundle-sizes.json';

export { bundles };

type Library = (typeof bundles.libraries)[number];

/** Bytes as the chart prints them: KB of 1,024 bytes, MB above 1,024 KB. */
export const kb = (bytes: number): string =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const css = (lib: Library): number => lib.cssGzip ?? 0;
const sharesOf = (lib: Library, own: number): BarRow['shares'] => [
    { kind: 'own', value: own },
    ...(css(lib) ? [{ kind: 'css' as const, value: css(lib) }] : []),
    ...(lib.frameworkGzip ? [{ kind: 'framework' as const, value: lib.frameworkGzip }] : []),
];

/** "306 KB + 67 KB React": a bar's parts, spoken the way they are drawn. */
const spoken = (lib: Library, own: number): string =>
    sharesOf(lib, own)
        .map((share) => `${kb(share.value)}${share.kind === 'css' ? ' CSS' : share.kind === 'framework' ? ' React' : ''}`)
        .join(' + ');

export interface WeightRow extends BarRow {
    id: string;
    /** The bar's parts in words, e.g. "86 KB + 20 KB CSS". */
    split: string;
    /** Everything the page downloads at startup, JavaScript and CSS. */
    total: number;
}

export const WEIGHTS: WeightRow[] = [...bundles.libraries]
    .sort((a, b) => a.startupGzip + css(a) - (b.startupGzip + css(b)))
    .map((lib) => ({
        id: lib.id,
        label: `${lib.name} ${lib.version}`,
        // The other documented paths to the same UI, measured too, beside what the bar counts.
        note: [lib.note, ...lib.variants.map((variant) => `${sentence(variant.label)}: ${spoken(lib, variant.ownGzip)}.`)].join(' '),
        highlight: lib.id === 'aparte',
        shares: sharesOf(lib, lib.ownGzip),
        split: spoken(lib, lib.ownGzip),
        total: lib.startupGzip + css(lib),
    }));

export function weightOf(id: string): Library {
    const lib = bundles.libraries.find((entry) => entry.id === id);
    if (!lib) throw new Error(`bundle-sizes.json has no "${id}".`);
    return lib;
}

const longDate = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const MEASURED_ON = longDate(`${bundles.measuredOn}T12:00:00Z`);
export const PINNED_BEFORE = longDate(bundles.before);
