/**
 * A long tool part scrolls inside a capped box instead of filling the transcript.
 *
 * A 30 000-character result opened into a wall of text the reader had to scroll the
 * whole conversation past. The part's body is capped by `--aparte-tool-part-max-height`
 * (300px, the reasoning block's cap) and scrolls; as a scrolling region it is focusable
 * and named, so a keyboard can reach what overflows — the reasoning block's precedent.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();

const call = { id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'read_file', input: { path: 'big.log' } }, result: 'line\n'.repeat(500) } as AparteToolCallSegment;

describe('a long tool part', () => {
    it('is capped by a token and scrolls', () => {
        const css = readAparteStylesheet();
        expect(css).toMatch(/--aparte-tool-part-max-height:\s*300px/);
        expect(css).toMatch(/\.aparte-tool-part-body\s*\{[^}]*max-height:\s*var\(--aparte-tool-part-max-height\)[^}]*overflow:\s*auto/);
    });

    it('is a focusable, named region, so a keyboard can scroll it', () => {
        const host = document.createElement('div');
        host.innerHTML = String(getSegmentRenderer('tool_call')!.render(call)).trim();
        const body = host.querySelector<HTMLElement>('[data-part="output"] .aparte-tool-part-body')!;
        expect(body.getAttribute('role')).toBe('region');
        expect(body.getAttribute('tabindex')).toBe('0');
        expect(body.getAttribute('aria-label')).toBe('Output');
    });
});
