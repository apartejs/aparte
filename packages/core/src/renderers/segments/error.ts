/**
 * A failed turn, rendered in the transcript rather than thrown.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteErrorSegment,
} from '../../types/index.js';

export const errorRenderer: AparteSegmentRenderer<AparteErrorSegment> = {
    type: 'error',
    render: (segment) => {
        // A registered error renderer (aparteGlobalConfig.setErrorRenderer) owns the error
        // UI — the one place to customize it, string or live HTMLElement.
        const custom = contextConfig().getErrorRenderer?.();
        if (custom) {
            const out = custom({ message: segment.content, details: segment.details });
            if (out instanceof HTMLElement) {
                // Tag the root so in-place segment updates can still target it.
                out.setAttribute('data-segment-id', segment.id);
                return out;
            }
            return out;
        }
        return `
        <div class="segment segment-error" data-segment-id="${escapeHtml(segment.id)}">
            <div class="error-icon-wrapper">
                ${contextConfig().getIcon('error') || '⚠'}
            </div>
            <div class="error-content">
                <div class="error-title">Error</div>
                <div class="error-message">${escapeHtml(segment.content)}</div>
                ${segment.details ? `<div class="error-details">${escapeHtml(segment.details)}</div>` : ''}
            </div>
        </div>
    `;
    },
    getStyles: () => ``
};
