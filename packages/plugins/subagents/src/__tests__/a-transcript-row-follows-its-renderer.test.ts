/**
 * A transcript's row follows its renderer's contract, as a bubble's does.
 *
 * `render` then `setup`; `update` on a change, or — for a renderer with none — drawn again,
 * the old row cleaned up first; drawn anew by the renderer in effect when it changed;
 * `relabel` on a language switch; `cleanup` when the row goes, even one that throws. A
 * segment no renderer claims shows its `fallback` text, else nothing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    AparteConfig,
    aparteGlobalConfig,
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    type AparteSegment,
    type AparteSegmentRenderer,
} from '@aparte/core';
import { LaneDrawing } from '../drawing.js';

afterEach(() => {
    vi.restoreAllMocks();
    unregisterSegmentRenderer('note' as never);
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

const note = (id: string, text: string): AparteSegment => ({ id, type: 'note', content: text } as unknown as AparteSegment);

function drawing(): LaneDrawing {
    const container = document.createElement('div');
    document.body.append(container);
    return new LaneDrawing(container);
}

const texts = (d: LaneDrawing): string[] => [...d.container.children].map((c) => c.textContent ?? '');

describe('a row of the transcript', () => {
    it('is drawn again, the old one cleaned up, by a renderer that cannot patch', () => {
        const calls: string[] = [];
        registerSegmentRenderer({
            type: 'note',
            render: (s: AparteSegment) => `<p class="aparte-note">${(s as unknown as { content: string }).content}</p>`,
            setup: (_el: HTMLElement, s: AparteSegment) => { calls.push(`setup ${s.id}`); },
            cleanup: (_el: HTMLElement, s: AparteSegment) => { calls.push(`cleanup ${s.id}`); },
        } as unknown as AparteSegmentRenderer);
        const d = drawing();
        const first = note('n1', 'one');
        d.sync([first], aparteGlobalConfig, false);
        const el = d.container.firstElementChild;
        expect(el!.getAttribute('data-segment-id')).toBe('n1');
        d.sync([first], aparteGlobalConfig, false);
        expect(d.container.firstElementChild).toBe(el);
        d.sync([note('n1', 'two')], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['two']);
        expect(d.container.firstElementChild).not.toBe(el);
        expect(calls).toEqual(['setup n1', 'cleanup n1', 'setup n1']);
        d.sync([], aparteGlobalConfig, false);
        expect(texts(d)).toEqual([]);
        expect(calls.at(-1)).toBe('cleanup n1');
        expect(d.size).toBe(0);
    });

    it('is drawn anew when another renderer takes its type, and relabelled on a switch', () => {
        registerSegmentRenderer({ type: 'note', render: () => '<p>old</p>' } as unknown as AparteSegmentRenderer);
        const d = drawing();
        const segment = note('n1', 'x');
        d.sync([segment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['old']);
        const relabel = vi.fn((el: HTMLElement) => { el.textContent = 'relabelled'; });
        registerSegmentRenderer({ type: 'note', render: () => '<p>new</p>', relabel } as unknown as AparteSegmentRenderer);
        d.sync([segment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['new']);
        d.relabel(aparteGlobalConfig);
        expect(relabel).toHaveBeenCalledTimes(1);
        expect(texts(d)).toEqual(['relabelled']);
    });

    it('follows the element a renderer put in place of its own without the id, shown once', () => {
        const markup = (s: AparteSegment) => `<p>${(s as unknown as { content: string }).content}</p>`;
        registerSegmentRenderer({
            type: 'note',
            render: markup,
            // Drawn again in place: what a renderer returning markup is tempted to write.
            update: (el: HTMLElement, s: AparteSegment) => { el.outerHTML = markup(s); },
        } as unknown as AparteSegmentRenderer);
        const d = drawing();
        d.sync([note('a', 'A'), note('n1', 'one'), note('b', 'B')], aparteGlobalConfig, false);
        d.sync([note('a', 'A'), note('n1', 'two'), note('b', 'B')], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A', 'two', 'B']);
        // It is that row now: found by its id, patched again in place.
        expect([...d.container.children].map((c) => c.getAttribute('data-segment-id'))).toEqual(['a', 'n1', 'b']);
        d.sync([note('a', 'A'), note('n1', 'three'), note('b', 'B')], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A', 'three', 'B']);
    });

    it('is put back where it belongs when its renderer took its element away', () => {
        registerSegmentRenderer({
            type: 'note',
            render: (s: AparteSegment) => `<p>${(s as unknown as { content: string }).content}</p>`,
            update: (el: HTMLElement, s: AparteSegment) => { el.textContent = (s as unknown as { content: string }).content; el.remove(); },
        } as unknown as AparteSegmentRenderer);
        const d = drawing();
        d.sync([note('a', 'A'), note('n1', 'one'), note('b', 'B')], aparteGlobalConfig, false);
        d.sync([note('a', 'A'), note('n1', 'two'), note('b', 'B')], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A', 'two', 'B']);
        // The last row too, with nothing after it.
        d.sync([note('a', 'A'), note('n1', 'two'), note('b', 'Bee')], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A', 'two', 'Bee']);
    });

    it('keeps the order of the list, and skips a duplicate or a segment with no id', () => {
        registerSegmentRenderer({ type: 'note', render: (s: AparteSegment) => `<p>${(s as unknown as { content: string }).content}</p>` } as unknown as AparteSegmentRenderer);
        const d = drawing();
        const a = note('a', 'A');
        const b = note('b', 'B');
        d.sync([a, b], aparteGlobalConfig, false);
        d.sync([b, a, a, { type: 'note' } as unknown as AparteSegment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['B', 'A']);
    });

    it('shows the fallback of a segment no renderer claims, else nothing', () => {
        const d = drawing();
        const odd = { id: 'u1', type: 'mystery', fallback: 'A chart was here.' } as unknown as AparteSegment;
        d.sync([odd, { id: 'u2', type: 'mystery' } as unknown as AparteSegment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A chart was here.']);
        expect(d.container.firstElementChild!.classList.contains('aparte-segment-fallback')).toBe(true);
        d.sync([{ ...odd, fallback: 'A table was here.' } as AparteSegment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A table was here.']);
        d.sync([{ ...odd, fallback: '' } as AparteSegment], aparteGlobalConfig, false);
        expect(texts(d)).toEqual(['A table was here.']);
    });

    it('goes even when its cleanup throws, and says so', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        registerSegmentRenderer({
            type: 'note',
            render: () => '<p>n</p>',
            cleanup: () => { throw new Error('boom'); },
        } as unknown as AparteSegmentRenderer);
        const d = drawing();
        d.sync([note('n1', 'x')], aparteGlobalConfig, false);
        d.clear(aparteGlobalConfig);
        expect(texts(d)).toEqual([]);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it("draws with core's built-ins on a config that has none installed yet", () => {
        const config = new AparteConfig();
        const d = drawing();
        d.sync([{ id: 't1', type: 'text', content: 'Plain words.' } as AparteSegment], config, false);
        expect(texts(d).join('')).toContain('Plain words.');
    });

    it('draws a text added while the sub-agent works as arriving, and one added after as finished', () => {
        const config = new AparteConfig();
        const seen: string[] = [];
        const watch = (type: string) => ({
            type,
            render: () => '<p>t</p>',
            setup: (_el: HTMLElement, s: AparteSegment) => { seen.push(`${s.id}:${String(s.isStreaming)}`); },
        }) as unknown as AparteSegmentRenderer;
        registerSegmentRenderer(watch('text'), config);
        registerSegmentRenderer(watch('note'), config);
        const d = drawing();
        const n = note('n1', 'x');
        d.sync([n, { id: 't1', type: 'text', content: 'Arriving' } as AparteSegment], config, true);
        d.sync([n, { id: 't1', type: 'text', content: 'Arriving' } as AparteSegment,
            { id: 't2', type: 'text', content: 'Flagged', isStreaming: false } as AparteSegment], config, true);
        d.sync([{ id: 't3', type: 'text', content: 'Saved' } as AparteSegment], config, false);
        // Only text and reasoning arrive, only when added, and only without a flag of their
        // own; a row drawn again by a renderer that cannot patch gets the segment as it is.
        expect(seen).toEqual(['n1:undefined', 't1:true', 't1:undefined', 't2:false', 't3:undefined']);
    });
});
