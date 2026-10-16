/** The shape of BarChart.astro's rows, importable from plain TypeScript (src/lib/weights.ts). */

export interface BarShare {
    /** Legend key: `own` is the row's JavaScript, `css` its stylesheet, `framework` what it needs on top. */
    kind: 'own' | 'css' | 'framework';
    value: number;
}

export interface BarRow {
    label: string;
    /** A link to the row's subject, optional. */
    href?: string;
    shares: BarShare[];
    /** One short line under the bar: what is counted. */
    note?: string;
    /** The row the chart is about, drawn in the accent. */
    highlight?: boolean;
}
