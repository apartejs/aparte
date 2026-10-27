/**
 * Citations: a chip at the end of each passage a text segment cites, the card it opens,
 * and the list of a reply's sources under it.
 *
 * A provider says where a passage ends in the segment's Markdown source; the screen shows
 * that source rendered, by whichever Markdown provider is installed. So a chip is placed by
 * TEXT, not by provider: the letters and digits of the source up to the citation's end are
 * found again in the rendered text, at the same occurrence, and the chip goes after them —
 * after the sentence's closing punctuation, and outside any emphasis, link or code it ends
 * in. A passage that cannot be found again gets its chip at the end of the segment.
 *
 * Chips are core's own `<button>`s, put in after the Markdown was rendered and sanitized:
 * the sanitizer strips `button` and `aparte-*` from model output, so text cannot forge one.
 * The card is mounted beside the transcript, not in the bubble, which clips what it paints
 * (`content-visibility`), and pages through a chip's sources.
 */
import { contextConfig } from '../config/index.js';
import { isSafeUrl } from '../config/sanitize.js';
import type { AparteConfig } from '../config/aparte-config.js';
import type { AparteCitation, AparteSource, AparteTextSegment } from '../types/index.js';

const CHIP_CLASS = 'aparte-citation';
const MARKER_CLASS = 'aparte-citation-marker';
/** What a passage is matched on: what any Markdown renderer leaves of the text. */
const WORD = /[\p{L}\p{N}]/u;
/** How much of a passage's end is matched — enough to be unique in a reply, short enough to survive markup. */
const TAIL = 24;
/** Elements a chip is never put inside: it goes after the outermost of them. */
const INLINE = new Set(['A', 'ABBR', 'B', 'CITE', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U']);
/** Punctuation that closes a passage: the chip follows it. */
const CLOSING = /[.,;:!?)\]}»"'’”…]/;

/** The sources each chip stands for. */
const chipSources = new WeakMap<HTMLElement, AparteSource[]>();
const wired = new WeakSet<Element>();

/** The domain a source is shown by: `en.wikipedia.org` → `en.wikipedia.org`, `www.` dropped. */
export function sourceDomain(source: AparteSource): string {
    if (source.url) {
        try { return new URL(source.url).hostname.replace(/^www\./, ''); } catch { /* not a URL: the title instead */ }
    }
    return source.title ?? '';
}

/** What a chip reads: its first source's domain, and how many more. */
function chipLabel(sources: AparteSource[]): string {
    const first = sourceDomain(sources[0]!) || '?';
    return sources.length > 1 ? `${first} +${sources.length - 1}` : first;
}

/** "3 sources", "1 source", in the chat's language. */
export function sourcesCount(config: AparteConfig, n: number): string {
    const locale = config.getLocale();
    return n === 1 ? locale.sourcesOne ?? '1 source' : (locale.sourcesCount ?? '{n} sources').replace('{n}', () => String(n));
}

/** The letters and digits of Markdown as a reader sees them: no link targets, no tags, no fence lines. */
function visible(markdown: string): string {
    const text = markdown
        .replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm, '')
        .replace(/\]\([^)\n]*\)/g, ']')
        .replace(/<\/?[A-Za-z][^>\n]*>/g, '');
    let out = '';
    for (const ch of text) if (WORD.test(ch)) out += ch;
    return out;
}

