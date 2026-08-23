/**
 * A long-running step reporting itself.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import type {
    AparteSegmentRenderer,
    AparteProgressSegment,
} from '../../types/index.js';

export const progressRenderer: AparteSegmentRenderer<AparteProgressSegment> = {
    type: 'progress',
    render: (segment) => {
        const label = escapeHtml(segment.label || 'Progress');
        const pct = Math.round(segment.percent || 0);
        return `<div class="segment segment-progress" data-segment-id="${escapeHtml(segment.id)}"><div class="progress-header"><span class="progress-label">${label}</span><span class="progress-value">${pct}%</span></div><div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${label}"><div class="progress-fill" style="width: ${pct}%"></div></div></div>`;
    },
    getStyles: () => ``
};
