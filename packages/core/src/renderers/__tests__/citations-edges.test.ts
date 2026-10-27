// @vitest-environment jsdom
/**
 * Citations at their edges: a locale without the source strings, sources with no address
 * or title, formulas and emoji in the passage, and a card the window or the transcript
 * would push out of sight.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, APARTE_DEFAULT_LOCALE } from '../../config/index.js';
import { textRenderer } from '../segments/text.js';
import { renderCitations } from '../citations.js';
import type { AparteSource, AparteTextSegment } from '../../types/index.js';

const SKY: AparteSource = { id: 's1', url: 'https://en.wikipedia.org/wiki/Sky', title: 'Sky — Wikipedia', snippet: 'Rayleigh scattering.' };
const NASA: AparteSource = { id: 's2', url: 'https://www.nasa.gov/sky', title: 'Why the sky is blue' };

function drawn(content: string, extra: Partial<AparteTextSegment>, render: (raw: string) => string = (raw) => `<p>${raw}</p>`, host: Element = document.body): HTMLElement {
    aparteGlobalConfig.setMarkdownProvider(render);
    const segment: AparteTextSegment = { id: 't1', type: 'text', content, isStreaming: false, ...extra };
    const holder = document.createElement('div');
    holder.innerHTML = textRenderer.render(segment) as string;
    const el = holder.firstElementChild as HTMLElement;
    host.append(el);
    textRenderer.setup?.(el, segment);
    return el.querySelector('.aparte-segment-content') as HTMLElement;
}
const chips = (root: Element) => Array.from(root.querySelectorAll<HTMLButtonElement>('.aparte-citation'));
const card = () => document.querySelector<HTMLElement>('.aparte-citation-card');
const before = (chip: Element) => {
    const range = document.createRange();
    range.setStart(chip.closest('.aparte-segment-content')!, 0);
    range.setEndBefore(chip);
    return range.toString();
};
const rect = (r: Partial<DOMRect>) => () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {}, ...r }) as DOMRect;

afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    aparteGlobalConfig.reset();
    aparteGlobalConfig.resetLocale();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a citation at its edges', () => {
    it('reads English where a locale leaves the source strings out', () => {
        const bare = { ...APARTE_DEFAULT_LOCALE } as Record<string, unknown>;
        for (const k of ['sourcesCount', 'sourcesOne', 'sourcesCard', 'sourcePrevious', 'sourceNext', 'sourcePosition', 'opensInNewTab']) delete bare[k];
        aparteGlobalConfig.setLocale(bare as typeof APARTE_DEFAULT_LOCALE);
        const root = drawn('Blue.', { sources: [SKY, NASA], citations: [{ end: 5, sources: ['s1', 's2'] }] });
        expect(chips(root)[0]!.getAttribute('aria-label')).toBe('en.wikipedia.org +1, 2 sources');
        chips(root)[0]!.click();
        expect(card()!.getAttribute('aria-label')).toBe('Sources');
        expect(card()!.querySelector('[data-aparte-card-part="prev"]')!.getAttribute('aria-label')).toBe('Previous source');
        expect(card()!.querySelector('a')!.textContent).toContain('(opens in a new tab)');
        card()!.querySelector<HTMLButtonElement>('[data-aparte-card-part="next"]')!.click();
        expect(card()!.querySelector('[role="status"]')!.textContent).toBe('Source 2 of 2');
    });

    it('names a source by what it has: its domain, its title, or a mark', () => {
        const broken: AparteSource = { id: 'b', url: 'https://' };
        const untitled: AparteSource = { id: 'u', url: 'https://example.org/page' };
        const nothing: AparteSource = { id: 'n' };
        const root = drawn('One. Two. Three.', { sources: [broken, untitled, nothing], citations: [
            { end: 4, sources: ['b'] }, { end: 9, sources: ['u'] }, { end: 16, sources: ['n'] },
        ] });
        expect(chips(root).map((c) => c.dataset.label)).toEqual(['?', 'example.org', '?']);
        chips(root)[1]!.click();
        expect(card()!.querySelector('a')!.firstChild!.textContent).toBe('example.org');
    });

    it('follows a formula drawn beside its source, and steps over emoji', () => {
        // Drawn by hand: the text renderer draws formulas from its own cache.
        const host = document.createElement('div');
        host.innerHTML = '<p>Area is <code class="math-inline">x^2</code><span class="aparte-code-drawing">x²</span>. Next.</p>';
        document.body.append(host);
        const content = 'Area is $x^2$. Next.';
        renderCitations(host, { id: 't', type: 'text', content, isStreaming: false, sources: [SKY], citations: [{ end: content.indexOf('.'), sources: ['s1'] }] });
        const chip = chips(host)[0]!;
        expect(chip.previousSibling!.textContent).toBe('.');
        expect((chip.previousSibling!.previousSibling as Element).classList.contains('aparte-code-drawing')).toBe(true);

        document.body.innerHTML = '';
        const emoji = '🌍 is blue. 🌊 is too.';
        const two = chips(drawn(emoji, { sources: [SKY, NASA], citations: [{ end: emoji.indexOf('.') + 1, sources: ['s1'] }, { end: emoji.length, sources: ['s2'] }] }));
        expect(two.map(before)).toEqual(['🌍 is blue.', '🌍 is blue. 🌊 is too.']);
    });

    it('puts the chip after the passage when the marker the model wrote is not on screen', () => {
        const content = 'The sky is blue[1].';
        const root = drawn(content, { sources: [SKY], citations: [{ start: 15, end: 18, sources: ['s1'], marker: true }] }, () => '<p>The sky is blue1 and more</p>');
        expect(root.querySelector('.aparte-citation-marker')).toBeNull();
        expect(before(chips(root)[0]!)).toBe('The sky is blue1');
    });

    it('leaves a no-break space alone when no punctuation follows it', () => {
        const fr = 'Le ciel est bleu et vaste.';
        expect(before(chips(drawn(fr, { sources: [SKY], citations: [{ end: fr.indexOf('bleu') + 4, sources: ['s1'] }] }))[0]!)).toBe('Le ciel est bleu');
    });

    it('opens nothing on a click beside the chips, and lets a redraw drop a card whose chip is gone', () => {
        const segment: AparteTextSegment = { id: 't1', type: 'text', content: 'Blue.', isStreaming: false, sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] };
        const root = drawn(segment.content, segment);
        root.querySelector('p')!.click();
        expect(card()).toBeNull();
        const chip = chips(root)[0]!;
        chip.focus();
        chip.click();
        renderCitations(root, { ...segment, citations: [] });
        expect(card()).toBeNull();
        expect(chips(root)).toHaveLength(0);
    });
});

describe('the card at its edges', () => {
    it('lives in the top layer where the browser has one, beside the transcript', () => {
        const show = vi.fn();
        (HTMLElement.prototype as { showPopover?: () => void }).showPopover = show;
        try {
            const shell = document.createElement('div');
            const viewport = document.createElement('aparte-chat-viewport');
            shell.append(viewport);
            document.body.append(shell);
            chips(drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] }, undefined, viewport))[0]!.click();
            expect(show).toHaveBeenCalledOnce();
            expect(card()!.parentElement).toBe(shell);
        } finally {
            delete (HTMLElement.prototype as { showPopover?: () => void }).showPopover;
        }
    });

    it('flips above a chip near the bottom of the window, and aligns on its end edge right to left', () => {
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
        const root = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] });
        const chip = chips(root)[0]!;
        chip.style.direction = 'rtl';
        chip.getBoundingClientRect = rect({ top: window.innerHeight - 30, bottom: window.innerHeight - 10, left: 400, right: 460 });
        chip.click();
        expect(parseFloat(card()!.style.top)).toBe(window.innerHeight - 30 - 100 - 6);
        expect(parseFloat(card()!.style.left)).toBe(260);
    });

    it('closes when its chip scrolls out of the transcript, and follows it while it stays', () => {
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        document.body.append(scroller);
        const root = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] }, undefined, scroller);
        scroller.getBoundingClientRect = rect({ top: 0, bottom: 300 });
        const chip = chips(root)[0]!;
        chip.getBoundingClientRect = rect({ top: 100, bottom: 120, left: 10 });
        chip.click();
        window.dispatchEvent(new Event('scroll'));
        expect(card()).not.toBeNull();
        chip.getBoundingClientRect = rect({ top: 400, bottom: 420, left: 10 });
        window.dispatchEvent(new Event('scroll'));
        expect(card()).toBeNull();
    });

    it('keeps the reader inside it: Shift+Tab from its first control, a click in it, a focus lost to nowhere', () => {
        const root = drawn('Blue.', { sources: [SKY, NASA], citations: [{ end: 5, sources: ['s1', 's2'] }] });
        const chip = chips(root)[0]!;
        chip.click();
        const next = card()!.querySelector<HTMLElement>('[data-aparte-card-part="next"]')!;
        next.focus();
        next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        card()!.querySelector('a')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        card()!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(card()).not.toBeNull();
        next.click();
        const first = card()!.querySelector<HTMLElement>('a[href], button:not([disabled])')!;
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(card()).toBeNull();
        expect(document.activeElement).toBe(chip);
    });
});
