// @vitest-environment jsdom
/**
 * <aparte-context> — the gauge of the model's context window.
 *
 * It reads the usage each turn reports and the window the model declares (or the
 * `window` attribute), turns warn/danger at the two fractions, fires a threshold
 * event when the level changes, and with `auto-compact` asks for a compaction once
 * on reaching danger. Before the first turn, or without a window, it shows nothing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '../../../config/index.js';
import '../aparte-context.js';
import type { AparteContext, AparteContextThresholdEventDetail } from '../aparte-context.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    aparteGlobalConfig.resetLocale();
});

const mount = (html: string): AparteContext => {
    document.body.innerHTML = html;
    return document.querySelector('aparte-context') as AparteContext;
};

const turn = (inputTokens: number, outputTokens: number, targetId?: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'm', role: 'assistant', usage: { inputTokens, outputTokens }, targetId } }));
};

const bar = (el: HTMLElement): HTMLElement | null => el.querySelector('.aparte-progress');

describe('<aparte-context>', () => {
    it('shows nothing before the first turn, then a meter wearing the progress recipe', () => {
        const el = mount(`<aparte-context window="1000"></aparte-context>`);
        expect(el.hasAttribute('data-empty')).toBe(true);
        expect(bar(el)).toBeNull();

        turn(600, 100);
        expect(el.hasAttribute('data-empty')).toBe(false);
        const meter = bar(el)!;
        expect(meter.getAttribute('role')).toBe('meter');
        expect(meter.getAttribute('aria-valuenow')).toBe('700');
        expect(meter.getAttribute('aria-valuemax')).toBe('1000');
        expect(meter.style.getPropertyValue('--aparte-progress-value')).toBe('70');
        expect(meter.querySelector('.aparte-progress__bar')).not.toBeNull();
        // The reading is formatted in the viewer's locale ("1K", "1 k", …): assert the shape, not the glyphs.
        expect(meter.getAttribute('aria-label')).toMatch(/^Context window: 700 \/ 1\s?k$/i);
        expect(el.getAttribute('data-level')).toBe('ok');
        expect(el.used).toBe(700);
    });

    it('shows nothing without a window, and takes the current model\'s when there is one', () => {
        const el = mount(`<aparte-context></aparte-context>`);
        turn(500, 100);
        expect(el.hasAttribute('data-empty')).toBe(true);

        vi.spyOn(aparteGlobalConfig, 'getCurrentModel').mockReturnValue({ id: 'm', name: 'M', contextWindow: 2000 });
        turn(500, 100);
        expect(el.hasAttribute('data-empty')).toBe(false);
        expect(el.window).toBe(2000);
        expect(bar(el)!.getAttribute('aria-valuemax')).toBe('2000');
    });

    it('turns warn then danger at the two fractions, firing the threshold event on each change', () => {
        const el = mount(`<aparte-context window="1000" warn="0.5" danger="0.8"></aparte-context>`);
        const levels: AparteContextThresholdEventDetail[] = [];
        el.addEventListener('aparte-context-threshold', (e) => levels.push((e as CustomEvent<AparteContextThresholdEventDetail>).detail));

        turn(100, 100);
        turn(400, 150);
        turn(500, 400);
        turn(500, 400);   // same level: no second event
        expect(levels.map((d) => d.level)).toEqual(['ok', 'warn', 'danger']);
        expect(levels[2]).toMatchObject({ used: 900, window: 1000, ratio: 0.9 });
        expect(el.getAttribute('data-level')).toBe('danger');
    });

    it('auto-compact asks for a compaction once on reaching danger, and again after a real compaction', () => {
        const el = mount(`<aparte-chat id="chat-a"><aparte-context window="1000" auto-compact></aparte-context></aparte-chat>`);
        const compacts: string[] = [];
        window.addEventListener('aparte-compact', (e) => compacts.push(String((e as CustomEvent).detail?.targetId)));

        turn(900, 50, 'chat-a');
        turn(920, 50, 'chat-a');   // still danger: not asked twice
        expect(compacts).toEqual(['chat-a']);

        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 's', kept: 2 } }));
        expect(el.hasAttribute('data-empty')).toBe(true);   // nothing measured yet after the compaction
        turn(950, 20, 'chat-a');
        expect(compacts).toEqual(['chat-a', 'chat-a']);
    });

    it('ignores the turns of another chat', () => {
        const el = mount(`<aparte-context window="1000" target="chat-b"></aparte-context>`);
        turn(600, 100, 'chat-a');
        expect(el.hasAttribute('data-empty')).toBe(true);
        turn(600, 100, 'chat-b');
        expect(el.hasAttribute('data-empty')).toBe(false);
    });

    it('a skipped compaction leaves the reading alone', () => {
        const el = mount(`<aparte-context window="1000"></aparte-context>`);
        turn(600, 100);
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true } }));
        expect(el.used).toBe(700);
    });

    it('a refused compaction does not latch auto-compact off: the next turn in danger asks again', () => {
        // The request used to be spent only by a real compaction; a skip (nothing to
        // drop yet, a stream in flight) returned early, the level never left danger,
        // and the gauge never asked again for the life of the element.
        mount(`<aparte-chat id="chat-a"><aparte-context window="1000" auto-compact></aparte-context></aparte-chat>`);
        const compacts: string[] = [];
        window.addEventListener('aparte-compact', (e) => compacts.push(String((e as CustomEvent).detail?.targetId)));

        turn(900, 50, 'chat-a');
        expect(compacts).toEqual(['chat-a']);
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true, reason: 'nothing-to-drop', targetId: 'chat-a' } }));
        turn(920, 50, 'chat-a');
        expect(compacts).toEqual(['chat-a', 'chat-a']);
        // Still open: no second ask until the plugin answers.
        turn(930, 50, 'chat-a');
        expect(compacts).toEqual(['chat-a', 'chat-a']);
    });

    it('a failed compaction spends the request too', () => {
        mount(`<aparte-chat id="chat-a"><aparte-context window="1000" auto-compact></aparte-context></aparte-chat>`);
        const compacts: string[] = [];
        window.addEventListener('aparte-compact', (e) => compacts.push(String((e as CustomEvent).detail?.targetId)));

        turn(900, 50, 'chat-a');
        window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: new Error('502'), targetId: 'chat-a' } }));
        turn(920, 50, 'chat-a');
        expect(compacts).toEqual(['chat-a', 'chat-a']);
        // Another chat's failure is not this gauge's.
        window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: new Error('502'), targetId: 'chat-z' } }));
        turn(930, 50, 'chat-a');
        expect(compacts).toEqual(['chat-a', 'chat-a']);
    });
});

describe('<aparte-context variant="ring">', () => {
    const ring = (el: HTMLElement) => el.querySelector<SVGElement>('.aparte-context__ring');
    const value = (el: HTMLElement) => el.querySelector<SVGElement>('.aparte-context__value');

    it('draws a ring meter whose dash is the percentage, with the percentage beside it and the reading on hover', () => {
        const el = mount(`<aparte-context window="1000" variant="ring"></aparte-context>`);
        turn(700, 80);
        const svg = ring(el)!;
        expect(svg.getAttribute('role')).toBe('meter');
        expect(svg.getAttribute('aria-valuenow')).toBe('780');
        expect(svg.getAttribute('aria-valuemax')).toBe('1000');
        expect(svg.getAttribute('aria-label')).toMatch(/^Context window: /);
        expect(value(el)!.getAttribute('pathLength')).toBe('100');
        expect(value(el)!.style.getPropertyValue('--aparte-context-ratio')).toBe('78');
        expect(el.querySelector('.aparte-context__text')!.textContent).toMatch(/^78\s?%$/);
        expect(el.querySelector<HTMLElement>('.aparte-context')!.title).toMatch(/780 \/ 1(,|\.)?0?0?0?/);
        expect(bar(el), 'no bar in the ring variant').toBeNull();
        expect(el.getAttribute('data-level')).toBe('warn');
    });

    it('switching the variant rebuilds the meter, and keeps the reading', () => {
        const el = mount(`<aparte-context window="1000"></aparte-context>`);
        turn(200, 50);
        expect(bar(el)).not.toBeNull();
        el.setAttribute('variant', 'ring');
        expect(bar(el)).toBeNull();
        expect(value(el)!.style.getPropertyValue('--aparte-context-ratio')).toBe('25');
        el.removeAttribute('variant');
        expect(ring(el)).toBeNull();
        expect(bar(el)!.style.getPropertyValue('--aparte-progress-value')).toBe('25');
    });

    it('caps the ring at the window', () => {
        const el = mount(`<aparte-context window="1000" variant="ring"></aparte-context>`);
        turn(1500, 0);
        expect(value(el)!.style.getPropertyValue('--aparte-context-ratio')).toBe('100');
        expect(el.getAttribute('data-level')).toBe('danger');
    });
});

describe('<aparte-context variant="ring"> — the label is the dash', () => {
    it('rounds once: a ratio on a .5 boundary gives the same integer to the ring and to the text', () => {
        const el = mount(`<aparte-context window="128000" variant="ring"></aparte-context>`);
        turn(18560, 0); // 0.145 → 14.499999… in binary
        const dash = el.querySelector<SVGElement>('.aparte-context__value')!.style.getPropertyValue('--aparte-context-ratio');
        const text = el.querySelector('.aparte-context__text')!.textContent!;
        expect(text.replace(/\D/g, '')).toBe(dash);
    });
});

describe('<aparte-context variant="ring"> — nothing used', () => {
    it('draws no value at 0 %: a zero-length dash with round caps would still be a dot', () => {
        const el = mount(`<aparte-context window="1000" variant="ring"></aparte-context>`);
        turn(0, 0);
        const value = el.querySelector<SVGElement>('.aparte-context__value')!;
        expect(value.classList.contains('aparte-context__value--empty')).toBe(true);
        turn(100, 0);
        expect(value.classList.contains('aparte-context__value--empty')).toBe(false);
    });
});

/**
 * The numbers are formatted with the LOCALE's tag, not the browser's.
 *
 * Both `Intl.NumberFormat` constructors passed `undefined` — "follow the browser" —
 * which is the exact bug `AparteLocale.tag` was added to close, and which the
 * conversation list and the bubble's clock already read it for. So an app that called
 * `setLocale(fr)` moved fifty strings and left the gauge counting in en-US.
 *
 * Asserted against the tag's OWN output rather than against a literal, because the ICU
 * data a Node build ships decides the glyphs; what has to be true is that the element
 * produced what that tag produces, and NOT what en-US produces. A pair of assertions,
 * since either alone is satisfiable by accident.
 */
