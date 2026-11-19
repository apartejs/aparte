// @vitest-environment jsdom
/**
 * An error renderer that changes one error hands every other back to aparté's card.
 *
 * It had to return something for every error, so an app that wanted its own words for one
 * code (`engine-died`) rebuilt core's card by hand for all the others: a copy of its markup
 * that drifts, and that a language switch no longer rewrote. Returning `null` used to make
 * the card vanish. `null` or nothing now means core's card, which still follows the
 * language; the app's own card is never rewritten.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteErrorSegment } from '../../../types/index.js';

registerDefaultRenderers();

const renderer = () => getSegmentRenderer('error')!;
const error = (fields: Partial<AparteErrorSegment> = {}): AparteErrorSegment =>
    ({ id: 'e1', type: 'error', content: 'vendor said 503', code: 'NET_ERROR', ...fields }) as AparteErrorSegment;
/** What the bubble mounts: an element as it is, a string's first element. */
const mount = (out: unknown): HTMLElement => {
    if (out instanceof HTMLElement) return out;
    const holder = document.createElement('div');
    holder.innerHTML = out as string;
    return holder.firstElementChild as HTMLElement;
};
const said = (el: HTMLElement): string => el.querySelector('.aparte-alert__message')?.textContent ?? '';

afterEach(() => aparteGlobalConfig.reset());

describe('an error renderer that answers one error', () => {
    const ours = '<p class="my-error">The engine stopped during this reply.</p>';
    const onlyEngine = () => aparteGlobalConfig.setErrorRenderer(({ appCode }) => (appCode === 'engine-died' ? ours : null));

    it('draws its own card for that error', () => {
        onlyEngine();
        const card = mount(renderer().render(error({ code: 'PROVIDER_ERROR', appCode: 'engine-died' })));
        expect(card.className).toBe('my-error');
    });

    it('leaves aparté\'s card, with its sentence, to every other', () => {
        onlyEngine();
        const card = mount(renderer().render(error()));
        expect(card.classList.contains('aparte-segment-error')).toBe(true);
        expect(card.getAttribute('data-segment-id')).toBe('e1');
        expect(said(card)).toBe('The assistant can’t be reached right now. Try again in a moment.');
    });

    it('takes nothing returned the same way as null', () => {
        aparteGlobalConfig.setErrorRenderer(() => undefined);
        expect(mount(renderer().render(error())).classList.contains('aparte-segment-error')).toBe(true);
    });

    it('lets aparté\'s card follow a language switch, and never rewrites its own', () => {
        onlyEngine();
        const core = mount(renderer().render(error()));
        const mine = mount(renderer().render(error({ code: 'PROVIDER_ERROR', appCode: 'engine-died' })));
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'L’assistant est injoignable.' });
        renderer().relabel!(core, error() as never);
        renderer().relabel!(mine, error({ code: 'PROVIDER_ERROR', appCode: 'engine-died' }) as never);
        expect(said(core)).toBe('L’assistant est injoignable.');
        expect(mine.textContent).toBe('The engine stopped during this reply.');
    });

    it('in a bubble: aparté\'s card follows the language, the app\'s stays as written', async () => {
        await import('../../../components/bubble/aparte-chat-bubble.js');
        onlyEngine();
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & { setSegments(s: unknown[]): void };
        bubble.setAttribute('data-role', 'assistant');
        document.body.appendChild(bubble);
        bubble.setSegments([error({ id: 'core' }), error({ id: 'mine', code: 'PROVIDER_ERROR', appCode: 'engine-died' })]);
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'L’assistant est injoignable.' });
        const core = bubble.querySelector<HTMLElement>('[data-segment-id="core"]')!;
        const mine = bubble.querySelector<HTMLElement>('[data-segment-id="mine"]')!;
        expect(said(core)).toBe('L’assistant est injoignable.');
        expect(mine.textContent).toBe('The engine stopped during this reply.');
        bubble.remove();
    });

    it('does not rewrite a card of the app\'s that copied aparté\'s classes', () => {
        aparteGlobalConfig.setErrorRenderer(() =>
            '<div class="aparte-alert aparte-segment-error"><div class="aparte-alert__message">Our words.</div></div>');
        const copy = mount(renderer().render(error()));
        aparteGlobalConfig.extendLocale({ errorUnreachable: 'Injoignable.' });
        renderer().relabel!(copy, error() as never);
        expect(said(copy)).toBe('Our words.');
    });
});
