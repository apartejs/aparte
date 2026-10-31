/**
 * How the research assistant's turn reads in the transcript. Core draws every tool call as one
 * quiet row; this file replaces that row for the two tools whose result is worth seeing, and
 * leaves read_page on the default row with a summary of its own:
 *
 * - web_search: its results as @aparte/plugin-cards' link card, one row a source.
 * - create_artifact: a receipt for the report, with a button that opens it in the pane.
 * - read_page: the default row, naming the page it read.
 * - reasoning: "Thought for 2.1s" once the plan is written, in place of "Thinking".
 *
 * Every renderer returns DOM built with textContent, never a string of markup: the tool's input
 * and result are the model's, and a string would be inserted as HTML.
 */
import {
    aparteGlobalConfig,
    getSegmentRenderer,
    isSegmentSettled,
    registerDefaultRenderers,
    registerSegmentRenderer,
    segmentDuration,
    type AparteThinkingSegment,
    type AparteToolCallSegment,
} from '@aparte/core';
import { artifactFromToolCall, type ArtifactSegment } from '@aparte/plugin-artifacts';
import { setupLinkCard } from '@aparte/plugin-cards/link';
import { countSources } from './report';
import { domainOf } from './sources';
import type { SearchResult } from './tools';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** The line above a tool's body: a glyph, what happened, and a spinner while it runs. */
function toolHead(icon: Node, words: (string | Node)[], running: boolean): HTMLElement {
    const head = el('p', 'research-tool__head');
    const glyph = el('span', 'research-tool__icon');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.append(icon);
    head.append(glyph, ...words);
    if (running) {
        const spinner = el('span', 'aparte-spinner aparte-spinner--sm');
        spinner.setAttribute('aria-hidden', 'true');
        head.append(spinner);
    }
    return head;
}

/** The report the agent wrote, as a receipt in the transcript: its title and a way back to it. */
function renderReceipt(segment: AparteToolCallSegment, open: (artifact: ArtifactSegment) => void): HTMLElement {
    const artifact = artifactFromToolCall(segment);
    const root = el('div', 'research-tool');
    if (segment.status === 'pending') {
        const icon = el('aparte-icon', '');
        icon.setAttribute('name', 'file');
        root.append(toolHead(icon, ['Writing the report'], true));
        return root;
    }
    const card = el('div', 'aparte-card research-receipt');
    const icon = el('span', 'research-receipt__icon');
    const glyph = el('aparte-icon', 'aparte-icon--lg');
    glyph.setAttribute('name', 'file');
    icon.append(glyph);
    const text = el('div', 'research-receipt__text');
    text.append(
        el('span', 'research-receipt__title', artifact.title ?? 'Report'),
        el('span', 'research-receipt__meta', `Report · ${countSources(artifact.content)} sources`),
    );
    const button = el('button', 'aparte-btn aparte-btn--sm aparte-btn--surface', 'Open');
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${artifact.title ?? 'the report'}`);
    button.addEventListener('click', () => open(artifact));
    card.append(icon, text, button);
    root.append(card);
    return root;
}

/** "Thinking" → "Thought for 2.1s", once the span is closed. Core measures it and draws nothing. */
function writeDuration(host: HTMLElement, segment: AparteThinkingSegment): void {
    if (!isSegmentSettled(segment)) return;
    const ms = segmentDuration(segment);
    const label = host.querySelector('.aparte-thinking-label');
    if (!label) return;
    label.textContent = ms === undefined ? 'Thought' : ms < 1000 ? 'Thought for <1s' : `Thought for ${(ms / 1000).toFixed(1)}s`;
}

export function registerResearchRenderers(openReport: (artifact: ArtifactSegment) => void): void {
    // The results as @aparte/plugin-cards' link card, one row a page: the site's mark, the
    // title, the site. Its heading names the search, the call's query while it runs.
    setupLinkCard({
        tool: 'web_search',
        map: (result: SearchResult) => ({ title: `Searched “${result.query}”`, links: result.results }),
        mapInput: (input) => ({ title: `Searching “${String(input['query'] ?? '')}”` }),
        variant: 'compact',
    });
    aparteGlobalConfig.registerToolRenderer('create_artifact', { render: (segment) => renderReceipt(segment, openReport) });
    aparteGlobalConfig.registerToolSummary('read_page', (segment) => {
        const url = String(segment.toolCall.input['url'] ?? '');
        return domainOf(url);
    });

    // The built-in reasoning block, with its label rewritten: its root, `setup` and `update`
    // are kept, because the bubble patches the block in place through them. The built-ins
    // are registered first: until then there is no `thinking` renderer to wrap.
    registerDefaultRenderers();
    const thinking = getSegmentRenderer('thinking');
    if (!thinking) return;
    registerSegmentRenderer<AparteThinkingSegment>({
        type: 'thinking',
        render(segment) {
            const out = thinking.render(segment);
            const host = typeof out === 'string' ? (document.createRange().createContextualFragment(out).firstElementChild as HTMLElement) : out;
            writeDuration(host, segment);
            return host;
        },
        setup: (element, segment) => thinking.setup?.(element, segment),
        update(element, segment) {
            thinking.update?.(element, segment);
            writeDuration(element, segment);
        },
    });
}
