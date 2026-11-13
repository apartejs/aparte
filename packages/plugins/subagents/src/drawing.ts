/**
 * How a sub-agent's conversation is drawn: core's own segment renderers, one row per
 * segment, patched in place.
 *
 * Not `<aparte-chat-bubble>`: a bubble is ONE message of a chat, and it draws the chrome of
 * one — a name and a time over the content, an avatar slot, the app's action bar
 * (`setBubbleActions` reaches every bubble: Retry and Edit on a sub-agent's text would
 * dispatch for a message that does not exist), the `‹1/2›` picker, the app's whole frame
 * (`setBubbleShellRenderer`), `role="article"` named "Message from Assistant", and the
 * waiting dots. None of it can be switched off without changing core, and hiding it from a
 * stylesheet would out-specify core's recipes. What a conversation needs from the bubble is
 * its row loop alone — and that is the renderer contract: `render`, then `setup`; `update`
 * on a change (following the element when the renderer replaced its own); `relabel` on a
 * language switch; `cleanup` when the row goes. So this is that loop, and nothing else.
 *
 * A row is found by its segment's id and patched when its segment is a new object (a
 * segment list replaces the object it changes, and only that one), so a token costs the
 * one row it lands in. A row whose renderer is no longer the one in effect is drawn again —
 * for a tool call or an activity, the tool or activity renderer too, as the bubble does.
 */
import {
    getSegmentRenderer,
    installDefaultRenderersOnce,
    runWithConfig,
    type AparteActivitySegment,
    type AparteConfig,
    type AparteSegment,
    type AparteSegmentRenderer,
    type AparteToolCallSegment,
} from '@aparte/core';

interface Row {
    el: HTMLElement;
    renderer: AparteSegmentRenderer | undefined;
    /** For a tool call or an activity, the tool or activity renderer in effect when it was drawn. */
    inner: object | null;
    segment: AparteSegment;
}

/**
 * The renderer core's row asks for a tool call (its tool renderer) or an activity (the one for
 * its type): when it changes, the row is drawn again, as the bubble draws its own again.
 */
function innerRendererFor(segment: AparteSegment, config: AparteConfig): object | null {
    if (segment.type === 'activity') return config.getActivityRenderer((segment as AparteActivitySegment).activityType) ?? null;
    if (segment.type !== 'tool_call') return null;
    const name = (segment as AparteToolCallSegment).toolCall?.name;
    return name && !config.isToolHidden(name) ? config.getToolRenderer(name) ?? null : null;
}

/** The renderer for a type, core's built-ins installed the first time they are missing — as the bubble does. */
function rendererFor(type: string, config: AparteConfig): AparteSegmentRenderer | undefined {
    const renderer = getSegmentRenderer(type, config);
    if (renderer) return renderer as AparteSegmentRenderer;
    installDefaultRenderersOnce(config);
    return getSegmentRenderer(type, config) as AparteSegmentRenderer | undefined;
}

/** A renderer's output as one element, stamped with its segment's id (the loop finds its rows by it). */
function toElement(out: HTMLElement | string, segment: AparteSegment): HTMLElement | null {
    let el: HTMLElement | null;
    if (typeof out === 'string') {
        const tpl = document.createElement('template');
        tpl.innerHTML = out.trim();
        el = tpl.content.firstElementChild as HTMLElement | null;
    } else {
        el = out;
    }
    if (el && !el.hasAttribute('data-segment-id')) el.setAttribute('data-segment-id', segment.id);
    return el;
}

/** A segment no renderer claims: its `fallback` text, else nothing for the reader. */
function fallbackOf(segment: AparteSegment): HTMLElement | null {
    const text = (segment as { fallback?: unknown }).fallback;
    if (typeof text !== 'string' || !text.trim()) return null;
    const el = document.createElement('div');
    el.className = 'aparte-segment aparte-segment-fallback';
    el.setAttribute('data-segment-id', segment.id);
    el.textContent = text;
    return el;
}

/**
 * A text or reasoning segment added while the sub-agent works is arriving, flag or no flag:
 * its `setup` writes it through the streaming renderer (the stream parser's text carries no
 * flag). The bubble tells `setup` the same thing for the same reason.
 */
function drawnAs(segment: AparteSegment, live: boolean): AparteSegment {
    if (!live || (segment.type !== 'text' && segment.type !== 'thinking')) return segment;
    if (segment.isStreaming !== undefined) return segment;
    return { ...segment, isStreaming: true } as AparteSegment;
}