/** The rendered text's letters and digits, each with the text node and offset just after it. */
function renderedText(root: Element): { text: string; ends: Array<[Text, number]> } {
    let text = '';
    const ends: Array<[Text, number]> = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        // A drawing (a formula, a diagram) shows its source differently; its placeholder, hidden
        // beside it, still holds the source as written.
        acceptNode: (n) => (n.parentElement?.closest(`.aparte-code-drawing, .${CHIP_CLASS}`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const data = node.data;
        for (let i = 0; i < data.length;) {
            const width = (data.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
            const ch = data.slice(i, i + width);
            i += width;
            if (!WORD.test(ch)) continue;
            text += ch;
            for (let k = 0; k < width; k++) ends.push([node, i]);
        }
    }
    return { text, ends };
}

function occurrences(haystack: string, needle: string): number {
    let n = 0;
    for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) n++;
    return n;
}

/** Where a citation's passage ends on screen, or `null` when it cannot be found again. */
function locate(content: string, citation: AparteCitation, rendered: { text: string; ends: Array<[Text, number]> }): [Text, number] | null {
    const prefix = visible(content.slice(0, Math.max(0, Math.min(content.length, citation.end))));
    if (!prefix) return null;
    const tail = prefix.slice(-TAIL);
    const n = occurrences(prefix, tail);
    let at = -1;
    for (let k = 0; k < n; k++) {
        at = rendered.text.indexOf(tail, at + 1);
        if (at < 0) return null;
    }
    return rendered.ends[at + tail.length - 1] ?? null;
}

/** Put `chip` after the passage ending at `node`/`offset`: past its punctuation, out of inline markup. */
function placeChip(root: Element, chip: HTMLElement, node: Text, offset: number): void {
    let end = offset;
    while (end < node.data.length && CLOSING.test(node.data[end]!)) end++;
    let outer: Element | null = null;
    if (end === node.data.length) {
        for (let el = node.parentElement; el && el !== root && INLINE.has(el.tagName); el = el.parentElement) outer = el;
    }
    if (!outer) {
        node.splitText(end);
        node.after(chip);
        return;
    }
    let after: Node = outer;
    // A formula's drawing sits beside its hidden placeholder: the chip follows the drawing.
    while (after.nextSibling instanceof Element && after.nextSibling.classList.contains('aparte-code-drawing')) after = after.nextSibling;
    const next = after.nextSibling;
    if (next instanceof Text) {
        let k = 0;
        while (k < next.data.length && CLOSING.test(next.data[k]!)) k++;
        if (k > 0) {
            next.splitText(k);
            after = next;
        }
    }
    after.parentNode!.insertBefore(chip, after.nextSibling);
}

/** The end of the segment's last block: where a passage that cannot be found again is cited. */
function lastBlock(root: Element): Element {
    let block: Element = root;
    while (block.lastElementChild && /^(?:UL|OL|LI|BLOCKQUOTE|TABLE|TBODY|TR|TD|DIV)$/.test(block.lastElementChild.tagName)) {
        block = block.lastElementChild;
    }
    return block.lastElementChild && !/^(?:PRE|HR|TABLE)$/.test(block.lastElementChild.tagName) ? block.lastElementChild : block;
}

function makeChip(sources: AparteSource[], config: AparteConfig): HTMLButtonElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'aparte-citation aparte-tag aparte-tag--sm';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    chipSources.set(chip, sources);
    labelChip(chip, config);
    return chip;
}

function labelChip(chip: HTMLElement, config: AparteConfig): void {
    const sources = chipSources.get(chip) ?? [];
    const label = chipLabel(sources);
    chip.textContent = label;
    // The visible text first, then what it stands for (WCAG 2.5.3).
    chip.setAttribute('aria-label', `${label}, ${sourcesCount(config, sources.length)}`);
}

/** Take the chips away and show the markers again, before the text is drawn or read anew. */
export function unrenderCitations(root: Element): void {
    const parents = new Set<Node>();
    for (const chip of Array.from(root.querySelectorAll(`.${CHIP_CLASS}`))) {
        if (chip.parentNode) parents.add(chip.parentNode);
        if (card?.chip === chip) closeCard(false);
        chip.remove();
    }
    for (const marker of Array.from(root.querySelectorAll(`.${MARKER_CLASS}`))) {
        if (marker.parentNode) parents.add(marker.parentNode);
        marker.replaceWith(...Array.from(marker.childNodes));
    }
    for (const parent of parents) parent.normalize();
}

/**
 * Draw the chips of a text segment's citations in its rendered Markdown. Idempotent: the
 * chips are taken out and put back on every call, as the text is written anew while it
 * streams. Call it after writing a segment's Markdown into an element of your own.
 */
export function renderCitations(root: Element, segment: AparteTextSegment): void {
    if (typeof document === 'undefined') return;
    unrenderCitations(root);
    const citations = segment.citations ?? [];
    const sources = new Map((segment.sources ?? []).map((s) => [s.id, s]));
    if (citations.length === 0 || sources.size === 0) return;
    const config = contextConfig(root);
    if (!wired.has(root)) {
        wired.add(root);
        root.addEventListener('click', (event) => {
            const chip = (event.target as Element | null)?.closest?.(`.${CHIP_CLASS}`) as HTMLElement | null;
            if (chip && root.contains(chip)) toggleCard(chip);
        });
    }

    const rendered = renderedText(root);
    // One chip per spot: citations ending at the same place share it.
    const spots = new Map<string, { node: Text | null; offset: number; marker: string | null; sources: AparteSource[] }>();
    for (const citation of citations) {
        const cited = citation.sources.map((id) => sources.get(id)).filter((s): s is AparteSource => !!s);
        if (cited.length === 0) continue;
        const found = locate(segment.content, citation, rendered);
        const key = found ? `${rendered.ends.indexOf(found)}` : 'end';
        const marker = citation.marker && citation.start !== undefined ? segment.content.slice(citation.start, citation.end) : null;
        const spot = spots.get(key) ?? { node: found?.[0] ?? null, offset: found?.[1] ?? 0, marker, sources: [] };
        for (const s of cited) if (!spot.sources.includes(s)) spot.sources.push(s);
        spots.set(key, spot);
    }

    // Last spot first: putting a chip in splits a text node, which moves every offset after it.
    const ordered = [...spots.values()].sort((a, b) => {
        if (!a.node) return -1;
        if (!b.node) return 1;
        if (a.node === b.node) return b.offset - a.offset;
        return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
    });
    for (const spot of ordered) {
        const chip = makeChip(spot.sources, config);
        if (!spot.node) {
            lastBlock(root).append(' ', chip);
            continue;
        }
        if (spot.marker) {
            // The marker the model wrote (`[1]`) gives its place to the chip; the text keeps it.
            const node = spot.node;
            const start = node.data.lastIndexOf(spot.marker, spot.offset);
            if (start >= 0 && start + spot.marker.length >= spot.offset) {
                const rest = node.splitText(start);
                rest.splitText(spot.marker.length);
                const hidden = document.createElement('span');
                hidden.className = MARKER_CLASS;
                hidden.hidden = true;
                rest.replaceWith(hidden);
                hidden.append(rest);
                hidden.after(chip);
                continue;
            }
        }
        placeChip(root, chip, spot.node, spot.offset);
    }
}

