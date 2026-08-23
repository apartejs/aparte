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

        // Human-in-the-loop gate — built-in Approve/Reject. Shown even when a
        // per-tool renderer exists: approval precedes the tool's own UI.
        if (status === 'awaiting-approval') {
            const loc = contextConfig().getLocale();
            const approve = loc.approveTool ?? 'Approve';
            const reject = loc.rejectTool ?? 'Reject';
            return `
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="awaiting-approval" data-tool-call-id="${escapeAttr(toolCallId)}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                </span>
                <span class="tool-approval" role="group" aria-label="${escapeAttr(name)}">
                    <button type="button" class="tool-approve-btn" data-tool-decision="approve" aria-label="${escapeAttr(approve)}">${escapeHtml(approve)}</button>
                    <button type="button" class="tool-reject-btn" data-tool-decision="reject" aria-label="${escapeAttr(reject)}">${escapeHtml(reject)}</button>
                </span>
            </div>
            `;
        }

        // Delegate to a per-tool renderer if one is registered. It may return an
        // HTMLElement — the arm that has no innerHTML surface at all, and the one a
        // consumer should reach for, since the segment carries model-chosen input.
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
        return `
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}">
                <span class="tool-pill">
                    <span class="tool-pill-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-pill-name">${escapeHtml(name)}</span>
                    ${spinner}
                    ${statusIcon ? `<span class="tool-pill-status">${statusIcon}</span>` : ''}
                </span>
            </div>
        `;
    },
    setup: (element, segment) => {
        // Built-in approval gate: wire Approve/Reject → aparte-tool-decision.
        if (segment.status === 'awaiting-approval') {
            const toolCallId = segment.toolCall?.id;
            if (!toolCallId) return;
            // `targetId` is stamped for a consumer's own listener; the client itself
            // scopes on DOM containment, which a model-chosen id cannot forge.
            const host = element.closest('[data-aparte-host], aparte-chat, aparte-chat-viewport') as HTMLElement | null;
            const decide = (approved: boolean) => element.dispatchEvent(new CustomEvent('aparte-tool-decision', {
                bubbles: true, composed: true, detail: { toolCallId, approved, targetId: host?.id || undefined }
            }));
            element.querySelector('[data-tool-decision="approve"]')?.addEventListener('click', () => decide(true));
            element.querySelector('[data-tool-decision="reject"]')?.addEventListener('click', () => decide(false));
            return;
        }
        // Delegate setup to per-tool renderer if registered
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
        .tool-approval { display: inline-flex; gap: 6px; margin-left: 8px; vertical-align: middle; }
        .tool-approve-btn, .tool-reject-btn {
            font: inherit; font-size: 0.78rem; font-weight: 600; line-height: 1;
            padding: 4px 12px; border-radius: 99px; cursor: pointer;
            border: 1px solid var(--aparte-border, rgba(0,0,0,0.12));
            background: var(--aparte-surface, #f8f8f8);
        }
        .tool-approve-btn { color: var(--aparte-success, rgb(21,128,61)); border-color: var(--aparte-success-border, rgba(34,197,94,0.4)); }
        .tool-reject-btn { color: var(--aparte-error, rgb(185,28,28)); border-color: var(--aparte-error-border, rgba(239,68,68,0.4)); }
        .tool-approve-btn:hover { background: var(--aparte-success-surface, rgba(34,197,94,0.1)); }
        .tool-reject-btn:hover { background: var(--aparte-error-surface, rgba(239,68,68,0.1)); }
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
