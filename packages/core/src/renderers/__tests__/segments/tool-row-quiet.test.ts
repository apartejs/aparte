/**
 * A quiet tool row: the line a person reads in a conversational chat, and the default.
 *
 * No consumer chat shows a spinner and "Running", then "✓ Done" — the label's tense carries
 * the state ("Searching the web…", then "Searched the web"), a light sweeps across it while it
 * runs, and nothing marks success. That is the row a tool gets unless a display says
 * `quiet: false`, the agent's row. What a person must act on or know still says so: a wait
 * for approval, a refusal, a failure, a stop. The state word a quiet row does not show is
 * still read by a screen reader, and shown where the sweep cannot say "running".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name: 'web_search', input: { query: 'lake varden' } }, result: '3 pages',
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    const out = renderer().render(segment);
    const tpl = document.createElement('template');
    if (typeof out === 'string') tpl.innerHTML = out.trim();
    const el = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement;
    document.body.appendChild(el);
    return el;
}
function updated(el: HTMLElement, segment: AparteToolCallSegment): HTMLElement {
    renderer().update!(el, segment);
    return document.body.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
}

const state = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-state')!;
const spinner = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-spinner')!;
const name = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-name')!;
const shown = (node: HTMLElement) => !node.classList.contains('aparte-sr-only');

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('web_search');
    aparteGlobalConfig.resetLocale();
    document.body.innerHTML = '';
});

describe('a quiet row', () => {
    it('while it runs: the label shimmers, no spinner, the word only for a screen reader', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searching the web…', quiet: true });
        const el = draw(call({ status: 'pending', result: undefined }));
        expect(el.hasAttribute('data-quiet')).toBe(true);
        expect(name(el).classList.contains('aparte-shimmer')).toBe(true);
        expect(spinner(el).hidden).toBe(true);
        expect(shown(state(el))).toBe(false);
        expect(state(el).textContent).toContain('Running');
    });

    it('once done: no shimmer, and nothing marks success but the words a screen reader hears', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: true });
        const el = draw(call());
        expect(name(el).classList.contains('aparte-shimmer')).toBe(false);
        expect(shown(state(el))).toBe(false);
        expect(state(el).textContent).toContain('Done');
    });

    it('still says what a person must know: a wait for approval, a refusal, a failure, a stop', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: true });
        for (const status of ['awaiting-approval', 'rejected', 'failed', 'aborted'] as const) {
            const el = draw(call({ id: `s-${status}`, status }));
            expect(shown(state(el)), status).toBe(true);
            expect(name(el).classList.contains('aparte-shimmer'), status).toBe(false);
        }
    });

    it('an update moves it along on the same element: running, done, failed', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: true });
        let el = draw(call({ status: 'pending' }));
        const first = el;
        el = updated(el, call());
        expect(el).toBe(first);
        expect(name(el).classList.contains('aparte-shimmer')).toBe(false);
        expect(shown(state(el))).toBe(false);
        el = updated(el, call({ status: 'failed' }));
        expect(shown(state(el))).toBe(true);
        expect(state(el).textContent).toContain('Failed');
    });

    it('a language switch keeps it quiet', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: true });
        const el = draw(call({ status: 'pending' }));
        aparteGlobalConfig.extendLocale({ toolRunning: 'En cours' });
        renderer().relabel!(el, call({ status: 'pending' }));
        expect(state(el).textContent).toContain('En cours');
        expect(shown(state(el))).toBe(false);
        expect(name(el).classList.contains('aparte-shimmer')).toBe(true);
        expect(spinner(el).hidden).toBe(true);
    });

    it('is the default: a row with no display of its own is quiet', () => {
        const el = draw(call({ status: 'pending' }));
        expect(el.hasAttribute('data-quiet')).toBe(true);
        expect(spinner(el).hidden).toBe(true);
        expect(shown(state(el))).toBe(false);
        expect(name(el).classList.contains('aparte-shimmer')).toBe(true);
    });

    it('a display that sets only a label keeps the quiet default', () => {
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Searching the web…' });
        const el = draw(call({ status: 'pending' }));
        expect(el.hasAttribute('data-quiet')).toBe(true);
    });

    it("quiet: false is an agent's row: spinner, the word, no shimmer", () => {
        aparteGlobalConfig.registerToolDisplay('*', { quiet: false });
        const el = draw(call({ status: 'pending' }));
        expect(el.hasAttribute('data-quiet')).toBe(false);
        expect(spinner(el).hidden).toBe(false);
        expect(shown(state(el))).toBe(true);
        expect(name(el).classList.contains('aparte-shimmer')).toBe(false);
    });

    it("a tool's own entry is used whole: it says quiet: false itself, or it is quiet", () => {
        aparteGlobalConfig.registerToolDisplay('*', { quiet: false });
        aparteGlobalConfig.registerToolDisplay('web_search', { label: 'Web search' });
        expect(draw(call({ status: 'pending' })).hasAttribute('data-quiet')).toBe(true);
        aparteGlobalConfig.registerToolDisplay('web_search', { quiet: false });
        expect(draw(call({ status: 'pending' })).hasAttribute('data-quiet')).toBe(false);
    });
});

describe('a quiet row on the page', () => {
    const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rule = (selector: string): string => {
        const at = css.indexOf(`${selector} {`);
        expect(at, `a rule for ${selector}`).toBeGreaterThan(-1);
        return css.slice(at, css.indexOf('}', at));
    };

    it('writes the target in the chat\'s font, not the code font', () => {
        expect(rule('.aparte-segment-tool-call[data-quiet] .aparte-tool-target')).toMatch(/font-family:\s*inherit/);
    });

    it('puts the chevron at the end of the line, where a chat app puts it', () => {
        expect(rule('.aparte-segment-tool-call[data-quiet] .aparte-tool-toggle')).toMatch(/order:\s*1/);
    });
});

describe('where the sweep cannot say "running"', () => {
    it('a running quiet row shows its word under reduced motion and in forced colours', async () => {
        const { readAparteStylesheet } = await import('../../../__tests__/read-stylesheet.js');
        const sheet = readAparteStylesheet();
        const block = sheet.slice(sheet.indexOf('@media (prefers-reduced-motion: reduce), (forced-colors: active)'));
        expect(block, 'no media block for reduced motion and forced colours').not.toBe(sheet);
        const rule = block.match(/\.aparte-segment-tool-call\[data-quiet\]\[data-status='pending'\] \.aparte-tool-state\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule).toMatch(/position:\s*static/);
        expect(rule).toMatch(/clip:\s*auto/);
    });
});
