/**
 * A tool call and its result — the biggest of the nine, and the one an app most often replaces.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteToolCallSegment,
} from '../../types/index.js';

export const toolCallRenderer: AparteSegmentRenderer<AparteToolCallSegment> = {
    type: 'tool_call',
    render: (segment) => {
        const name = segment.toolCall?.name ?? 'tool';
        const status = segment.status ?? 'pending';
        const toolCallId = segment.toolCall?.id ?? '';

        /*
         * A tool waiting for a person is a STATE of the pill now, not a control.
         *
         * The Approve / Reject buttons were here, and they were the only decision
         * surface in the whole library that lived in the transcript. They are at the
         * composer now, which is where every other request for the user already went —
         * so this is the ANCHOR: the thing you scroll to, and the thing the panel is
         * about. Nothing clickable, no role, no tab stop, no pointer (ratified decision
         * #8: an undeclared affordance is not half-rendered either).
         *
         * It also fixes a defect by construction rather than by guarding: a segment
         * restored from storage used to repaint live buttons wired to a listener that
         * had gone with the page.
         *
         * And removing the branch un-shadows a seam that was said to be missing. It ran
         * BEFORE the per-tool renderer lookup below, so `registerToolRenderer` could
         * never draw anything while a tool awaited approval. The lookup is now first,
         * and a tool renders its own surface at every status.
         */
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        if (customRenderer) {
            const out = customRenderer.render(segment);
            if (out) return out;
        }

        // Status/tool glyphs come from the icon provider (fallbacks: ✓ / ✕ / 🔧)
        // so icon packs and skins restyle the pill like everything else.
        const statusIcon = status === 'resolved' ? contextConfig().getIcon('check') : (status === 'aborted' || status === 'rejected') ? contextConfig().getIcon('close') : '';
        const spinner = status === 'pending'
            ? `<span class="tool-pill-spinner" aria-hidden="true"></span>`
            : '';
        // Says WHY nothing is happening. A pill that just sits there while the answer
        // is expected somewhere else is the one thing this placement can get wrong.
        const waiting = status === 'awaiting-approval'
            ? `<span class="tool-pill-status">${escapeHtml(contextConfig().t('approvalWaiting'))}</span>`
            : '';
        return `
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                    ${spinner}
                    ${waiting}
                    ${statusIcon ? `<span class="tool-pill-status">${statusIcon}</span>` : ''}
                </span>
            </div>
        `;
    },
    /**
     * The pill's glyphs, and the label it wears while a person is deciding.
     *
     * The two highest-stakes strings in the library — the approval labels — are no
     * longer here: they are on the panel, which relabels itself. This still matters
     * though, because the request the pill describes stays open for as long as
     * somebody takes to decide, which is exactly long enough for a language switch.
     *
     * No child node is added or removed, per the relabel contract.
     */
    relabel: (element, segment) => {
        const cfg = contextConfig();
        const icon = element.querySelector('.tool-pill-icon');
        if (icon) icon.innerHTML = cfg.getIcon('tool');
        const statusEl = element.querySelector('.tool-pill-status');
        if (statusEl) {
            const s = segment.status;
            statusEl.innerHTML = s === 'resolved'
                ? cfg.getIcon('check')
                : (s === 'aborted' || s === 'rejected') ? cfg.getIcon('close') : '';
        }
        // The two approval labels used to be relabelled here. They live on the panel
        // now, which relabels itself. What is left on this side is the waiting label —
        // and it still matters that a language switch reaches it, because the request it
        // describes may be open for as long as a person takes to decide.
        if (statusEl && segment.status === 'awaiting-approval') {
            statusEl.textContent = cfg.t('approvalWaiting');
        }
    },
    setup: (element, segment) => {
        // Nothing of ours to wire: the transcript holds no control any more. What used
        // to be here built the two buttons' click listeners and dispatched
        // `aparte-tool-decision`; the decision is answered at the composer now.
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        customRenderer?.setup?.(element, segment);
    },
    getStyles: () => `
        .segment-tool-call { display: flex; padding: 2px 0; }
        .tool-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px 3px 7px;
            border-radius: 99px;
            font-size: 0.78rem;
            font-weight: 500;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            background: var(--aparte-surface, #f8f8f8);
            color: var(--aparte-text-secondary, rgba(0,0,0,0.55));
            user-select: none;
        }
        [data-status="resolved"] .tool-pill {
            border-color: var(--aparte-success-border, rgba(34,197,94,0.3));
            background: var(--aparte-success-surface, rgba(34,197,94,0.06));
            color: var(--aparte-success, rgb(21,128,61));
        }
        [data-status="aborted"] .tool-pill,
        [data-status="rejected"] .tool-pill {
            border-color: var(--aparte-error-border, rgba(239,68,68,0.3));
            background: var(--aparte-error-surface, rgba(239,68,68,0.06));
            color: var(--aparte-error, rgb(185,28,28));
        }
        /* The Approve / Reject button rules were here. They moved with the buttons -
           into aparte.css, as .aparte-approval-option, where a consumer's own rules and
           the generated CSS reference can both see them. Runtime-injected CSS is
           invisible to check:derived-vars too, which is why the elicitation panel had
           already made the same move. (No backticks in here: this whole block is a
           template literal, and one would close it.) */
        [data-status="awaiting-approval"] .tool-pill {
            border-color: var(--aparte-border-strong, rgba(128,128,128,0.45));
        }
        .tool-pill-spinner {
            width: 10px; height: 10px;
            border: 1.5px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: tool-spin 0.7s linear infinite;
        }
        .tool-pill-status { font-size: 0.75rem; }
        @keyframes tool-spin { to { transform: rotate(360deg); } }
    `
};
