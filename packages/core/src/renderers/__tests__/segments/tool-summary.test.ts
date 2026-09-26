/**
 * The default tool row says what a call targets, when the app says how to read it.
 *
 * The row named the tool and kept the arguments behind its disclosure, so a reader saw
 * `read_file ✓ Done` and not which file. The only way to add that one line was
 * `registerToolRenderer`, which replaces the whole row — its six states, the spinner,
 * the disclosure and the relabel contract — for a line of text. `registerToolSummary`
 * keeps the row and adds the line after the name.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();

const renderer = () => getSegmentRenderer('tool_call')!;

const call = (input: Record<string, unknown>, extra: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call',
    toolCall: { id: 'c1', name: 'read_file', input },
    status: 'pending',
    ...extra,
} as AparteToolCallSegment);

function mount(segment: AparteToolCallSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    return el;
}

const target = (root: Element = document.body): HTMLElement =>
    root.querySelector('.aparte-tool-target') as HTMLElement;

const byPath = (segment: AparteToolCallSegment): string => String(segment.toolCall.input['path'] ?? '');

afterEach(() => {
    aparteGlobalConfig.unregisterToolSummary('read_file');
    aparteGlobalConfig.unregisterToolRenderer('read_file');
    document.body.innerHTML = '';
});

describe('registerToolSummary', () => {
    it('shows the target after the tool name, in the default row', () => {
        aparteGlobalConfig.registerToolSummary('read_file', byPath);
        const el = mount(call({ path: 'skills.json' }));

        expect(el.querySelector('.aparte-tool-name')?.textContent).toBe('read_file');
        expect(target(el).textContent).toBe('skills.json');
        expect(target(el).hidden).toBe(false);
        // The row is still core's: the state, the spinner and the disclosure are there.
        expect(el.tagName).toBe('DETAILS');
        expect(el.querySelector('.aparte-tool-state')).not.toBeNull();
        expect(el.querySelector('.aparte-tool-spinner')).not.toBeNull();
    });

    it('writes the summary as text, never as markup', () => {
        aparteGlobalConfig.registerToolSummary('read_file', byPath);
        const el = mount(call({ path: '<img src=x onerror="alert(1)">' }));

        expect(el.querySelector('img')).toBeNull();
        expect(target(el).textContent).toBe('<img src=x onerror="alert(1)">');
    });

    it('keeps an empty, hidden container when no summary is registered', () => {
        const el = mount(call({ path: 'skills.json' }));

        expect(target(el)).not.toBeNull();
        expect(target(el).hidden).toBe(true);
        expect(target(el).textContent).toBe('');
    });

    it('hides the container when the summary has nothing to say', () => {
        aparteGlobalConfig.registerToolSummary('read_file', () => '   ');
        expect(target(mount(call({ path: 'x' }))).hidden).toBe(true);
    });

    it('costs the row its line, not its render, when the summary throws', () => {
        aparteGlobalConfig.registerToolSummary('read_file', () => { throw new Error('bad input'); });
        const el = mount(call({ path: 'x' }));

        expect(el.querySelector('.aparte-tool-name')?.textContent).toBe('read_file');
        expect(target(el).hidden).toBe(true);
    });

    it('follows the arguments when an update changes them, patching the same element', () => {
        aparteGlobalConfig.registerToolSummary('read_file', byPath);
        const el = mount(call({ path: 'a.json' }));
        el.setAttribute('open', '');

        renderer().update!(el, call({ path: 'b.json' }, { status: 'resolved', result: 'ok' }));

        expect(document.body.firstElementChild).toBe(el);
        expect(el.hasAttribute('open')).toBe(true);
        expect(target(el).textContent).toBe('b.json');
    });

    it('fills in when the arguments arrive after the row was drawn', () => {
        aparteGlobalConfig.registerToolSummary('read_file', byPath);
        mount(call({}));
        expect(target().hidden).toBe(true);

        renderer().update!(document.body.firstElementChild as HTMLElement, call({ path: 'late.json' }));

        expect(target().textContent).toBe('late.json');
        expect(target().hidden).toBe(false);
    });

    it('reaches a row already on screen through relabel, on the next config change', () => {
        const el = mount(call({ path: 'skills.json' }));
        aparteGlobalConfig.registerToolSummary('read_file', byPath);

        renderer().relabel!(el, call({ path: 'skills.json' }));

        expect(target(el).textContent).toBe('skills.json');
        expect(target(el).hidden).toBe(false);
    });

    it('is not read for a tool that draws its own row', () => {
        let read = 0;
        aparteGlobalConfig.registerToolSummary('read_file', () => { read++; return 'x'; });
        aparteGlobalConfig.registerToolRenderer('read_file', { render: () => '<div class="mine">mine</div>' });

        const html = String(renderer().render(call({ path: 'x' })));

        expect(html).toContain('class="mine"');
        expect(html).not.toContain('aparte-tool-target');
        expect(read).toBe(0);
    });

    it('is cleared by reset()', () => {
        aparteGlobalConfig.registerToolSummary('read_file', byPath);
        aparteGlobalConfig.reset();
        expect(aparteGlobalConfig.getToolSummary('read_file')).toBeUndefined();
    });
});
