/**
 * What a tool row shows behind its line.
 *
 * By default, Input and Output — a developer's view, and a person-facing chat had no way
 * out of it short of hiding the call or rewriting the whole row: the one-click raw JSON
 * Open WebUI #21440 and LibreChat #7362 ask to keep from people. A display's `details`
 * says it: `false` for the line alone, or a function whose output stands in for Input and
 * Output under the default line.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'web_search', input: { query: 'lake varden' } }, result: '[{"title":"Trail guide"}]',
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    // A row with an app's detail comes back as an element, as the bubble accepts.
    const out = renderer().render(segment);
    const tpl = document.createElement('template');
    if (typeof out === 'string') tpl.innerHTML = out.trim();
    const el = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement;
    document.body.appendChild(el);
    renderer().setup?.(el, segment);
    return el;
}

/** The row the bubble holds after an update: `update` may replace the element it was given. */
function updated(el: HTMLElement, segment: AparteToolCallSegment): HTMLElement {
    renderer().update!(el, segment);
    return document.body.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
}

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('web_search');
    aparteGlobalConfig.unregisterToolDisplay('*');
    aparteGlobalConfig.unregisterToolRenderer('web_search');
    aparteGlobalConfig.clearSegmentDefaults('tool_call');
    document.body.innerHTML = '';
});

describe('details: false — the line alone', () => {
    it('a call with arguments and a result draws its line and no disclosure', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searched the web', details: false });
        const el = draw(call());
        expect(el.tagName).toBe('DIV');
        expect(el.querySelector('.aparte-tool-name')?.textContent).toBe('Searched the web');
        expect(el.querySelector('.aparte-tool-state')?.textContent).toContain('Done');
        expect(el.querySelector('.aparte-tool-part, .aparte-tool-detail')).toBeNull();
        expect(el.textContent).not.toContain('lake varden');
    });

    it('stays the line alone as the call runs and resolves', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: false });
        let el = draw(call({ status: 'pending', result: undefined }));
        el = updated(el, call());
        expect(el.tagName).toBe('DIV');
        expect(el.getAttribute('data-status')).toBe('resolved');
        expect(el.querySelector('.aparte-tool-part, .aparte-tool-detail')).toBeNull();
    });

    it('nothing to open, so neither open nor a segment\'s collapsed opens anything', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: false, open: true });
        expect(draw(call()).tagName).toBe('DIV');
        expect(draw(call({ collapsed: false })).tagName).toBe('DIV');
    });

    it('on \'*\' it reaches every tool nothing more specific describes — a tool with an entry of its own is described whole by it', () => {
        aparteGlobalConfig.registerToolDisplay('*', { details: false });
        expect(draw(call({ toolCall: { id: 'c2', name: 'read_file', input: { path: 'a.txt' } }, id: 's2' })).tagName).toBe('DIV');
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searched the web' });
        expect(draw(call()).tagName).toBe('DETAILS');
    });

    it('a registered renderer still wins: it draws the whole row', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: false });
        aparteGlobalConfig.registerToolRenderer('web_search', { render: () => '<div class="mine">mine</div>' });
        expect(draw(call()).className).toBe('mine');
    });

    it('hidden still wins: the call draws its empty placeholder', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: false, hidden: true });
        const el = draw(call());
        expect(el.hidden).toBe(true);
        expect(el.childElementCount).toBe(0);
    });
});

/** A search's results as a person reads them: titles, no JSON. */
function sources(segment: AparteToolCallSegment): HTMLElement | string {
    if (segment.status !== 'resolved') return '';
    const list = document.createElement('ul');
    list.className = 'sources';
    for (const hit of JSON.parse(segment.result ?? '[]') as { title: string }[]) {
        const item = document.createElement('li');
        item.textContent = hit.title;
        list.appendChild(item);
    }
    return list;
}

describe('details: a function — the app\'s detail under the default line', () => {
    it('what it returns stands in for Input and Output, under the same line', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searched the web', details: sources });
        const el = draw(call());
        expect(el.tagName).toBe('DETAILS');
        expect(el.querySelector('.aparte-tool-name')?.textContent).toBe('Searched the web');
        expect(el.querySelector('.aparte-tool-detail .sources li')?.textContent).toBe('Trail guide');
        expect(el.querySelector('.aparte-tool-part')).toBeNull();
        expect(el.textContent).not.toContain('lake varden');
    });

    it('a string is inserted as HTML, the renderer\'s contract', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: () => '<p class="said">3 pages</p>' });
        expect(draw(call()).querySelector('.aparte-tool-detail .said')?.textContent).toBe('3 pages');
    });

    it('\'\' is nothing behind the line yet, and the disclosure appears once there is something', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources });
        let el = draw(call({ status: 'pending', result: undefined }));
        expect(el.tagName).toBe('DIV');
        el = updated(el, call());
        expect(el.tagName).toBe('DETAILS');
        expect(el.querySelector('.sources li')?.textContent).toBe('Trail guide');
    });

    it('an update draws it again without closing what the reader opened', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources });
        const el = draw(call()) as HTMLDetailsElement;
        el.open = true;
        const after = updated(el, call({ result: '[{"title":"Trail guide"},{"title":"Off-season"}]' })) as HTMLDetailsElement;
        expect(after).toBe(el);
        expect(after.open).toBe(true);
        expect([...after.querySelectorAll('.sources li')].map((li) => li.textContent)).toEqual(['Trail guide', 'Off-season']);
    });

    it('one that throws costs the row its detail — never its line, and never the raw parts', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searched the web', details: () => { throw new Error('bad'); } });
        const el = draw(call());
        expect(el.tagName).toBe('DIV');
        expect(el.querySelector('.aparte-tool-name')?.textContent).toBe('Searched the web');
        expect(el.querySelector('.aparte-tool-part')).toBeNull();
    });

    it('open applies as it does to the default detail', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources, open: true });
        expect((draw(call()) as HTMLDetailsElement).open).toBe(true);
    });
});
