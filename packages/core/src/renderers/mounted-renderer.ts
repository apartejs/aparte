/**
 * Renderers that MOUNT something — a framework component — instead of returning markup.
 *
 * The one mechanism every framework wrapper's `AparteToolUI` / `AparteSegmentUI` goes
 * through, and the one a vanilla app uses to put a Lit or Preact component in a card: you
 * give a `mount(host, state)` that returns how to update and destroy what it mounted, and
 * this turns it into a complete renderer. Core creates the host, mounts once in `setup`
 * (the host is in the page by then), forwards every change to `update` (never a remount,
 * so local state survives a result landing), and calls `destroy` from `cleanup`, when the
 * host leaves for good.
 */
import type {
    AparteMountedView,
    AparteSegmentBase,
    AparteSegmentMount,
    AparteSegmentRenderer,
    AparteToolCallSegment,
    AparteToolCallView,
    AparteToolMount,
    AparteToolRenderer,
} from '../types/index.js';

/**
 * The renderers made here. What they draw does not depend on the Markdown or highlight
 * provider, so the bubble keeps their cards mounted when one of those changes — the redraw
 * that brings a late highlighter to the text around them would otherwise remount every
 * card and lose its state. Internal to core: not exported from the package.
 */
const mountedRenderers = new WeakSet<object>();

export function isMountedRenderer(renderer: object | null | undefined): boolean {
    return !!renderer && mountedRenderers.has(renderer);
}

/** The fields of a call a card draws from, read from its segment. */
export function toToolCallView<I = unknown, R = unknown>(segment: AparteToolCallSegment): AparteToolCallView<I, R> {
    return {
        id: segment.toolCall?.id ?? segment.id,
        name: segment.toolCall?.name ?? 'tool',
        input: segment.toolCall?.input as I,
        status: segment.status ?? 'pending',
        result: segment.result,
        structuredResult: segment.structuredResult as R | undefined,
        deferred: segment.deferred,
        refusal: segment.refusal,
        abortCause: segment.abortCause,
        segment,
    };
}

function host(className: string, segmentId: string): HTMLElement {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('data-segment-id', segmentId);
    return el;
}

/**
 * A tool renderer from a mount function: register it with `registerToolRenderer` (or
 * `overrideToolRenderer`, to take it off again later).
 *
 * @example
 * aparteGlobalConfig.registerToolRenderer('get_weather', defineMountedToolRenderer((host, view) => {
 *   const card = document.createElement('weather-card');
 *   card.data = view;
 *   host.append(card);
 *   return { update: (next) => { card.data = next; }, destroy: () => card.remove() };
 * }));
 */
export function defineMountedToolRenderer(mount: AparteToolMount): AparteToolRenderer {
    const mounted = new WeakMap<HTMLElement, AparteMountedView<AparteToolCallView>>();
    const renderer: AparteToolRenderer = {
        render: (segment) => host('aparte-tool-ui', segment.id),
        setup: (el, segment) => {
            if (!mounted.has(el)) mounted.set(el, mount(el, toToolCallView(segment)));
        },
        update: (el, segment) => {
            mounted.get(el)?.update(toToolCallView(segment));
        },
        cleanup: (el) => {
            const view = mounted.get(el);
            if (!view) return;
            mounted.delete(el);
            view.destroy();
        },
    };
    mountedRenderers.add(renderer);
    return renderer;
}

/**
 * A segment renderer from a mount function, for your own segment `type`: register it with
 * `registerSegmentRenderer` (or `overrideSegmentRenderer`).
 */
export function defineMountedSegmentRenderer<T extends AparteSegmentBase>(
    type: string,
    mount: AparteSegmentMount<T>,
): AparteSegmentRenderer<T> {
    const mounted = new WeakMap<HTMLElement, AparteMountedView<T>>();
    const renderer: AparteSegmentRenderer<T> = {
        type,
        render: (segment) => host('aparte-segment-ui', segment.id),
        setup: (el, segment) => {
            if (!mounted.has(el)) mounted.set(el, mount(el, segment));
        },
        update: (el, segment) => {
            mounted.get(el)?.update(segment);
        },
        cleanup: (el) => {
            const view = mounted.get(el);
            if (!view) return;
            mounted.delete(el);
            view.destroy();
        },
    };
    mountedRenderers.add(renderer);
    return renderer;
}
