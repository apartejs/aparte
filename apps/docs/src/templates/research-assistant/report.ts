/**
 * The report pane: the document the agent wrote with create_artifact, rendered for reading.
 *
 * The artifact is Markdown, so the pane renders it through the library's own Markdown provider
 * (sanitised, like every reply) inside `.aparte-content`, the prose recipe the bubbles wear.
 * Its fenced blocks are then drawn the way a reply's are (`renderCodeLanguages`): the
 * ```echarts chart by @aparte/plugin-echarts, in the chat's colours, following the theme.
 */
import { aparteGlobalConfig, copyText, renderCodeLanguages } from '@aparte/core';

export interface Report {
    title?: string;
    content: string;
}

/** How many entries the report's numbered reference list has. */
export function countSources(markdown: string): number {
    return (markdown.match(/^\d+\. \[/gm) ?? []).length;
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
                renderCodeLanguages(article);
            }
            if (heading) heading.textContent = report?.title ?? 'Report';
            if (meta && report) meta.textContent = `${countSources(report.content)} sources`;
            if (bar) bar.hidden = !report;
            if (empty) empty.hidden = !!report;
            pane.scrollTop = 0;
        },
    };
}
