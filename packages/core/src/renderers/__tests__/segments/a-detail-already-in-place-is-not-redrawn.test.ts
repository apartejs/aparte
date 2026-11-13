/**
 * An app's detail that is already in place is left alone on an update.
 *
 * A detail function may keep ONE element and complete it itself — a sub-agent's
 * conversation growing under its line. Handed back on every update of the call, it used to
 * be put in place again and serialised (`outerHTML`) each time: with a long conversation
 * under the line, a full re-read of it per token.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending',
    toolCall: { id: 'c1', name: 'delegate', input: {} },
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = renderer().render(segment);
    const tpl = document.createElement('template');
    if (typeof out === 'string') tpl.innerHTML = out.trim();
    const el = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement;
    document.body.appendChild(el);
    renderer().setup?.(el, segment);
    return el;
}

const row = (): HTMLElement => document.body.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
const detail = (): Element => row().querySelector('.aparte-tool-detail[data-details="app"]')!;

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('delegate');
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('a detail already in place is not redrawn', () => {
    it('the same element keeps its place, and nothing of it is serialised again', () => {
        const transcript = document.createElement('ol');
        transcript.innerHTML = '<li>first step</li>';
        aparteGlobalConfig.registerToolDisplay('delegate', { details: () => transcript });
        const el = draw(call());
        expect(detail().firstElementChild).toBe(transcript);

        const outer = vi.spyOn(Element.prototype, 'outerHTML', 'get');
        const replace = vi.spyOn(Element.prototype, 'replaceChildren');
        for (let i = 0; i < 5; i++) {
            transcript.insertAdjacentHTML('beforeend', `<li>step ${i}</li>`);
            renderer().update!(row(), call({ result: `token ${i}` }));
        }
        expect(row()).toBe(el);
        expect(detail().firstElementChild).toBe(transcript);
        expect(transcript.children).toHaveLength(6);
        expect(outer).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });

    it('what the reader opened inside it stays open', () => {
        const transcript = document.createElement('div');
        transcript.innerHTML = '<details><summary>a step</summary>its result</details>';
        aparteGlobalConfig.registerToolDisplay('delegate', { details: () => transcript });
        draw(call());
        transcript.querySelector('details')!.open = true;
        renderer().update!(row(), call({ status: 'resolved', result: 'done' }));
        expect(transcript.querySelector('details')!.open).toBe(true);
    });

    it('a new element replaces the one in place', () => {
        let body = document.createElement('p');
        body.textContent = 'one';
        aparteGlobalConfig.registerToolDisplay('delegate', { details: () => body });
        draw(call());
        const first = body;
        body = document.createElement('p');
        body.textContent = 'two';
        renderer().update!(row(), call({ result: 'x' }));
        expect(detail().firstElementChild).toBe(body);
        expect(first.isConnected).toBe(false);
    });

    it('a string is written again on every update', () => {
        let text = '<p>one</p>';
        aparteGlobalConfig.registerToolDisplay('delegate', { details: () => text });
        draw(call());
        text = '<p>two</p>';
        renderer().update!(row(), call({ result: 'x' }));
        expect(detail().textContent).toBe('two');
    });
});