/** Relabel the chips under `root` in the chat's current language. */
export function relabelCitations(root: Element): void {
    const config = contextConfig(root);
    for (const chip of Array.from(root.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`))) labelChip(chip, config);
}

// ── The card ─────────────────────────────────────────────────────────────────

let card: { chip: HTMLElement; el: HTMLElement; sources: AparteSource[]; index: number; config: AparteConfig } | null = null;
let cards = 0;

function toggleCard(chip: HTMLElement): void {
    if (card?.chip === chip) closeCard(true);
    else openCard(chip);
}

function openCard(chip: HTMLElement): void {
    closeCard(false);
    const sources = chipSources.get(chip) ?? [];
    if (sources.length === 0) return;
    const config = contextConfig(chip);
    const el = document.createElement('div');
    el.className = 'aparte-citation-card aparte-popover';
    el.id = `aparte-citation-card-${++cards}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', config.getLocale().sourcesCard ?? 'Sources');
    // Beside the transcript, never inside a bubble: the bubble clips what it paints.
    (chip.closest('aparte-chat-viewport')?.parentElement ?? chip.ownerDocument.body).append(el);
    chip.setAttribute('aria-expanded', 'true');
    chip.setAttribute('aria-controls', el.id);
    card = { chip, el, sources, index: 0, config };
    drawCard();
    placeCard();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', placeCard, true);
    window.addEventListener('resize', placeCard);
    el.addEventListener('focusout', onFocusOut);
    // The source's link, else the first button that can act: on the first page "previous"
    // is disabled, and focusing it would leave the focus nowhere.
    (el.querySelector<HTMLElement>('a') ?? el.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
}

function closeCard(returnFocus: boolean): void {
    if (!card) return;
    const { chip, el } = card;
    card = null;
    el.remove();
    chip.setAttribute('aria-expanded', 'false');
    chip.removeAttribute('aria-controls');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('scroll', placeCard, true);
    window.removeEventListener('resize', placeCard);
    if (returnFocus && chip.isConnected) chip.focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !card) return;
    event.preventDefault();
    closeCard(true);
}

function onPointer(event: PointerEvent): void {
    if (!card) return;
    const target = event.target as Node | null;
    if (target && (card.el.contains(target) || card.chip.contains(target))) return;
    closeCard(false);
}

function onFocusOut(event: FocusEvent): void {
    if (!card) return;
    const to = event.relatedTarget as Node | null;
    if (to && (card.el.contains(to) || card.chip.contains(to))) return;
    if (to) closeCard(false);
}

/** Under the chip, flipped above when it would leave the window; corrected for the box it is fixed in. */
function placeCard(): void {
    if (!card) return;
    const { chip, el } = card;
    if (!chip.isConnected) { closeCard(false); return; }
    const anchor = chip.getBoundingClientRect();
    el.style.left = '0px';
    el.style.top = '0px';
    // `position: fixed` resolves against a contained ancestor when there is one (the chat's
    // shell): measuring where (0, 0) landed says by how much.
    const origin = el.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - el.offsetWidth - 8));
    let top = anchor.bottom + gap;
    if (top + el.offsetHeight > window.innerHeight - 8 && anchor.top - el.offsetHeight - gap > 8) top = anchor.top - el.offsetHeight - gap;
    el.style.left = `${left - origin.left}px`;
    el.style.top = `${top - origin.top}px`;
}

