/**
 * A tool part is coloured as JSON only when it IS JSON.
 *
 * Both parts went to the highlighter as `json` whatever they held — "a tool result is
 * usually json" — so a prose result, a shell transcript or a formatter's sentence came
 * back tinted as if it were an object. A part is JSON when it parses to an object or an
 * array; it is then pretty-printed, as the input already is, and coloured. Anything else
 * is shown as the text it is, and the highlighter is not asked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'search', input: { q: 'lille' } }, result: 'It is 11°C and overcast.',
    ...over,
} as AparteToolCallSegment);

function mount(segment: AparteToolCallSegment): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = String(renderer().render(segment)).trim();
    const el = host.firstElementChild as HTMLElement;
    document.body.appendChild(host);
    renderer().setup?.(el, segment);
    return el;
}

const text = (el: Element, part: string) => el.querySelector(`[data-part="${part}"] .aparte-tool-part-body`)?.textContent;

afterEach(() => {
    vi.restoreAllMocks();
    aparteGlobalConfig.unregisterToolInputFormatter('search');
    document.body.innerHTML = '';
});

describe('a tool part is JSON only when it is JSON', () => {
    it('a prose result is shown as text, and never handed to the highlighter as json', () => {
        const highlight = vi.spyOn(aparteGlobalConfig, 'highlightCode');
        mount(call());
        expect(highlight.mock.calls.map(([source]) => source)).not.toContain('It is 11°C and overcast.');
    });

    it('a JSON object result is pretty-printed and coloured as json', () => {
        const highlight = vi.spyOn(aparteGlobalConfig, 'highlightCode');
        const el = mount(call({ result: '{"temp":11,"sky":"overcast"}' }));
        const pretty = '{\n  "temp": 11,\n  "sky": "overcast"\n}';
        expect(text(el, 'output')).toBe(pretty);
        expect(highlight).toHaveBeenCalledWith(pretty, 'json');
    });

    it('a scalar that happens to parse is not an object: shown as it came', () => {
        const highlight = vi.spyOn(aparteGlobalConfig, 'highlightCode');
        const el = mount(call({ result: '42' }));
        expect(text(el, 'output')).toBe('42');
        expect(highlight.mock.calls.map(([source]) => source)).not.toContain('42');
    });

    it('an input a formatter wrote as a sentence is not coloured either', () => {
        aparteGlobalConfig.registerToolInputFormatter('search', (input) => `Searching for ${String(input['q'])}`);
        const highlight = vi.spyOn(aparteGlobalConfig, 'highlightCode');
        const el = mount(call());
        expect(text(el, 'input')).toBe('Searching for lille');
        expect(highlight.mock.calls.map(([source]) => source)).not.toContain('Searching for lille');
    });

    it('the JSON input is still coloured', () => {
        const highlight = vi.spyOn(aparteGlobalConfig, 'highlightCode');
        mount(call());
        expect(highlight).toHaveBeenCalledWith('{\n  "q": "lille"\n}', 'json');
    });

    it('an update to the same JSON does not rewrite the part', () => {
        const el = mount(call({ result: '{"a":1}' }));
        const code = el.querySelector('[data-part="output"] code');
        renderer().update!(el, call({ result: '{"a":1}' }));
        expect(el.querySelector('[data-part="output"] code')).toBe(code);
    });
});
