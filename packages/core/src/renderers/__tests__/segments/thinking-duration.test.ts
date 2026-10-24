/**
 * A settled reasoning block says how long it thought.
 *
 * The label read "Thinking" while the model reasoned and "Thinking" forever after —
 * a finished block looked like one still running — while the duration was measured on
 * every block (`meta.aparte.startedAt/endedAt`) and drawn by nothing. Settled, the label
 * reads "Thought for 8s" (`thoughtFor`, the duration in the locale's own units through
 * `Intl`), or "Thought" when no timing came with it (history saved without it). An app's
 * own `label` still wins.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
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

afterEach(() => aparteGlobalConfig.resetLocale());

describe('the reasoning label', () => {
    it('reads "Thinking" while the block streams', () => {
        expect(label(block({ isStreaming: true, ...timed(8_000) }))).toBe('Thinking');
    });

    it('settled, says how long it thought, in seconds', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        expect(label(block({ isStreaming: false, ...timed(8_000) }))).toBe(`Thought for ${unit('en', 8, 'second')}`);
    });

    it('past a minute, in minutes and seconds', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        const expected = new Intl.ListFormat('en', { style: 'narrow', type: 'unit' }).format([unit('en', 1, 'minute'), unit('en', 12, 'second')]);
        expect(label(block({ isStreaming: false, ...timed(72_000) }))).toBe(`Thought for ${expected}`);
    });

    it('a blink still reads one second, never zero', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        expect(label(block({ isStreaming: false, ...timed(300) }))).toBe(`Thought for ${unit('en', 1, 'second')}`);
    });

    it('settled with no timing, reads "Thought" — not "Thinking", which reads as still running', () => {
        expect(label(block({ isStreaming: false }))).toBe('Thought');
    });

    it('an app\'s own label wins', () => {
        expect(label(block({ isStreaming: false, label: 'Plan', ...timed(8_000) }))).toBe('Plan');
    });

    it('speaks the chat\'s language and units', () => {
        aparteGlobalConfig.extendLocale({ tag: 'fr-FR', thoughtFor: 'Réflexion : {duration}', thought: 'Réflexion terminée' });
        expect(label(block({ isStreaming: false, ...timed(8_000) }))).toBe(`Réflexion : ${unit('fr-FR', 8, 'second')}`);
        expect(label(block({ isStreaming: false }))).toBe('Réflexion terminée');
    });

    it('turns from Thinking to its duration in place when the block settles', () => {
        aparteGlobalConfig.extendLocale({ tag: 'en' });
        const tpl = document.createElement('template');
        tpl.innerHTML = String(renderer().render(block({ isStreaming: true }))).trim();
        const el = tpl.content.firstElementChild as HTMLElement;
        document.body.appendChild(el);
        renderer().update!(el, block({ isStreaming: false, ...timed(8_000) }));
        expect(el.querySelector('.aparte-thinking-label')?.textContent).toBe(`Thought for ${unit('en', 8, 'second')}`);
        el.remove();
    });
});