function drawCard(): void {
    if (!card) return;
    const { el, sources, index, config } = card;
    const locale = config.getLocale();
    const source = sources[index]!;
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.aparteCardPart : undefined;
    el.replaceChildren();

    if (sources.length > 1) {
        const pager = document.createElement('div');
        pager.className = 'aparte-citation-card__pager';
        const prev = pagerButton(locale.sourcePrevious ?? 'Previous source', config.getIcon('prevBranch'), 'prev', index === 0, () => turn(-1));
        const position = document.createElement('span');
        position.className = 'aparte-citation-card__position';
        position.textContent = `${index + 1}/${sources.length}`;
        position.setAttribute('aria-hidden', 'true');
        const next = pagerButton(locale.sourceNext ?? 'Next source', config.getIcon('nextBranch'), 'next', index === sources.length - 1, () => turn(1));
        pager.append(prev, position, next);
        el.append(pager);
    }

    const title = source.title || sourceDomain(source) || source.url || '';
    if (source.url && isSafeUrl(source.url, 'a')) {
        const link = document.createElement('a');
        link.className = 'aparte-citation-card__title';
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.aparteCardPart = 'link';
        link.textContent = title;
        const hint = document.createElement('span');
        hint.className = 'aparte-sr-only';
        hint.textContent = ` ${locale.opensInNewTab ?? '(opens in a new tab)'}`;
        link.append(hint);
        el.append(link);
    } else {
        const plain = document.createElement('p');
        plain.className = 'aparte-citation-card__title';
        plain.textContent = title;
        el.append(plain);
    }
    const domain = sourceDomain(source);
    if (domain && domain !== title) {
        const p = document.createElement('p');
        p.className = 'aparte-citation-card__domain';
        p.textContent = domain;
        el.append(p);
    }
    if (source.snippet) {
        const p = document.createElement('p');
        p.className = 'aparte-citation-card__snippet';
        p.textContent = source.snippet;
        el.append(p);
    }
    const status = document.createElement('p');
    status.className = 'aparte-sr-only';
    status.setAttribute('role', 'status');
    if (sources.length > 1) {
        status.textContent = (locale.sourcePosition ?? 'Source {i} of {n}').replace('{i}', () => String(index + 1)).replace('{n}', () => String(sources.length));
    }
    el.append(status);
    if (focused) (el.querySelector(`[data-aparte-card-part="${focused}"]`) as HTMLElement | null)?.focus(); // safe-attr: one of this card's own part names
}

function pagerButton(label: string, icon: string, part: string, disabled: boolean, act: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'aparte-btn aparte-btn--icon aparte-btn--sm';
    button.setAttribute('aria-label', label);
    button.dataset.aparteCardPart = part;
    button.disabled = disabled;
    button.innerHTML = icon;
    button.addEventListener('click', act);
    return button;
}

function turn(step: number): void {
    if (!card) return;
    card.index = Math.max(0, Math.min(card.sources.length - 1, card.index + step));
    drawCard();
    placeCard();
}

// ── The list ─────────────────────────────────────────────────────────────────

/**
 * The sources of a reply, listed after its segments in `container`: a closed `<details>`,
 * "3 sources", each a link. Removed when the reply has none; rebuilt only when they change.
 */
export function renderSourceList(container: HTMLElement, after: Element, sources: readonly AparteSource[], config: AparteConfig): void {
    let list = container.querySelector<HTMLDetailsElement>(':scope > .aparte-sources');
    const unique: AparteSource[] = [];
    const seen = new Set<string>();
    for (const s of sources) {
        const key = s.url ?? `#${s.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
    }
    if (unique.length === 0) { list?.remove(); return; }
    const key = unique.map((s) => `${s.url ?? s.id}\u0001${s.title ?? ''}`).join('\u0002');
    if (!list) {
        list = document.createElement('details');
        list.className = 'aparte-sources';
        after.after(list);
    } else if (list.dataset.aparteKey === key) {
        (list.querySelector('summary') as HTMLElement).textContent = sourcesCount(config, unique.length);
        return;
    }
    list.dataset.aparteKey = key;
    const summary = document.createElement('summary');
    summary.className = 'aparte-sources__summary';
    summary.textContent = sourcesCount(config, unique.length);
    const items = document.createElement('ol');
    items.className = 'aparte-sources__list';
    const hintText = config.getLocale().opensInNewTab ?? '(opens in a new tab)';
    for (const s of unique) {
        const item = document.createElement('li');
        item.className = 'aparte-sources__item';
        const domain = sourceDomain(s);
        const title = s.title || domain || s.url || '';
        if (s.url && isSafeUrl(s.url, 'a')) {
            const link = document.createElement('a');
            link.href = s.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = title;
            const hint = document.createElement('span');
            hint.className = 'aparte-sr-only';
            hint.textContent = ` ${hintText}`;
            link.append(hint);
            item.append(link);
        } else {
            item.append(title);
        }
        if (domain && domain !== title) {
            const d = document.createElement('span');
            d.className = 'aparte-sources__domain';
            d.textContent = domain;
            item.append(' ', d);
        }
        items.append(item);
    }
    list.replaceChildren(summary, items);
}