/** The rows of one conversation, inside `container`. */
export class LaneDrawing {
    private readonly rows = new Map<string, Row>();

    constructor(readonly container: HTMLElement) {}

    /** How many rows are drawn. */
    get size(): number {
        return this.rows.size;
    }

    /**
     * Draw `segments`, in order: a new segment gets a row, a changed one is patched, one that
     * left loses its row. `live`: the sub-agent still works, so what it adds is arriving.
     */
    sync(segments: readonly AparteSegment[], config: AparteConfig, live: boolean): void {
        const seen = new Set<string>();
        let previous: Element | null = null;
        for (const segment of segments) {
            if (!segment || typeof segment.id !== 'string' || seen.has(segment.id)) continue;
            seen.add(segment.id);
            const renderer = rendererFor(segment.type, config);
            let row = this.rows.get(segment.id);
            if (row && (row.renderer !== renderer || row.inner !== innerRendererFor(segment, config))) {
                this.release(segment.id, config);
                row.el.remove();
                row = undefined;
            }
            if (!row) row = this.draw(segment, renderer, config, live);
            else if (row.segment !== segment) this.patch(row, segment, config);
            if (!row) continue;
            const expected: ChildNode | null = previous ? previous.nextSibling : this.container.firstChild;
            if (row.el !== expected) this.container.insertBefore(row.el, expected);
            previous = row.el;
        }
        for (const [id, row] of [...this.rows]) {
            if (seen.has(id)) continue;
            this.release(id, config);
            row.el.remove();
        }
    }

    /** Every row re-reads what it takes from the config (a language switch). */
    relabel(config: AparteConfig): void {
        for (const row of this.rows.values()) {
            const relabel = row.renderer?.relabel;
            if (!relabel) continue;
            runWithConfig(config, () => relabel.call(row.renderer, row.el, row.segment));
        }
    }

    /** Every row goes: each renderer cleans up what it drew. */
    clear(config: AparteConfig): void {
        for (const [id, row] of [...this.rows]) {
            this.release(id, config);
            row.el.remove();
        }
    }

    private draw(segment: AparteSegment, renderer: AparteSegmentRenderer | undefined, config: AparteConfig, live: boolean): Row | undefined {
        const el = renderer
            ? toElement(runWithConfig(config, () => renderer.render(segment)), segment)
            : fallbackOf(segment);
        if (!el) return undefined;
        const row: Row = { el, renderer, inner: innerRendererFor(segment, config), segment };
        // Recorded before `setup`: a setup that throws still leaves a row that is cleaned up.
        this.rows.set(segment.id, row);
        if (renderer?.setup) {
            const as = drawnAs(segment, live);
            runWithConfig(config, () => renderer.setup!(el, as));
        }
        return row;
    }

    private patch(row: Row, segment: AparteSegment, config: AparteConfig): void {
        const renderer = row.renderer;
        row.segment = segment;
        if (!renderer) {
            const next = fallbackOf(segment);
            if (next) { row.el.replaceWith(next); row.el = next; }
            return;
        }
        if (renderer.update) {
            const before = row.el;
            runWithConfig(config, () => renderer.update!(before, segment));
            // A renderer may replace its own element (the tool row does when its shape
            // changes), cleaning up the one it replaced: follow the one it left.
            if (before.parentNode !== this.container) {
                const now = this.childOf(segment.id);
                if (now) row.el = now;
            }
            return;
        }
        // No `update`: drawn again, as the bubble does.
        const next = toElement(runWithConfig(config, () => renderer.render(segment)), segment);
        if (!next) return;
        this.cleanup(row, config);
        row.el.replaceWith(next);
        row.el = next;
        if (renderer.setup) runWithConfig(config, () => renderer.setup!(next, segment));
    }

    /** The row for `id` among the container's own children — never a decoy in a row's prose. */
    private childOf(id: string): HTMLElement | null {
        for (const child of this.container.children) {
            if (child.getAttribute('data-segment-id') === id) return child as HTMLElement;
        }
        return null;
    }

    private release(id: string, config: AparteConfig): void {
        const row = this.rows.get(id);
        if (!row) return;
        this.rows.delete(id);
        this.cleanup(row, config);
    }

    private cleanup(row: Row, config: AparteConfig): void {
        const cleanup = row.renderer?.cleanup;
        if (!cleanup) return;
        try {
            runWithConfig(config, () => cleanup.call(row.renderer, row.el, row.segment));
        } catch (err) {
            console.error('[aparte] a segment renderer\'s cleanup threw', err);
        }
    }
}
