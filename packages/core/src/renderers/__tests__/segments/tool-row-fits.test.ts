/**
 * The tool row fits a phone, and its parts read as one surface.
 *
 * At 375px the identifier painted over the state word ("delete_fi✕Rejected") as soon as
 * a note shared the line: the label could shrink, the name inside it could not, and its
 * text spilled. The state never yields now; the note and the target give way first,
 * then the name, cut with an ellipsis. A declared label stays on one line.
 *
 * And Input and Output read as one surface whether or not a highlighter coloured them:
 * the coloured part had a panel and the plain one had none. Both get the code surface,
 * at a size that sits under the row rather than above it.
 *
 * Layout itself is measured in a browser; this pins the rules that make it.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    expect(at, `a rule for ${selector}`).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
};

describe('the tool row on a narrow screen', () => {
    it('never shrinks the state word', () => {
        expect(rule('.aparte-tool-state')).toMatch(/flex:\s*none/);
    });

    it('cuts the name with an ellipsis rather than letting it spill', () => {
        const name = rule('.aparte-tool-name');
        expect(name).toMatch(/min-width:\s*0/);
        expect(name).toMatch(/overflow:\s*hidden/);
        expect(name).toMatch(/text-overflow:\s*ellipsis/);
        expect(name).toMatch(/white-space:\s*nowrap/);
    });

    // By GROWTH from a zero basis, not by shrink factors: a shrink is weighted by the part's
    // width, so `flex-shrink: 1000` on the target still left the name a sliver of every
    // deficit (0.05px in a 458px row), and the ellipsis ate its last letters. Growth is handed
    // out by factor and each part stops at its own width: the name first, the note next, the
    // target last — so the target gives way first, then the note, the name last.
    const grow = (selector: string): number => {
        const flex = /flex:\s*(\d+)\s+1\s+0\s*;/.exec(rule(selector));
        expect(flex, `${selector} grows from a zero basis`).not.toBeNull();
        expect(rule(selector)).toMatch(/max-width:\s*max-content/);
        return Number(flex![1]);
    };

    it('gives way with the target first, then the note, the name last', () => {
        expect(grow('.aparte-tool-name')).toBeGreaterThan(grow('.aparte-tool-note'));
        expect(grow('.aparte-tool-note')).toBeGreaterThan(grow('.aparte-tool-target'));
    });

    it('puts the name, the target and the note on one flex line: the label lends its children to it', () => {
        expect(css).toMatch(/:is\(\.aparte-tool-summary, \.aparte-tool-line\) > \.aparte-tool-label \{ display: contents; \}/);
    });
});

describe('what the call is doing now', () => {
    it('takes a line of its own, last, under the first: the row wraps for it alone', () => {
        const activity = rule('.aparte-tool-activity');
        expect(activity).toMatch(/order:\s*2/);
        expect(activity).toMatch(/flex:\s*1 0 100%/);
        expect(activity).toMatch(/white-space:\s*nowrap/);
        expect(activity).toMatch(/text-overflow:\s*ellipsis/);
        const at = css.search(/\.aparte-tool-line\s*[,{]/);
        const line = css.slice(css.indexOf('{', at), css.indexOf('}', at));
        expect(line).toMatch(/flex-wrap:\s*wrap/);
        expect(line).toMatch(/row-gap:\s*0/);
    });

    it('starts where the name starts, from the line\'s logical start', () => {
        expect(rule('.aparte-tool-activity')).toMatch(/padding-inline-start:\s*calc\(var\(--aparte-font-size-md\) \+ var\(--aparte-space-3\)\)/);
        // An agent's row leads with its chevron: the indent counts it and its gap too.
        expect(rule('.aparte-segment-tool-call:not([data-quiet]) > .aparte-tool-summary > .aparte-tool-activity'))
            .toMatch(/padding-inline-start:\s*calc\(var\(--aparte-space-8\) \+ var\(--aparte-space-4\) \+ var\(--aparte-font-size-md\) \+ var\(--aparte-space-3\)\)/);
    });
});

describe('a row with nothing behind its line', () => {
    // `details: false`, or a call with no arguments and no result yet: no <summary>, so the
    // line needs its own flex container, or the rules above — which only work on flex
    // items — never apply, and it sits tighter than the rows beside it.
    const block = (): string => {
        const at = css.search(/\.aparte-tool-line\s*[,{]/);
        expect(at, 'a rule for .aparte-tool-line').toBeGreaterThan(-1);
        return css.slice(css.indexOf('{', at), css.indexOf('}', at));
    };

    it('is laid out as the summary line is: a flex row with its gap, padding and column margin', () => {
        const line = block();
        expect(line).toMatch(/display:\s*flex/);
        expect(line).toMatch(/gap:\s*var\(--aparte-space-4\)/);
        expect(line).toMatch(/padding:\s*var\(--aparte-space-2\) var\(--aparte-space-3\)/);
        expect(line).toMatch(/margin-inline:/);
    });

    it('offers no pointer: there is nothing to open (decision #8)', () => {
        expect(block()).not.toMatch(/cursor:\s*pointer/);
    });
});

describe('a tool part', () => {
    it('reads on the code surface, coloured or not, at the small size', () => {
        const pre = rule('.aparte-tool-part-body pre');
        expect(pre).toMatch(/background:\s*var\(--aparte-code-bg\)/);
        expect(pre).toMatch(/font-size:\s*var\(--aparte-font-size-sm\)/);
        expect(pre).toMatch(/font-family:\s*var\(--aparte-code-font-family\)/);
    });
});

describe('a note cut by the ellipsis', () => {
    it('can still be read whole: it is its own title, and follows an update', async () => {
        const { getSegmentRenderer, registerDefaultRenderers } = await import('../../segment-renderers.js');
        registerDefaultRenderers();
        const renderer = getSegmentRenderer('tool_call')!;
        const words = 'keep the staging bucket and archive the old one instead';
        const segment = (status: string, refusal?: object) => ({
            id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status,
            toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } },
            ...(refusal ? { refusal, result: `The user rejected this tool call and said: ${words}` } : {}),
        }) as never;
        const tpl = document.createElement('template');
        tpl.innerHTML = String(renderer.render(segment('pending'))).trim();
        const el = tpl.content.firstElementChild as HTMLElement;
        expect(el.querySelector('.aparte-tool-note')?.hasAttribute('title')).toBe(false);
        renderer.update!(el, segment('rejected', { by: 'person', instruction: words }));
        expect(el.querySelector('.aparte-tool-note')?.getAttribute('title')).toBe(`You said: “${words}”`);
    });
});
