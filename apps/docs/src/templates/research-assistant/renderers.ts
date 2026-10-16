/**
 * How the research assistant's turn reads in the transcript. Core draws every tool call as one
 * quiet row; this file replaces that row for the two tools whose result is worth seeing, and
 * leaves read_page on the default row with a summary of its own:
 *
 * - web_search: the query, then its results as source cards (title, domain, snippet).
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
import { searchIcon } from '@aparte/core/icons';
import { artifactFromToolCall, type ArtifactSegment } from '@aparte/plugin-artifacts';
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

function searchGlyph(): Node {
    // A static string from core's extended icon set, not model output.
    return document.createRange().createContextualFragment(searchIcon);
}

function sourceCard(result: SearchResult['results'][number]): HTMLLIElement {
    const card = el('li', 'aparte-card research-source');
    const domain = domainOf(result.url);
    const link = el('a', 'research-source__title', result.title);
    link.href = result.url;
    link.target = '_blank';
    link.rel = 'noopener';
    const site = el('span', 'research-source__site');
    const mark = el('span', 'aparte-avatar aparte-avatar--xs aparte-avatar--square', domain.charAt(0).toUpperCase());
    mark.setAttribute('aria-hidden', 'true');
    site.append(mark, domain);
    card.append(site, link, el('p', 'research-source__snippet', result.snippet));
    return card;
}

function renderSearch(segment: AparteToolCallSegment): HTMLElement {
    const root = el('div', 'research-tool research-search');
    const query = String(segment.toolCall.input['query'] ?? '');
    const quoted = el('q', 'research-tool__query', query);
    if (segment.status === 'pending') {
        root.append(toolHead(searchGlyph(), ['Searching ', quoted], true));
        return root;
    }
    const found = (segment.structuredResult as SearchResult | undefined)?.results ?? [];
    if (segment.status !== 'resolved') {
        root.append(toolHead(searchGlyph(), ['Search stopped: ', quoted], false));
        return root;
    }
    const count = el('span', 'research-tool__meta', found.length === 1 ? '1 result' : `${found.length} results`);
    root.append(toolHead(searchGlyph(), ['Searched ', quoted, count], false));
    if (found.length) {
        const list = el('ul', 'research-search__results');
        list.setAttribute('aria-label', `Results for ${query}`);
        list.append(...found.map(sourceCard));
        root.append(list);
    }
    return root;
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
    aparteGlobalConfig.registerToolRenderer('web_search', { render: renderSearch });
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
