/**
 * A tool row can arrive open — for a developer reading what the agent did.
 *
 * The row was "COLLAPSED, always", and nothing could open it: `setSegmentDefaults` opened
 * reasoning blocks, but the tool row read no field. It reads `collapsed` now, as reasoning
 * does — so `setSegmentDefaults('tool_call', { collapsed: false })` opens every row — and
 * a tool's display can say `open`, which a segment's own `collapsed` overrides. Closed
 * stays the default, and an update still never touches what the reader did.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { stampSegmentOnInsert } from '../../../utils/segments.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'read_file', input: { path: 'a.txt' } }, result: 'hello',
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLDetailsElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLDetailsElement;
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('read_file');
    aparteGlobalConfig.clearSegmentDefaults('tool_call');
    document.body.innerHTML = '';
});

describe('a tool row opens', () => {
    it('closed by default', () => {
        expect(draw(call()).open).toBe(false);
    });

    it('open when the segment says collapsed: false', () => {
        expect(draw(call({ collapsed: false })).open).toBe(true);
    });

    it('open for every row with setSegmentDefaults, which the segment carries from insertion', () => {
        aparteGlobalConfig.setSegmentDefaults('tool_call', { collapsed: false });
        const inserted = stampSegmentOnInsert([], call(), 'm1', aparteGlobalConfig.getSegmentDefaults('tool_call')) as AparteToolCallSegment;
        expect(draw(inserted).open).toBe(true);
    });

    it('open for one tool through its display; the segment\'s own collapsed wins', () => {
        aparteGlobalConfig.registerToolDisplay('read_file', { open: true });
        expect(draw(call()).open).toBe(true);
        expect(draw(call({ collapsed: true })).open).toBe(false);
    });

    it('an update never closes what the reader opened, nor opens what they closed', () => {
        aparteGlobalConfig.registerToolDisplay('read_file', { open: true });
        const el = draw(call({ status: 'pending', result: undefined, toolCall: { id: 'c1', name: 'read_file', input: { path: 'a.txt' } } }));
        el.open = false;
        renderer().update!(el, call());
        expect(el.open).toBe(false);
    });
});
