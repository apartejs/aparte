/**
 * A queued tool row says it waits, not that it runs.
 *
 * A call waiting its turn in its step (`segment.queued`) has its row where the model wrote
 * it, but nothing runs yet: no spinner, no shimmer, and the word "Queued" shown on both rows,
 * the quiet one included, in the muted ink of the state word. Once the call goes on, the mark
 * leaves and the row is a running row again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending', queued: true,
    toolCall: { id: 'c1', name: 'run_command', input: { cmd: 'npm test' } },
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
const updated = (el: HTMLElement, segment: AparteToolCallSegment): HTMLElement => {
    renderer().update!(el, segment);
    return document.body.querySelector<HTMLElement>('[data-segment-id="s1"]')!;
};

const state = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-state')!;
const spinner = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-spinner')!;
const name = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-tool-name')!;
const shown = (node: HTMLElement) => !node.classList.contains('aparte-sr-only');

afterEach(() => {
    aparteGlobalConfig.unregisterToolDisplay('run_command');
    aparteGlobalConfig.resetLocale();
    document.body.innerHTML = '';
});

describe('a queued row', () => {
    it('on a quiet row: no shimmer, and "Queued" shown, not only read', () => {
        const el = draw(call());
        expect(el.hasAttribute('data-queued')).toBe(true);
        expect(el.getAttribute('data-status')).toBe('pending');
        expect(name(el).classList.contains('aparte-shimmer')).toBe(false);
        expect(spinner(el).hidden).toBe(true);
        expect(shown(state(el))).toBe(true);
        expect(state(el).textContent).toBe('Queued');
    });

    it('on an agent\'s row: no spinner, and "Queued" in place of "Running"', () => {
        aparteGlobalConfig.registerToolDisplay('run_command', { quiet: false });
        const el = draw(call());
        expect(spinner(el).hidden).toBe(true);
        expect(state(el).textContent).toBe('Queued');
    });

    it('becomes a running row once the call goes on, patched in place', () => {
        aparteGlobalConfig.registerToolDisplay('run_command', { quiet: false });
        const el = draw(call());
        const now = updated(el, call({ queued: undefined }));
        expect(now).toBe(el);
        expect(now.hasAttribute('data-queued')).toBe(false);
        expect(spinner(now).hidden).toBe(false);
        expect(state(now).textContent).toBe('Running');
    });

    it('says it in the reader\'s language', () => {
        aparteGlobalConfig.extendLocale({ toolQueued: 'En attente' });
        expect(state(draw(call())).textContent).toBe('En attente');
    });

    it('is drawn in the state word\'s muted ink, with no animation of its own', () => {
        const css = readAparteStylesheet();
        expect(css).toMatch(/\.aparte-segment-tool-call\[data-queued\]/);
        expect(css).not.toMatch(/\[data-queued\][^{]*\{[^}]*animation/);
    });
});
