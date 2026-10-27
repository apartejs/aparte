// @vitest-environment jsdom
/**
 * Citation chips, their card and the list of sources — placed by text in the rendered
 * Markdown, whatever renderer drew it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '../../config/index.js';
import { textRenderer } from '../segments/text.js';
import { renderCitations } from '../citations.js';
import { populateBubbleFromMessage } from '../../components/bubble/bubble-sync.js';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment, AparteSource, AparteTextSegment } from '../../types/index.js';

/** A small Markdown renderer: paragraphs, **strong**, `code`, [links](url). */
function markdown(raw: string): string {
    return raw.split(/\n{2,}/).map((block) => `<p>${block
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')}</p>`).join('');
}

const SKY: AparteSource = { id: 's1', url: 'https://en.wikipedia.org/wiki/Sky', title: 'Sky — Wikipedia', snippet: 'Rayleigh scattering.' };
const NASA: AparteSource = { id: 's2', url: 'https://www.nasa.gov/sky', title: 'Why the sky is blue' };
const BAD: AparteSource = { id: 's3', url: 'javascript:alert(1)', title: 'Not a link' };

function drawn(content: string, extra: Partial<AparteTextSegment> = {}): HTMLElement {
    aparteGlobalConfig.setMarkdownProvider(markdown);
    const segment: AparteTextSegment = { id: 't1', type: 'text', content, isStreaming: false, ...extra };
    const holder = document.createElement('div');
    holder.innerHTML = textRenderer.render(segment) as string;
    const el = holder.firstElementChild as HTMLElement;
    document.body.append(el);
    textRenderer.setup?.(el, segment);
    return el.querySelector('.aparte-segment-content') as HTMLElement;
}

const chips = (root: Element) => Array.from(root.querySelectorAll<HTMLButtonElement>('.aparte-citation'));
/** The text up to and including each chip's label, to read where it sits. */
const before = (chip: Element) => {
    const range = document.createRange();
    range.setStart(chip.closest('.aparte-segment-content')!, 0);
    range.setEndBefore(chip);
    return range.toString();
};

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('a citation chip', () => {
    it('goes after the passage\'s punctuation and out of its emphasis', () => {
        const content = 'The sky is **blue**. The sea is green.';
        const root = drawn(content, { sources: [SKY], citations: [{ end: content.indexOf('.') + 1, sources: ['s1'] }] });
        const [chip] = chips(root);
        expect(chip!.textContent).toBe('en.wikipedia.org');
        expect(before(chip!)).toBe('The sky is blue.');
        expect(chip!.closest('strong')).toBeNull();
    });

    it('goes after a link or inline code the passage ends in, never inside it', () => {
        const content = 'See [the docs](https://x.y/a) and run `npm i`.';
        const root = drawn(content, { sources: [SKY, NASA], citations: [
            { end: content.indexOf(')') + 1, sources: ['s1'] },
            { end: content.length, sources: ['s2'] },
        ] });
        const [first, second] = chips(root);
        expect(first!.closest('a')).toBeNull();
        expect(before(first!)).toBe('See the docs');
        expect(second!.closest('code')).toBeNull();
        expect(before(second!).endsWith('npm i.')).toBe(true);
    });

    it('stands for every source of the passage: "+N", and its name says how many', () => {
        const content = 'The sky is blue.';
        const root = drawn(content, { sources: [SKY, NASA], citations: [
            { end: content.length, sources: ['s2'] },
            { end: content.length, sources: ['s1', 's2'] },
        ] });
        expect(chips(root)).toHaveLength(1);
        expect(chips(root)[0]!.textContent).toBe('nasa.gov +1');
        expect(chips(root)[0]!.getAttribute('aria-label')).toBe('nasa.gov +1, 2 sources');
    });

    it('finds a passage at the same occurrence when its words come twice', () => {
        const content = 'It is blue. Really, it is blue. Yes.';
        const second = content.indexOf('blue.', 10) + 5;
        const root = drawn(content, { sources: [SKY], citations: [{ end: second, sources: ['s1'] }] });
        expect(before(chips(root)[0]!)).toBe('It is blue. Really, it is blue.');
    });

    it('goes at the end of the text when its passage cannot be found again', () => {
        const root = drawn('One.\n\nTwo.', { sources: [SKY], citations: [{ end: 0, sources: ['s1'] }] });
        expect(chips(root)[0]!.parentElement!.textContent!.startsWith('Two.')).toBe(true);
    });

    it('takes the place of the marker the model wrote, which the text keeps', () => {
        const content = 'The sky is blue[1].';
        const root = drawn(content, { sources: [SKY], citations: [{ start: 15, end: 18, sources: ['s1'], marker: true }] });
        const marker = root.querySelector<HTMLElement>('.aparte-citation-marker')!;
        expect(marker.hidden).toBe(true);
        expect(marker.textContent).toBe('[1]');
        expect(marker.nextSibling).toBe(chips(root)[0]);
    });

    it('is drawn once however often the text is drawn again', () => {
        const content = 'The sky is blue.';
        const segment: AparteTextSegment = { id: 't1', type: 'text', content, isStreaming: false, sources: [SKY], citations: [{ end: 16, sources: ['s1'] }] };
        const root = drawn(content, segment);
        renderCitations(root, segment);
        renderCitations(root, segment);
        expect(chips(root)).toHaveLength(1);
        expect(root.textContent).toBe('The sky is blue.en.wikipedia.org');
    });

    it('is not drawn for a citation naming no known source', () => {
        const root = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['nope'] }] });
        expect(chips(root)).toHaveLength(0);
    });
});

