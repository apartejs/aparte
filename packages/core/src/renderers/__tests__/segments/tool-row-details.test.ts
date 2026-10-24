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

    it('its line is the same flex line a summary is, so the narrow-screen rules reach it', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: false });
        const line = draw(call()).querySelector('.aparte-tool-line');
        expect(line).not.toBeNull();
        expect(line!.querySelector('.aparte-tool-name')).not.toBeNull();
        expect(line!.querySelector('.aparte-tool-state')).not.toBeNull();
        expect(line!.querySelector('.aparte-tool-note')).not.toBeNull();
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

    it('a string is inserted as HTML', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: () => '<p class="said">3 pages</p>' });
        expect(draw(call()).querySelector('.aparte-tool-detail .said')?.textContent).toBe('3 pages');
    });

    it('a string goes through the HTML sanitizer: what a tool returned can carry a script', () => {
        // The simple API, fed straight from a tool's result (a web page's title): an app that
        // interpolates it unescaped must not put a script on the page.
        const hostile = '<p class="said">Trail guide</p><img src="x" onerror="window.__pwned = 1"><script>window.__pwned = 1</script>';
        aparteGlobalConfig.registerToolDisplay('web_search', { details: () => hostile });
        const el = draw(call());
        expect(el.querySelector('.said')?.textContent).toBe('Trail guide');
        expect(el.querySelector('script')).toBeNull();
        expect(el.querySelector('[onerror]')).toBeNull();
        const after = updated(el, call({ result: '[]' }));
        expect(after.querySelector('script, [onerror]')).toBeNull();
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

    it('goes back to the line alone when it returns \'\' on an update', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: (segment) => (segment.status === 'resolved' ? '<p>found</p>' : '') });
        let el = draw(call());
        expect(el.tagName).toBe('DETAILS');
        el = updated(el, call({ status: 'failed' }));
        expect(el.tagName).toBe('DIV');
        expect(el.querySelector('.aparte-tool-line .aparte-tool-name')).not.toBeNull();
    });

    it('a string is drawn again on an update', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: (segment) => `<p class="said">${segment.status}</p>` });
        const el = draw(call({ status: 'pending' }));
        expect(updated(el, call()).querySelector('.said')?.textContent).toBe('resolved');
    });

    it('is asked once per update, and never for a call another renderer draws', () => {
        let asked = 0;
        aparteGlobalConfig.registerToolDisplay('*', { details: () => { asked++; return '<p>x</p>'; } });
        let el = draw(call({ status: 'pending', result: undefined }));
        asked = 0;
        el = updated(el, call());
        expect(asked, 'one update, one call — the rebuild reuses it').toBe(1);

        aparteGlobalConfig.registerToolRenderer('web_search', { render: () => '<div class="mine">mine</div>' });
        asked = 0;
        updated(el, call());
        expect(asked, 'a renderer draws this tool: its output could not be used').toBe(0);
    });

    it('when the display drops it, the next update draws Input and Output alone — not around the app\'s detail', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources });
        const el = draw(call());
        aparteGlobalConfig.unregisterToolDisplay('web_search');
        const after = updated(el, call());
        expect(after.querySelector('.sources')).toBeNull();
        expect(after.querySelectorAll('.aparte-tool-part').length).toBe(2);
    });
});

describe('a rebuilt row keeps its identity', () => {
    it('a renderer\'s root without data-segment-id gets it on an update\'s rebuild too', () => {
        // The bubble stamps it on its own render; an update that rebuilds did not, so the
        // next update missed the row and the whole bubble was drawn again.
        aparteGlobalConfig.registerToolRenderer('web_search', { render: () => '<div class="mine">mine</div>' });
        const el = draw(call({ status: 'pending' }));
        el.setAttribute('data-segment-id', 's1');
        renderer().update!(el, call());
        expect(document.body.querySelector('.mine')?.getAttribute('data-segment-id')).toBe('s1');
    });

    it('a quiet row that stops being quiet loses data-quiet on an update', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: true });
        const el = draw(call({ status: 'pending' }));
        aparteGlobalConfig.unregisterToolDisplay('web_search');
        renderer().update!(el, call({ status: 'pending' }));
        expect(document.body.querySelector('[data-segment-id="s1"]')!.hasAttribute('data-quiet')).toBe(false);
    });
});

describe('details on a language switch', () => {
    afterEach(() => aparteGlobalConfig.resetLocale());

    // An app detail that reads aparté's locale, as one written with `t()` would.
    const said = (segment: AparteToolCallSegment): HTMLElement => {
        const p = document.createElement('p');
        p.className = 'said';
        p.textContent = `${aparteGlobalConfig.t('toolOutput')}: ${segment.result}`;
        return p;
    };

    it('asks the function again and writes the new words into the nodes already there', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: said });
        const el = draw(call({ result: '3 pages' })) as HTMLDetailsElement;
        el.open = true;
        const before = el.querySelector('.said')!;
        aparteGlobalConfig.extendLocale({ toolOutput: 'Sortie' });
        renderer().relabel!(el, call({ result: '3 pages' }));
        expect(el.querySelector('.said')).toBe(before);
        expect(before.textContent).toBe('Sortie: 3 pages');
        expect(el.open).toBe(true);
    });

    it('adds or removes no node when nothing it draws changed', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources });
        const el = draw(call());
        const seen: MutationRecord[] = [];
        const observer = new MutationObserver((records) => seen.push(...records));
        observer.observe(el.querySelector('.aparte-tool-detail')!, { childList: true, subtree: true, characterData: true, attributes: true });
        renderer().relabel!(el, call());
        seen.push(...observer.takeRecords());
        observer.disconnect();
        expect(seen).toEqual([]);
    });

    it('keeps what the reader opened and what the app\'s code set: only what the function changed is written', () => {
        // Relabel runs on EVERY config change — a model picked in the selector included —
        // so comparing with the live DOM closed what the reader had opened.
        aparteGlobalConfig.registerToolDisplay('web_search', {
            details: () => '<details class="src"><summary>Trail guide</summary><p>11 km shore loop</p></details>',
        });
        const el = draw(call());
        const nested = el.querySelector<HTMLDetailsElement>('.src')!;
        nested.open = true;                       // the reader
        nested.setAttribute('data-seen', '1');    // the app's own code
        renderer().relabel!(el, call());
        expect(el.querySelector('.src')).toBe(nested);
        expect(nested.open).toBe(true);
        expect(nested.getAttribute('data-seen')).toBe('1');
    });

    it('leaves alone a detail the function hands back as the same element', () => {
        const mine = document.createElement('div');
        mine.className = 'mine';
        mine.textContent = 'kept';
        aparteGlobalConfig.registerToolDisplay('web_search', { details: () => mine });
        const el = draw(call());
        renderer().relabel!(el, call());
        expect(el.querySelector('.aparte-tool-detail .mine')).toBe(mine);
    });

    it('replaces it when what it draws changed shape', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { details: sources });
        const el = draw(call());
        renderer().relabel!(el, call({ result: '[{"title":"Trail guide"},{"title":"Off-season"}]' }));
        expect(el.querySelectorAll('.sources li').length).toBe(2);
    });
});
