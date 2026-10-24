/**
 * What a `create_artifact` call shows when there is no artifact to hand over.
 *
 * The card drew from the model's input whatever the call became, so a refused, stopped or
 * failed call still offered its document for download — the result of an action the
 * person had just refused. A call that ran shows the card; one waiting for a decision says
 * so; one that never ran says it was not created. The badge and the title stay, so the
 * person can tell which document this was.
 */
import { escapeHtml, escapeAttr, contextConfig, type AparteToolCallSegment } from '@aparte/core';
import { artifactFromToolCall } from './segment.js';
import { labelForKind } from './shared.js';
import { languageForKind } from './card.js';

/** What the call shows: the card, a block waiting for a decision, or one that says it was not created. */
export type ArtifactCallView = 'card' | 'waiting' | 'not-created';

export function artifactCallView(segment: AparteToolCallSegment): ArtifactCallView {
    if (segment.status === 'awaiting-approval') return 'waiting';
    if (segment.status === 'rejected' || segment.status === 'aborted' || segment.status === 'failed') return 'not-created';
    // `pending` keeps the card: the handler answers at once, and a preview the reader
    // opened while it ran must survive the result.
    return 'card';
}

function stateWord(view: Exclude<ArtifactCallView, 'card'>): string {
    const cfg = contextConfig();
    return view === 'waiting' ? cfg.t('approvalWaiting') : cfg.t('artifactNotCreated');
}

export function artifactStubMarkup(segment: AparteToolCallSegment, view: Exclude<ArtifactCallView, 'card'>): string {
    const art = artifactFromToolCall(segment);
    const kind = (art.artifactType || 'unknown').toLowerCase();
    const title = art.title?.trim() || labelForKind(kind);
    return `
            <div class="aparte-segment aparte-card aparte-art-stub" data-segment-id="${escapeAttr(segment.id)}" data-artifact-type="${escapeAttr(kind)}" data-view="${escapeAttr(view)}">
                <span class="aparte-badge aparte-badge--outline aparte-art-card__kind" data-kind="${escapeAttr(kind)}">${escapeHtml(languageForKind(kind))}</span>
                <span class="aparte-art-card__title">${escapeHtml(title)}</span>
                <span class="aparte-art-stub__state">${escapeHtml(stateWord(view))}</span>
            </div>`;
}

/** The stub's one locale string, for a language switch. */
export function relabelArtifactStub(element: Element, view: Exclude<ArtifactCallView, 'card'>): void {
    const state = element.querySelector('.aparte-art-stub__state');
    if (state) state.textContent = stateWord(view);
}
