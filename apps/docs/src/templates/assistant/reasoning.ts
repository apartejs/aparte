/**
 * "Thinking" becomes "Thought for 6.4s" once a reasoning block settles.
 *
 * Core measures the span (it owns the stream, and writes `meta.aparte` on every segment) and
 * deliberately renders no duration: one product writes "Thought for 8s", another "8.2s · 1.2k
 * tokens". So the app wraps the built-in renderer, keeps the element it produced (the bubble
 * finds a segment by its `data-segment-id`) and delegates `setup` and `update` to it.
 */
import { getSegmentRenderer, isSegmentSettled, registerSegmentRenderer, segmentDuration } from '@aparte/core';
import type { AparteThinkingSegment } from '@aparte/core';

export function showReasoningDuration(): void {
    const builtIn = getSegmentRenderer('thinking');
    if (!builtIn) return;
    registerSegmentRenderer<AparteThinkingSegment>({
        type: 'thinking',
        render(segment) {
            const out = builtIn.render(segment);
            const host = typeof out === 'string' ? parseRoot(out) : out;
            writeDuration(host, segment);
            return host;
        },
        setup: (el, segment) => builtIn.setup?.(el, segment),
        // A block is drawn open and settles later, and a settle reaches the renderer through
        // `update`, never through a second `render`: the label is written in both.
        update(el, segment) {
            builtIn.update?.(el, segment);
            writeDuration(el, segment);
        },
    });
}

function writeDuration(host: HTMLElement, segment: AparteThinkingSegment): void {
    if (!isSegmentSettled(segment)) return;
    const label = host.querySelector('.aparte-thinking-label');
    if (!label) return;
    const ms = segmentDuration(segment);
    // Settled but never timed (handed over as a string): it thought, nobody measured how long.
    if (ms === undefined) label.textContent = 'Thought';
    else label.textContent = ms < 1000 ? 'Thought for <1s' : `Thought for ${(ms / 1000).toFixed(1)}s`;
}

function parseRoot(html: string): HTMLElement {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstElementChild as HTMLElement;
}
