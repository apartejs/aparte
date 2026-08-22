/**
 * Reasoning blocks — a collapsed disclosure the user can open.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteThinkingSegment,
} from '../../types/index.js';

export const thinkingRenderer: AparteSegmentRenderer<AparteThinkingSegment> = {
    type: 'thinking',
    render: (segment) => `<details class="segment segment-thinking" data-segment-id="${escapeHtml(segment.id)}" ${segment.collapsed ? '' : 'open'}><summary class="thinking-header"><span class="thinking-label">${escapeHtml(segment.label || contextConfig().t('thinking'))}</span><span class="thinking-toggle"></span></summary><div class="thinking-content">${escapeHtml(segment.content)}</div></details>`,
    update: (el, segment) => {
        // collapsed state is managed by _applySegmentUpdate based on explicit updates only —
        // never override what the user set by clicking <summary>
        const contentEl = el.querySelector('.thinking-content');
        if (contentEl) contentEl.textContent = segment.content;
    },
    getStyles: () => ``
};
