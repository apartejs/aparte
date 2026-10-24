/**
 * The row reads what the app declared: a label in place of the identifier, an icon.
 *
 * Every row wore the same glyph and the tool's identifier in a code font — `web_search` —
 * which is the app's wire format, not something to show a person. `registerToolDisplay`
 * gives the row a label and an icon; the identifier stays on the row as `data-tool-name`,
 * and without a display the row reads exactly as before. Core never invents a label.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

function seg(over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment {
    return {
        id: 's1', type: 'tool_call', messageId: 'm1', index: 0,
        toolCall: { id: 'c1', name: 'web_search', input: { query: 'Lille weather' } },
        status: 'pending',
        ...over,
    } as AparteToolCallSegment;
}

function draw(segment: AparteToolCallSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    return el;
}

const nameOf = (el: Element) => el.querySelector<HTMLElement>('.aparte-tool-name')!;
const iconOf = (el: Element) => el.querySelector<HTMLElement>('.aparte-tool-icon')!.innerHTML;
/** A glyph as the DOM serialises it, so `<path/>` and `<path></path>` compare equal. */
const glyph = (name: string) => { const d = document.createElement('div'); d.innerHTML = aparteGlobalConfig.getIcon(name) ?? ''; return d.innerHTML; };

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('web_search');
    aparteGlobalConfig.unregisterToolDisplay('*');
    document.body.innerHTML = '';
});

describe('the row with nothing declared', () => {
    it('shows the identifier in the code font, and carries it as data-tool-name', () => {
        const el = draw(seg());
        expect(nameOf(el).textContent).toBe('web_search');
        expect(nameOf(el).classList.contains('aparte-tool-name--label')).toBe(false);
        expect(el.getAttribute('data-tool-name')).toBe('web_search');
        expect(iconOf(el)).toBe(glyph('tool'));
    });
});

describe('the row with a display', () => {
    it('a label replaces the identifier, out of the code font; the identifier stays on the row', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Web search' });
        const el = draw(seg());
        expect(nameOf(el).textContent).toBe('Web search');
        expect(nameOf(el).classList.contains('aparte-tool-name--label')).toBe(true);
        expect(el.getAttribute('data-tool-name')).toBe('web_search');
    });

    it('a label function reads the call, and follows it as it updates', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', {
            label: (s) => (s.status === 'resolved' ? 'Searched the web' : 'Searching the web'),
        });
        const el = draw(seg());
        expect(nameOf(el).textContent).toBe('Searching the web');
        renderer().update!(el, seg({ status: 'resolved', result: '11°C' }));
        expect(nameOf(el).textContent).toBe('Searched the web');
    });

    it('a label that throws, or says nothing, falls back to the identifier', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: () => { throw new Error('bad input'); } });
        expect(nameOf(draw(seg())).textContent).toBe('web_search');
        aparteGlobalConfig.registerToolDisplay('web_search', { label: '  ' });
        expect(nameOf(draw(seg())).textContent).toBe('web_search');
    });

    it('a label is text, never markup', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: '<img src=x onerror=alert(1)>' });
        const el = draw(seg());
        expect(el.querySelector('img')).toBeNull();
        expect(nameOf(el).textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('an icon key draws that glyph; an unknown key falls back to the tool glyph', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { icon: 'file' });
        expect(iconOf(draw(seg()))).toBe(glyph('file'));
        aparteGlobalConfig.registerToolDisplay('web_search', { icon: 'no-such-glyph' });
        expect(iconOf(draw(seg()))).toBe(glyph('tool'));
    });

    it('a display registered after the row was drawn reaches it on relabel', () => {
        const el = draw(seg());
        aparteGlobalConfig.registerToolDisplay('*', { label: 'Tool', icon: 'edit' });
        renderer().relabel!(el, seg());
        expect(nameOf(el).textContent).toBe('Tool');
        expect(iconOf(el)).toBe(glyph('edit'));
    });
});
