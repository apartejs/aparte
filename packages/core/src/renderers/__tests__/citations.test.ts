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

function drawn(content: string, extra: Partial<AparteTextSegment> = {}, render: (raw: string) => string = markdown): HTMLElement {
    aparteGlobalConfig.setMarkdownProvider(render);
    const segment: AparteTextSegment = { id: 't1', type: 'text', content, isStreaming: false, ...extra };
    const holder = document.createElement('div');
    holder.innerHTML = textRenderer.render(segment) as string;
    const el = holder.firstElementChild as HTMLElement;
    document.body.append(el);
    textRenderer.setup?.(el, segment);
    return el.querySelector('.aparte-segment-content') as HTMLElement;
}

const chips = (root: Element) => Array.from(root.querySelectorAll<HTMLButtonElement>('.aparte-citation'));
/** What a chip reads: the stylesheet draws it from `data-label`. */
const label = (chip: Element) => (chip as HTMLElement).dataset.label;
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
        expect(label(chip!)).toBe('en.wikipedia.org');
        expect(chip!.textContent).toBe('');
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
        expect(label(chips(root)[0]!)).toBe('nasa.gov +1');
        expect(chips(root)[0]!.getAttribute('aria-label')).toBe('nasa.gov +1, 2 sources');
    });

    it('finds a passage at the same occurrence when its words come twice', () => {
        const content = 'It is blue. Really, it is blue. Yes.';
        const second = content.indexOf('blue.', 10) + 5;
        const root = drawn(content, { sources: [SKY], citations: [{ end: second, sources: ['s1'] }] });
        expect(before(chips(root)[0]!)).toBe('It is blue. Really, it is blue.');
    });

    it('is not drawn when its passage cannot be found again: nothing is guessed', () => {
        expect(chips(drawn('One.\n\nTwo.', { sources: [SKY], citations: [{ end: 0, sources: ['s1'] }] }))).toHaveLength(0);
        // Words the screen does not show at all.
        expect(chips(drawn('One.', { sources: [SKY], citations: [{ end: 4, sources: ['s1'] }] }, () => '<p>Autre chose</p>'))).toHaveLength(0);
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
        expect(root.textContent).toBe('The sky is blue.');
    });

    it('finds its passage past list markers, entities, autolinks and code spans the screen draws differently', () => {
        const lists = (raw: string) => `<ol>${raw.split('\n').map((l) => `<li>${l.replace(/^\d+\.\s+/, '')}</li>`).join('')}</ol>`;
        const list = '1. First point.\n2. Second point.';
        expect(before(chips(drawn(list, { sources: [SKY], citations: [{ end: list.length, sources: ['s1'] }] }, lists))[0]!)).toBe('First point.Second point.');

        const entity = 'Tom &amp; Jerry.';
        expect(before(chips(drawn(entity, { sources: [SKY], citations: [{ end: entity.length, sources: ['s1'] }] }))[0]!)).toBe('Tom & Jerry.');

        const auto = 'See <https://example.com>. Then more.';
        const autolinks = () => '<p>See <a href="https://example.com">https://example.com</a>. Then more.</p>';
        expect(before(chips(drawn(auto, { sources: [SKY], citations: [{ end: auto.indexOf('.') + 1, sources: ['s1'] }] }, autolinks))[0]!)).toBe('See https://example.com.');

        const span = 'Use `<b>` here, then more.';
        const spans = () => '<p>Use <code>&lt;b&gt;</code> here, then more.</p>';
        const chip = chips(drawn(span, { sources: [SKY], citations: [{ end: span.indexOf('` ') + 1, sources: ['s1'] }] }, spans))[0]!;
        expect(chip.previousElementSibling!.tagName).toBe('CODE');
    });

    it('follows a code block it ends in, and leaves emphasis from anywhere inside it', () => {
        const block = 'Run:\n\n```\nnpm test\n```\n';
        const fences = () => '<p>Run:</p><pre><code>npm test</code></pre>';
        const chip = chips(drawn(block, { sources: [SKY], citations: [{ end: block.indexOf('test') + 4, sources: ['s1'] }] }, fences))[0]!;
        expect(chip.previousElementSibling!.tagName).toBe('PRE');
        expect(chip.closest('pre')).toBeNull();

        const strong = '**The sky is blue and wide**. More.';
        const mid = chips(drawn(strong, { sources: [SKY], citations: [{ end: strong.indexOf('blue') + 4, sources: ['s1'] }] }))[0]!;
        expect(mid.closest('strong')).toBeNull();
        expect(before(mid)).toBe('The sky is blue and wide.');
    });

    it('follows the closing punctuation of CJK, and a French no-break space before it', () => {
        const cjk = '空は青い。海は緑。';
        expect(before(chips(drawn(cjk, { sources: [SKY], citations: [{ end: 4, sources: ['s1'] }] }))[0]!)).toBe('空は青い。');
        const fr = 'Le ciel est bleu\u00a0! Et la mer.';
        expect(before(chips(drawn(fr, { sources: [SKY], citations: [{ end: fr.indexOf('bleu') + 4, sources: ['s1'] }] }))[0]!)).toBe('Le ciel est bleu\u00a0!');
    });

    it('hides a marker a renderer drew as a link, and puts the chip in its place', () => {
        const content = 'The sky is blue[1].';
        const asLink = () => '<p>The sky is blue<a href="#">1</a>.</p>';
        const root = drawn(content, { sources: [SKY], citations: [{ start: 15, end: 18, sources: ['s1'], marker: true }] }, asLink);
        const marker = root.querySelector<HTMLElement>('.aparte-citation-marker')!;
        expect(marker.hidden).toBe(true);
        expect(marker.firstElementChild!.tagName).toBe('A');
        expect(marker.nextSibling).toBe(chips(root)[0]);
    });

    it('draws nothing again for the same segment, and keeps the reader\'s place when the text is written anew', () => {
        const segment: AparteTextSegment = { id: 't1', type: 'text', content: 'The sky is blue.', isStreaming: false, sources: [SKY], citations: [{ end: 16, sources: ['s1'] }] };
        const root = drawn(segment.content, segment);
        const first = chips(root)[0]!;
        renderCitations(root, segment);
        expect(chips(root)[0]).toBe(first);

        first.focus();
        first.click();
        expect(document.querySelector('.aparte-citation-card')).not.toBeNull();
        // The text written over, as a one-shot render does on every chunk.
        root.innerHTML = '<p>The sky is blue. And more.</p>';
        renderCitations(root, { ...segment, content: 'The sky is blue. And more.' });
        const next = chips(root)[0]!;
        expect(next).not.toBe(first);
        expect(next.getAttribute('aria-expanded')).toBe('true');
        expect(document.querySelector('.aparte-citation-card')).not.toBeNull();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.activeElement).toBe(next);
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

    it('links only an absolute web address, and shows the rest by its title', () => {
        const local: AparteSource = { id: 's4', url: '/docs/sky', title: 'Our sky notes' };
        const root = drawn('Blue.', { sources: [local], citations: [{ end: 5, sources: ['s4'] }] });
        expect(label(chips(root)[0]!)).toBe('Our sky notes');
        chips(root)[0]!.click();
        expect(document.querySelector('.aparte-citation-card a')).toBeNull();
    });

    it('goes back to its chip when Tab leaves it, and keeps the focus on a control that can act', () => {
        const root = drawn('The sky is blue.', { sources: [SKY, NASA], citations: [{ end: 16, sources: ['s1', 's2'] }] });
        const chip = chips(root)[0]!;
        chip.click();
        const card = document.querySelector<HTMLElement>('.aparte-citation-card')!;
        const next = card.querySelector<HTMLButtonElement>('[data-aparte-card-part="next"]')!;
        next.focus();
        next.click();
        // "Next" is disabled on the last page: the focus goes to "previous", still in the card.
        expect(card.contains(document.activeElement)).toBe(true);
        expect((document.activeElement as HTMLElement).dataset.aparteCardPart).toBe('prev');
        const link = card.querySelector<HTMLElement>('a')!;
        link.focus();
        link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        expect(document.querySelector('.aparte-citation-card')).toBeNull();
        expect(document.activeElement).toBe(chip);
    });

    it('closes when its chip leaves the page, or the reader focuses elsewhere', async () => {
        const root = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] });
        chips(root)[0]!.click();
        root.closest('.aparte-segment')!.remove();
        await new Promise((r) => setTimeout(r, 0));
        expect(document.querySelector('.aparte-citation-card')).toBeNull();

        const again = drawn('Blue.', { sources: [SKY], citations: [{ end: 5, sources: ['s1'] }] });
        const chip = chips(again)[0]!;
        chip.click();
        chip.click();
        expect(document.querySelector('.aparte-citation-card')).toBeNull();
        chip.click();
        const outside = document.createElement('button');
        document.body.append(outside);
        document.querySelector('.aparte-citation-card a')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
        expect(document.querySelector('.aparte-citation-card')).toBeNull();
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
        // A re-sync where the segment no longer cites anything takes the list and the chip back.
        populateBubbleFromMessage(el as never, { ...message, segments: [text] } as AparteMessage);
        expect(el.querySelector('.aparte-sources')).toBeNull();
        expect(el.querySelectorAll('.aparte-citation')).toHaveLength(0);
    });

    it('follows segments added and removed one by one', () => {
        const el = bubble() as Bubble & { addSegment(s: AparteSegment): void; removeSegment(id: string): void };
        el.setSegments([{ id: 'a', type: 'text', content: 'One.', isStreaming: false } as AparteSegment]);
        el.addSegment({ id: 'b', type: 'text', content: 'Two.', isStreaming: false, sources: [SKY], citations: [{ end: 4, sources: ['s1'] }] } as AparteSegment);
        expect(el.querySelector('.aparte-sources summary')!.textContent).toBe('1 source');
        el.removeSegment('b');
        expect(el.querySelector('.aparte-sources')).toBeNull();
    });

    it('tells apart two sources with no address that share an id', () => {
        const el = bubble();
        el.setSegments([
            { id: 'a', type: 'text', content: 'One.', isStreaming: false, sources: [{ id: 's1', title: 'Internal report A' }] } as AparteSegment,
            { id: 'b', type: 'text', content: 'Two.', isStreaming: false, sources: [{ id: 's1', title: 'Internal report B' }] } as AparteSegment,
        ]);
        expect(el.querySelector('.aparte-sources summary')!.textContent).toBe('2 sources');
        expect(el.querySelectorAll('.aparte-sources li a')).toHaveLength(0);
    });
});