describe('<aparte-context> — Intl reads locale.tag', () => {
    const withTag = (tag: string): void => {
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag });
    };

    it('formats the bar reading in the language the locale names', () => {
        withTag('ja-JP');
        const el = mount(`<aparte-context window="128000"></aparte-context>`);
        turn(64000, 0);
        const compact = (n: number, tag: string): string =>
            new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
        const label = bar(el)!.getAttribute('aria-label')!;
        expect(label).toBe(`Context window: ${compact(64000, 'ja-JP')} / ${compact(128000, 'ja-JP')}`);
        expect(label).not.toBe(`Context window: ${compact(64000, 'en-US')} / ${compact(128000, 'en-US')}`);
        expect(el.querySelector('.aparte-context__text')!.textContent)
            .toBe(`${compact(64000, 'ja-JP')} / ${compact(128000, 'ja-JP')}`);
    });

    it('formats the ring percentage in the language the locale names', () => {
        // fr-FR writes "14 %" with a narrow no-break space; en-US writes "14%".
        withTag('fr-FR');
        const el = mount(`<aparte-context window="1000" variant="ring"></aparte-context>`);
        turn(140, 0);
        const percent = (tag: string): string =>
            new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }).format(0.14);
        expect(el.querySelector('.aparte-context__text')!.textContent).toBe(percent('fr-FR'));
        expect(el.querySelector('.aparte-context__text')!.textContent).not.toBe(percent('en-US'));
    });

    it('follows the browser again when the locale declares no tag', () => {
        // `undefined` is the documented English default and must stay reachable: an
        // empty string is not a language, and passing it to Intl throws a RangeError.
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag: '' });
        const el = mount(`<aparte-context window="1000"></aparte-context>`);
        expect(() => turn(700, 0)).not.toThrow();
        const compact = (n: number): string =>
            new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
        expect(bar(el)!.getAttribute('aria-label')).toBe(`Context window: ${compact(700)} / ${compact(1000)}`);
    });
});
