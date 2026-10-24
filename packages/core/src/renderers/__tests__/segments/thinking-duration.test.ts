/**
 * A settled reasoning block says it is done — and how long it took, when the app asks.
 *
 * The label read "Thinking" while the model reasoned and "Thinking" forever after, so a
 * finished block looked like one still running. Settled, it reads "Thought" (`thought`).
 *
 * The DURATION is the app's to turn on (`showDuration`, usually through
 * `setSegmentDefaults('thinking', { showDuration: true })`): it is measured in the
 * browser, from the first reasoning delta to the last, which is the model's thinking time
 * only when the provider streams its reasoning — one that sends it in one piece would
 * read "1s". With it on, "Thought for 8s" (`thoughtFor`, the locale's units through
 * `Intl`, a one-second floor). An app's own `label` always wins.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { stampSegmentOnInsert } from '../../../utils/segments.js';
import type { AparteThinkingSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('thinking')!;

const block = (over: Partial<AparteThinkingSegment> = {}): AparteThinkingSegment => ({
    id: 't1', type: 'thinking', messageId: 'm1', index: 0, content: 'Let me see.',
    ...over,
} as AparteThinkingSegment);
const timed = (ms: number) => ({ meta: { aparte: { startedAt: 1_000, endedAt: 1_000 + ms } } });

function label(segment: AparteThinkingSegment): string | null | undefined {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    return tpl.content.querySelector('.aparte-thinking-label')?.textContent;
}

const unit = (tag: string, n: number, u: 'second' | 'minute') =>
    new Intl.NumberFormat(tag, { style: 'unit', unit: u, unitDisplay: 'narrow' }).format(n);

afterEach(() => {
    aparteGlobalConfig.resetLocale();
    aparteGlobalConfig.clearSegmentDefaults('thinking');
});

describe('the reasoning label', () => {
    it('reads "Thinking" while the block streams', () => {
        expect(label(block({ isStreaming: true, showDuration: true, ...timed(8_000) }))).toBe('Thinking');
    });

    it('settled, reads "Thought" — measured or not, the duration is not shown unless asked', () => {
        expect(label(block({ isStreaming: false, ...timed(8_000) }))).toBe('Thought');
        expect(label(block({ isStreaming: false }))).toBe('Thought');
    });

    it('with showDuration, says how long it thought, in seconds', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        expect(label(block({ isStreaming: false, showDuration: true, ...timed(8_000) }))).toBe(`Thought for ${unit('en', 8, 'second')}`);
    });

    it('past a minute, in minutes and seconds', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        const expected = new Intl.ListFormat('en', { style: 'narrow', type: 'unit' }).format([unit('en', 1, 'minute'), unit('en', 12, 'second')]);
        expect(label(block({ isStreaming: false, showDuration: true, ...timed(72_000) }))).toBe(`Thought for ${expected}`);
    });

    it('a blink still reads one second, never zero', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        expect(label(block({ isStreaming: false, showDuration: true, ...timed(300) }))).toBe(`Thought for ${unit('en', 1, 'second')}`);
    });

    it('with showDuration but no timing (history saved without it), reads "Thought"', () => {
        expect(label(block({ isStreaming: false, showDuration: true }))).toBe('Thought');
    });

    it('turned on for every block with a segment default, read at insertion', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        aparteGlobalConfig.setSegmentDefaults('thinking', { showDuration: true });
        const inserted = stampSegmentOnInsert([], block({ isStreaming: false, ...timed(8_000) }), 'm1', aparteGlobalConfig.getSegmentDefaults('thinking')) as AparteThinkingSegment;
        expect(label(inserted)).toBe(`Thought for ${unit('en', 8, 'second')}`);
    });

    it('an app\'s own label wins', () => {
        expect(label(block({ isStreaming: false, showDuration: true, label: 'Plan', ...timed(8_000) }))).toBe('Plan');
    });

    it('speaks the chat\'s language and units', () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', thoughtFor: 'Réflexion : {duration}', thought: 'Réflexion terminée' });
        expect(label(block({ isStreaming: false, showDuration: true, ...timed(8_000) }))).toBe(`Réflexion : ${unit('fr-FR', 8, 'second')}`);
        expect(label(block({ isStreaming: false }))).toBe('Réflexion terminée');
    });

    it('turns from Thinking to its settled label in place', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        const tpl = document.createElement('template');
        tpl.innerHTML = String(renderer().render(block({ isStreaming: true }))).trim();
        const el = tpl.content.firstElementChild as HTMLElement;
        document.body.appendChild(el);
        renderer().update!(el, block({ isStreaming: false, showDuration: true, ...timed(8_000) }));
        expect(el.querySelector('.aparte-thinking-label')?.textContent).toBe(`Thought for ${unit('en', 8, 'second')}`);
        el.remove();
    });
});
