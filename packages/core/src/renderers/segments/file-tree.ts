/**
 * A file tree, rendered recursively.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml } from '../../utils/escape.js';
import type {
    AparteSegmentRenderer,
    AparteFileNode,
    AparteFileTreeSegment,
} from '../../types/index.js';

function renderFileNode(node: AparteFileNode, depth = 0): string {
    const indent = depth * 16;
    const icon = node.type === 'directory' ? '📁' : '📄';
    const statusClass = node.status ? `file-status-${escapeHtml(node.status)}` : '';

    let html = `<div class="file-node ${statusClass}" style="padding-left: ${indent}px"><span class="file-icon">${icon}</span><span class="file-name">${escapeHtml(node.name)}</span></div>`;

    if (node.children) {
        for (const child of node.children) {
            html += renderFileNode(child, depth + 1);
        }
    }

    return html;
}

export const fileTreeRenderer: AparteSegmentRenderer<AparteFileTreeSegment> = {
    type: 'file-tree',
    render: (segment) => {
        let filesHtml = '';
        if (segment.files) {
            for (const file of segment.files) {
                filesHtml += renderFileNode(file, 0);
            }
        }

        return `<div class="segment segment-file-tree" data-segment-id="${escapeHtml(segment.id)}">${segment.title ? `<div class="file-tree-title">${escapeHtml(segment.title)}</div>` : ''}<div class="file-tree-content">${filesHtml}</div></div>`;
    },
    getStyles: () => ``
};
