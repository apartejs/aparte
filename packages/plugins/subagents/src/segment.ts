/**
 * The line of a sub-agent no call opened: core's own tool row, drawn for a stand-in call.
 *
 * A sub-agent announced without a call (an AG-UI `SUBAGENT_STARTED` with no parent call), or
 * the second one a call opens, has no row of its own in the reply, so the plugin adds a
 * `subagent` segment for it. That segment is drawn by core's `tool_call` renderer, handed a
 * call that stands for the agent: its name is the agent's (so `registerToolDisplay('<agent
 * name>', …)` reaches it — label, icon, `quiet`, `hidden`, `details`), its status says the
 * agent's. The renderer returns the row's own root — no wrapper — and forwards `setup`,
 * `update`, `relabel` and `cleanup` to core's, so the line reads and behaves exactly like a
 * call's sub-agent line.
 */
import {
    contextConfig,
    getSegmentRenderer,
    type AparteSegmentRenderer,
    type AparteToolCallSegment,
} from '@aparte/core';
import { callStatusOf, subagentOf, subagentStatus } from './status.js';
import { markStandIn } from './line.js';
import { rendererStyles } from './styles.js';
import { SUBAGENT_SEGMENT_TYPE, type AparteSubagentSegment } from './types.js';

/** The tool name a sub-agent with no name stands in under. */
export const UNNAMED_AGENT = 'subagent';

/** The call that stands for a `subagent` segment on core's row: same id, the agent's name, its status. */
export function standInCall(segment: AparteSubagentSegment): AparteToolCallSegment {
    const sub = subagentOf(segment);
    const status = subagentStatus(segment);
    const call = {
        id: segment.id,
        type: 'tool_call',
        ...(segment.messageId !== undefined ? { messageId: segment.messageId } : {}),
        ...(segment.index !== undefined ? { index: segment.index } : {}),
        // Its timing is the segment's: the line's duration reads it.
        ...(segment.meta !== undefined ? { meta: segment.meta } : {}),
        ...((segment as { collapsed?: boolean }).collapsed !== undefined ? { collapsed: (segment as { collapsed?: boolean }).collapsed } : {}),
        toolCall: { id: sub?.id ?? segment.id, name: sub?.name?.trim() || UNNAMED_AGENT, input: {} },
        status: callStatusOf(status),
        // A failure reads as a failed call's does.
        ...(status === 'failed' && sub?.error ? { result: sub.error } : {}),
        subagent: segment.subagent,
    } as AparteToolCallSegment;
    return markStandIn(call);
}

/** Core's renderer for a call, in the chat's config. */
const toolRow = () => getSegmentRenderer('tool_call', contextConfig());

/** Draw `out` in place of `element`, as core's row does when its shape changes. */
function replace(element: HTMLElement, out: HTMLElement | string, segment: AparteSubagentSegment): HTMLElement | null {
    const tpl = document.createElement('template');
    tpl.innerHTML = typeof out === 'string' ? out.trim() : '';
    const next = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement | null;
    if (!next) return null;
    if (!next.hasAttribute('data-segment-id')) next.setAttribute('data-segment-id', segment.id);
    element.replaceWith(next);
    return next;
}

export const subagentRenderer: AparteSegmentRenderer<AparteSubagentSegment> = {
    type: SUBAGENT_SEGMENT_TYPE,
    render: (segment) => toolRow()?.render(standInCall(segment)) ?? '',
    setup: (element, segment) => toolRow()?.setup?.(element, standInCall(segment)),
    update: (element, segment) => {
        const row = toolRow();
        if (!row) return;
        const call = standInCall(segment);
        if (row.update) {
            row.update(element, call);
            return;
        }
        // An app's own `tool_call` renderer with no `update`: drawn again, as the bubble would.
        row.cleanup?.(element, call);
        const next = replace(element, row.render(call), segment);
        if (next) row.setup?.(next, call);
    },
    relabel: (element, segment) => toolRow()?.relabel?.(element, standInCall(segment)),
    cleanup: (element, segment) => toolRow()?.cleanup?.(element, standInCall(segment)),
    // The plugin's sheet (the transcript's, the view's): core puts it on the page with the
    // renderers' own, once, unless a view already did.
    getStyles: rendererStyles,
};
