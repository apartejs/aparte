/**
 * The `activity` segment: an agent's structured progress, drawn by the renderer the app
 * registered for its `activityType` (`config.registerActivityRenderer`).
 *
 * Core draws nothing of its own here. Without a renderer for the type the segment is an empty
 * `hidden` element with the segment's identity — kept so its updates find their row instead of
 * rebuilding the message, and so a renderer registered later draws it in place. Hidden, it
 * takes no room, and the bubble counts it as nothing to show (no orphan header).
 */
import { contextConfig } from '../../config/index.js';
import type { AparteActivityRenderer, AparteActivitySegment, AparteSegmentRenderer } from '../../types/segments.js';

/** An activity nothing draws: empty, hidden, findable by its segment's id. */
function placeholder(segment: AparteActivitySegment): HTMLElement {
    const el = document.createElement('div');
    el.className = 'aparte-segment aparte-segment-activity';
    el.setAttribute('data-segment-id', segment.id);
    el.setAttribute('data-activity-type', segment.activityType);
    el.hidden = true;
    return el;
}

const isPlaceholder = (element: Element): boolean =>
    (element as HTMLElement).hidden && element.classList.contains('aparte-segment-activity') && element.childElementCount === 0;

/** The registered renderer that drew each element: its update, relabel and cleanup go to it, not to whichever is registered now. */
const drawnBy = new WeakMap<Element, AparteActivityRenderer>();

/** The renderer behind an element — the one that drew it, or chose to draw nothing — for the bubble to tell a registration changed. */
const behind = new WeakMap<Element, AparteActivityRenderer>();

/** Which activity renderer is behind `element`, or null. Internal to core. */
export function activityRendererThatDrew(element: Element): AparteActivityRenderer | null {
    return behind.get(element) ?? null;
}

const rendererOf = (segment: AparteActivitySegment): AparteActivityRenderer | null =>
    contextConfig().getActivityRenderer(segment.activityType) ?? null;

export const activityRenderer: AparteSegmentRenderer<AparteActivitySegment> = {
    type: 'activity',
    render: (segment) => {
        const custom = rendererOf(segment);
        if (!custom) return placeholder(segment);
        const out = custom.render(segment);
        if (out instanceof HTMLElement) { drawnBy.set(out, custom); behind.set(out, custom); return out; }
        return out.trim() ? out : placeholder(segment);
    },
    setup: (element, segment) => {
        const custom = rendererOf(segment);
        if (!custom) return;
        behind.set(element, custom);
        if (isPlaceholder(element)) return;
        drawnBy.set(element, custom);
        custom.setup?.(element, segment);
    },
    /**
     * The agent sent it again. The renderer that drew it patches it, when it can and is still
     * the one registered; otherwise it is drawn again here, and the bubble follows the element.
     */
    update: (element, segment) => {
        const custom = rendererOf(segment);
        const drawn = drawnBy.get(element) ?? null;
        if (drawn && drawn === custom && drawn.update) {
            drawn.update(element, segment);
            return;
        }
        if (!custom && !drawn && isPlaceholder(element)) {
            element.setAttribute('data-activity-type', segment.activityType);
            return;
        }
        const out = activityRenderer.render(segment);
        let rebuilt: HTMLElement | null;
        if (typeof out === 'string') {
            const tpl = document.createElement('template');
            tpl.innerHTML = out.trim();
            rebuilt = tpl.content.firstElementChild as HTMLElement | null;
        } else {
            rebuilt = out;
        }
        if (!rebuilt) return;
        if (!rebuilt.hasAttribute('data-segment-id')) rebuilt.setAttribute('data-segment-id', segment.id);
        activityRenderer.cleanup?.(element, segment);
        element.replaceWith(rebuilt);
        activityRenderer.setup?.(rebuilt, segment);
    },
    relabel: (element, segment) => {
        drawnBy.get(element)?.relabel?.(element, segment);
    },
    /** The element leaves for good: the renderer that drew it cleans up. A cleanup that throws is reported, nothing more. */
    cleanup: (element, segment) => {
        behind.delete(element);
        const custom = drawnBy.get(element);
        if (!custom) return;
        drawnBy.delete(element);
        try {
            custom.cleanup?.(element, segment);
        } catch (err) {
            console.error('[aparte] an activity renderer\'s cleanup threw', err);
        }
    },
};
