/**
 * The reasoning line shimmers while it arrives.
 *
 * "Thinking" was a still word above a block that was filling up: the conversational
 * products — and the libraries that draw them, AI Elements and assistant-ui by default —
 * sweep a light across it while the model is still reasoning. The shimmer follows the
 * block's own streaming flag, set by the viewport and the parser as text arrives, so a
 * block written by hand or restored from storage — which never streamed here — stays still.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteThinkingSegment } from '../../../types/index.js';

registerDefaultRenderers();
const renderer = () => getSegmentRenderer('thinking')!;

const block = (over: Partial<AparteThinkingSegment> = {}): AparteThinkingSegment =>
    ({ id: 't1', type: 'thinking', messageId: 'm1', index: 0, content: 'Reading the question.', ...over }) as AparteThinkingSegment;

function draw(segment: AparteThinkingSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(renderer().render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    return el;
}
const label = (el: HTMLElement) => el.querySelector('.aparte-thinking-label')!;

afterEach(() => {
    aparteGlobalConfig.resetLocale();
    document.body.innerHTML = '';
});

describe('the reasoning line while it arrives', () => {
    it('shimmers while the block streams', () => {
        expect(label(draw(block({ isStreaming: true }))).classList.contains('aparte-shimmer')).toBe(true);
    });

    it('is still once it has settled, on the same element', () => {
        const el = draw(block({ isStreaming: true }));
        renderer().update!(el, block({ isStreaming: false }));
        expect(label(el).classList.contains('aparte-shimmer')).toBe(false);
        expect(label(el).textContent).toBe('Thought');
    });

    it('is still for a block that never streamed here: written by hand, or restored', () => {
        expect(label(draw(block())).classList.contains('aparte-shimmer')).toBe(false);
        expect(label(draw(block({ isStreaming: false }))).classList.contains('aparte-shimmer')).toBe(false);
    });

    it('a label of the app\'s own shimmers too: it is the state that runs, not the words', () => {
        expect(label(draw(block({ isStreaming: true, label: 'Planning' }))).classList.contains('aparte-shimmer')).toBe(true);
    });

    it('keeps shimmering through a language switch', () => {
        const el = draw(block({ isStreaming: true }));
        aparteGlobalConfig.extendLocale({ thinking: 'Réflexion' });
        renderer().relabel!(el, block({ isStreaming: true }));
        expect(label(el).textContent).toBe('Réflexion');
        expect(label(el).classList.contains('aparte-shimmer')).toBe(true);
    });
});
