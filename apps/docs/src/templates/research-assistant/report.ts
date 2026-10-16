/**
 * The report pane: the document the agent wrote with create_artifact, rendered for reading.
 *
 * The artifact is Markdown, so the pane renders it through the library's own Markdown provider
 * (sanitised, like every reply) inside `.aparte-content`, the prose recipe the bubbles wear.
 * One block is the app's to draw: a fenced `chart` block, whose JSON the pane turns into an SVG
 * bar chart coloured by tokens, so it follows the theme.
 */
import { aparteGlobalConfig, copyText } from '@aparte/core';

export interface Report {
    title?: string;
    content: string;
}

interface ChartData {
    /** What a value is counted in, after the number: `49.6k`. */
    unit: string;
    caption: string;
    labels: string[];
    values: number[];
}

/** How many entries the report's numbered reference list has. */
export function countSources(markdown: string): number {
    return (markdown.match(/^\d+\. \[/gm) ?? []).length;
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
}

function isChartData(value: unknown): value is ChartData {
    const v = value as Partial<ChartData> | null;
    return !!v && typeof v.unit === 'string' && typeof v.caption === 'string' && Array.isArray(v.labels) && Array.isArray(v.values)
        && v.values.every((n) => typeof n === 'number') && v.labels.length === v.values.length;
}

/**
 * A bar chart of one series: recessive grid, rounded bar ends, the peak and the low labelled.
 * Drawn at the width it is shown at, so its 11px text stays 11 CSS px on a phone and a wide pane.
 */
function barChart({ unit, caption, labels, values }: ChartData, width: number): SVGSVGElement {
    const height = 232;
    const plot = { left: 40, right: width - 8, top: 22, bottom: height - 28 };
    const step = Math.max(10, Math.ceil(Math.max(...values) / 50) * 10);
    const ceiling = Math.ceil(Math.max(...values) / step) * step;
    const y = (v: number): number => plot.bottom - (v / ceiling) * (plot.bottom - plot.top);
    const slot = (plot.right - plot.left) / values.length;
    const bar = Math.min(28, slot - 8);
    const peak = values.indexOf(Math.max(...values));
    const low = values.indexOf(Math.min(...values));

    const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'research-chart__svg', role: 'img' });
    chart.setAttribute(
        'aria-label',
        `Bar chart. ${caption}: highest ${values[peak]}${unit} in ${labels[peak]}, lowest ${values[low]}${unit} in ${labels[low]}.`,
    );

    for (let v = 0; v <= ceiling; v += step) {
        chart.append(
            svg('line', { x1: plot.left, x2: plot.right, y1: y(v), y2: y(v), class: v === 0 ? 'research-chart__base' : 'research-chart__grid' }),
            svg('text', { x: plot.left - 8, y: y(v) + 4, class: 'research-chart__axis', 'text-anchor': 'end' }, String(v)),
        );
    }

    values.forEach((value, i) => {
        const x = plot.left + slot * i + (slot - bar) / 2;
        const top = y(value);
        const r = Math.min(4, (plot.bottom - top) / 2);
        // A bar with its two top corners rounded and its foot square on the baseline.
        const d = `M${x},${plot.bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${plot.bottom} Z`;
        const path = svg('path', { d, class: 'research-chart__bar' });
        path.append(svg('title', {}, `${labels[i]}: ${value}${unit}`));
        chart.append(path, svg('text', { x: x + bar / 2, y: plot.bottom + 18, class: 'research-chart__axis', 'text-anchor': 'middle' }, labels[i] ?? ''));
        if (i === peak || i === low) {
            chart.append(svg('text', { x: x + bar / 2, y: top - 6, class: 'research-chart__value', 'text-anchor': 'middle' }, String(value)));
        }
    });
    return chart;
}

/** A chart's data and the figure it is drawn in, kept so it can be redrawn when the pane resizes. */
interface DrawnChart {
    data: ChartData;
    figure: HTMLElement;
}

/** The width a chart is drawn at: its figure's, within what a bar chart of twelve months can use. */
const chartWidth = (figure: HTMLElement): number => Math.max(280, Math.min(720, Math.round(figure.clientWidth)));

function paintChart({ data, figure }: DrawnChart): void {
    figure.querySelector('svg')?.remove();
    figure.prepend(barChart(data, chartWidth(figure)));
}

/** Each fenced `chart` block, replaced by its chart. A block that does not parse stays as code. */
function drawCharts(article: HTMLElement): DrawnChart[] {
    const drawn: DrawnChart[] = [];
    for (const code of article.querySelectorAll<HTMLElement>('pre > code.language-chart')) {
        let data: unknown;
        try {
            data = JSON.parse(code.textContent ?? '');
        } catch {
            continue;
        }
        if (!isChartData(data)) continue;
        const figure = document.createElement('figure');
        figure.className = 'research-chart';
        const caption = document.createElement('figcaption');
        caption.className = 'research-chart__caption';
        caption.textContent = data.caption;
        figure.append(caption);
        code.parentElement?.replaceWith(figure);
        const chart = { data, figure };
        paintChart(chart);
        drawn.push(chart);
    }
    return drawn;
}

export interface ReportPane {
    show(report: Report | null): void;
}

/** Wire the pane's elements; `show` renders a report into it, or its empty state for `null`. */
export function createReportPane(pane: HTMLElement): ReportPane {
    const article = pane.querySelector<HTMLElement>('.research-report');
    const empty = pane.querySelector<HTMLElement>('.research-pane__empty');
    const bar = pane.querySelector<HTMLElement>('.research-pane__bar');
    const heading = pane.querySelector<HTMLElement>('.research-pane__title');
    const meta = pane.querySelector<HTMLElement>('.research-pane__meta');
    const status = pane.querySelector<HTMLElement>('.research-pane__status');
    const copy = pane.querySelector<HTMLButtonElement>('.research-pane__copy');
    let current: Report | null = null;
    let charts: DrawnChart[] = [];

    // A pane dragged wider, or a phone turned, redraws the charts at the new width. A pane that
    // is hidden measures 0 and is skipped; it redraws when it is shown.
    if (article) {
        new ResizeObserver(() => {
            if (article.clientWidth) for (const chart of charts) paintChart(chart);
        }).observe(article);
    }

    copy?.addEventListener('click', () => {
        if (!current) return;
        void copyText(current.content).then(() => {
            copy.textContent = 'Copied';
            if (status) status.textContent = 'Report copied as Markdown';
            setTimeout(() => {
                copy.textContent = 'Copy Markdown';
                if (status) status.textContent = '';
            }, 1600);
        });
    });

    return {
        show(report) {
            current = report;
            if (article) {
                article.innerHTML = report ? aparteGlobalConfig.renderMarkdown(report.content) : '';
                article.hidden = !report;
                charts = drawCharts(article);
            }
            if (heading) heading.textContent = report?.title ?? 'Report';
            if (meta && report) meta.textContent = `${countSources(report.content)} sources`;
            if (bar) bar.hidden = !report;
            if (empty) empty.hidden = !!report;
            pane.scrollTop = 0;
        },
    };
}