describe('the card a chip opens', () => {
    it('opens on click with the source\'s link, pages, and closes on Escape back to its chip', () => {
        const content = 'The sky is blue.';
        const root = drawn(content, { sources: [SKY, NASA], citations: [{ end: 16, sources: ['s1', 's2'] }] });
        const chip = chips(root)[0]!;
        chip.click();
        const card = document.querySelector<HTMLElement>('.aparte-citation-card')!;
        expect(card.getAttribute('role')).toBe('dialog');
        expect(chip.getAttribute('aria-expanded')).toBe('true');
        expect(chip.getAttribute('aria-controls')).toBe(card.id);
        const link = card.querySelector<HTMLAnchorElement>('a.aparte-citation-card__title')!;
        expect(document.activeElement).toBe(link);
        expect(link.href).toBe(SKY.url);
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(card.querySelector('.aparte-citation-card__snippet')!.textContent).toBe('Rayleigh scattering.');

        card.querySelector<HTMLButtonElement>('[data-aparte-card-part="next"]')!.click();
        expect(card.querySelector('a')!.getAttribute('href')).toBe(NASA.url);
        expect(card.querySelector('[role="status"]')!.textContent).toBe('Source 2 of 2');
        expect(card.querySelector<HTMLButtonElement>('[data-aparte-card-part="next"]')!.disabled).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.querySelector('.aparte-citation-card')).toBeNull();
        expect(chip.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(chip);
    });

    it('links nothing a source names with a scheme it refuses', () => {
        const root = drawn('Blue.', { sources: [BAD], citations: [{ end: 5, sources: ['s3'] }] });
        chips(root)[0]!.click();
        const card = document.querySelector('.aparte-citation-card')!;
        expect(card.querySelector('a')).toBeNull();
        expect(card.textContent).toContain('Not a link');
    });

    it('closes when the reader clicks elsewhere', () => {
        const root = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] });
        chips(root)[0]!.click();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.querySelector('.aparte-citation-card')).toBeNull();
    });
});

describe('the list of a reply\'s sources', () => {
    type Bubble = HTMLElement & { setSegments(s: AparteSegment[]): void; updateSegment(id: string, u: Partial<AparteSegment>): void; getSegments(): AparteSegment[] };
    function bubble(): Bubble {
        aparteGlobalConfig.setMarkdownProvider(markdown);
        const el = document.createElement('aparte-chat-bubble') as Bubble;
        el.setAttribute('message-id', 'm1');
        el.setAttribute('data-role', 'assistant');
        document.body.append(el);
        return el;
    }

    it('lists every source of the reply once, under its segments, closed', () => {
        const el = bubble();
        el.setSegments([
            { id: 'a', type: 'text', content: 'One.', isStreaming: false, sources: [SKY, NASA], citations: [{ end: 4, sources: ['s1'] }] } as AparteSegment,
            { id: 'b', type: 'text', content: 'Two.', isStreaming: false, sources: [SKY] } as AparteSegment,
        ]);
        const list = el.querySelector<HTMLDetailsElement>('.aparte-sources')!;
        expect(list.open).toBe(false);
        expect(list.querySelector('summary')!.textContent).toBe('2 sources');
        expect(Array.from(list.querySelectorAll('li a')).map((a) => a.getAttribute('href'))).toEqual([SKY.url, NASA.url]);
        expect(list.previousElementSibling!.classList.contains('aparte-segments')).toBe(true);
    });

    it('appears when sources arrive after the text, and through a framework\'s re-sync', () => {
        const el = bubble();
        const text = { id: 'a', type: 'text', content: 'The sky is blue.', isStreaming: false } as AparteSegment;
        el.setSegments([text]);
        expect(el.querySelector('.aparte-sources')).toBeNull();
        const message = { id: 'm1', role: 'assistant', status: 'completed', content: '', segments: [
            { ...text, sources: [SKY], citations: [{ end: 16, sources: ['s1'] }] },
        ] } as unknown as AparteMessage;
        populateBubbleFromMessage(el as never, message);
        expect(el.querySelector('.aparte-sources summary')!.textContent).toBe('1 source');
        expect(el.querySelectorAll('.aparte-citation')).toHaveLength(1);
    });
});
