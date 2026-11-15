/**
 * `note` and `activity` on a tool's display, and `registerToolLineProvider`: the app says
 * what a call is doing without a provider, and several plugins can each give a line
 * without one replacing another.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('tool_call')!;

const call = (name = 'search'): AparteToolCallSegment => ({
    id: 's1', type: 'tool_call', messageId: 'm1', index: 0, status: 'pending',
    toolCall: { id: 'c1', name, input: { q: 'cats' } },
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
const text = (el: Element, name: string): string | null => {
    const n = el.querySelector<HTMLElement>(`.aparte-tool-${name}`)!;
    return n.hidden ? null : n.textContent;
};

afterEach(() => {
    aparteGlobalConfig.reset();
    registerDefaultRenderers();
    document.body.innerHTML = '';
});

describe('a display gives the activity and the note', () => {
    it('as text', () => {
        aparteGlobalConfig.registerToolDisplay('search', { activity: 'Reading results', note: '3 hits' });
        const el = draw(call());
        expect(text(el, 'activity')).toBe('Reading results');
        expect(el.textContent).toContain('3 hits');
    });

    it('as a function of the segment', () => {
        aparteGlobalConfig.registerToolDisplay('search', {
            activity: (s) => `Looking up ${(s.toolCall.input as { q: string }).q}`,
            note: () => 'quick',
        });
        const el = draw(call());
        expect(text(el, 'activity')).toBe('Looking up cats');
        expect(el.textContent).toContain('quick');
    });

    it('wins over a provider', () => {
        aparteGlobalConfig.registerToolDisplay('search', { activity: 'mine' });
        aparteGlobalConfig.registerToolLineProvider(() => ({ activity: 'theirs', note: 'their note' }));
        const el = draw(call());
        expect(text(el, 'activity')).toBe('mine');
        expect(el.textContent).toContain('their note');
    });

    it('one that throws leaves the provider\'s', () => {
        aparteGlobalConfig.registerToolDisplay('search', { activity: () => { throw new Error('x'); } });
        aparteGlobalConfig.registerToolLineProvider(() => ({ activity: 'theirs' }));
        expect(text(draw(call()), 'activity')).toBe('theirs');
    });
});

describe('registerToolLineProvider', () => {
    it('asks the providers in order and the first answer wins', () => {
        aparteGlobalConfig.registerToolLineProvider((s) => (s.toolCall.name === 'a' ? { label: 'First' } : undefined));
        aparteGlobalConfig.registerToolLineProvider(() => ({ label: 'Second' }));
        expect(text(draw(call('a')), 'name')).toBe('First');
        document.body.innerHTML = '';
        expect(text(draw(call('b')), 'name')).toBe('Second');
    });

    it('does not replace the one the app set, which is asked first', () => {
        aparteGlobalConfig.setToolLineProvider(() => ({ label: 'App' }));
        aparteGlobalConfig.registerToolLineProvider(() => ({ label: 'Plugin' }));
        expect(text(draw(call()), 'name')).toBe('App');
    });

    it('returns a function that removes it', () => {
        const release = aparteGlobalConfig.registerToolLineProvider(() => ({ label: 'Plugin' }));
        release();
        expect(text(draw(call()), 'name')).toBe('search');
    });

    it('is cleared by reset()', () => {
        aparteGlobalConfig.registerToolLineProvider(() => ({ label: 'Plugin' }));
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        expect(text(draw(call()), 'name')).toBe('search');
    });
});
