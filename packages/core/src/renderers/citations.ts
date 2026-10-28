/**
 * Citations: a chip at the end of each passage a text segment cites, the card it opens,
 * and the list of a reply's sources under it.
 *
 * A provider says where a passage ends in the segment's Markdown source; the screen shows
 * that source rendered, by whichever Markdown provider is installed. So a chip is placed by
 * TEXT, not by provider: the letters and digits of the source up to the citation's end are
 * found again in the rendered text, at the same occurrence, and the chip goes after them —
 * after the sentence's closing punctuation, and outside any emphasis, link or code it ends
 * in. A passage that cannot be found again gets no chip: its source stays in the list, and
 * nothing is guessed.
 *
 * Chips are core's own `<button>`s, put in after the Markdown was rendered and sanitized:
 * the sanitizer strips `button` and `aparte-*` from model output, so text cannot forge one.
 * The card is a popover in the top layer, so no bubble, shell or modal around the chat
 * clips it; where the Popover API is missing it is fixed beside the transcript.
 */
import { contextConfig } from '../config/index.js';
import { isSafeUrl } from '../config/sanitize.js';
import type { AparteConfig } from '../config/aparte-config.js';
import type { AparteCitation, AparteSource, AparteTextSegment } from '../types/index.js';

const CHIP_CLASS = 'aparte-citation';
const MARKER_CLASS = 'aparte-citation-marker';
/** What a passage is matched on: what any Markdown renderer leaves of the text. */
const WORD = /[\p{L}\p{N}]/u;
/** How much of a passage's end is matched, longest first: unique in a reply, short enough to survive markup. */
const TAILS = [24, 12, 6];
/** Elements a chip is never put inside: it goes after the outermost of them. */
const INLINE = new Set(['A', 'ABBR', 'B', 'CITE', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'U']);
/** Punctuation that closes a passage, in Latin, CJK and Arabic scripts: the chip follows it. */
const CLOSING = /[.,;:!?)\]}»"'’”…。、，．！？：；」』）】》،؛؟]/;
/** A no-break space French puts before `!`, `?`, `:` and `;`: stepped over when closing punctuation follows. */
const THIN = /[\u00a0\u202f]/;

/** The sources each chip stands for. */
const chipSources = new WeakMap<HTMLElement, AparteSource[]>();
/** The element each chip was drawn in. */
const chipRoots = new WeakMap<HTMLElement, Element>();
const wired = new WeakSet<Element>();
/** What each root's chips were drawn from, and how many: a re-sync of the same segment draws nothing. */
const drawn = new WeakMap<Element, { signature: string; count: number }>();
/** The chip the reader is on: text written anew takes it away, and its replacement gets the focus back. */
let focused: { root: Element; chip: HTMLElement; at: number } | null = null;

/** The absolute web address a source links to, or `undefined`: a relative or other-scheme URL is shown, never linked. */
function webUrl(source: AparteSource): string | undefined {
    const url = source.url?.trim();
    return url && /^https?:\/\//i.test(url) && isSafeUrl(url, 'a') ? url : undefined;
}

/** The domain a source is shown by — `www.` dropped — or its title when it has no web address. */
export function sourceDomain(source: AparteSource): string {
    const url = webUrl(source);
    if (url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { /* the title instead */ }
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

/** `&eacute;` → `é`; with no DOM to decode it, nothing. */
function decodeEntity(entity: string): string {
    if (typeof document === 'undefined') return '';
    const area = document.createElement('textarea');
    area.innerHTML = entity;
    return area.value;
}

/** What Markdown outside code shows of itself: no list or task markers, images, comments, tags or link targets. */
function shown(markdown: string): string {
    return markdown
        .replace(/^[ \t]*(?:>[ \t]*)*(?:\d{1,9}[.)]|[*+-])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '')
        .replace(/<([a-z][a-z0-9+.-]*:[^>\s]+)>/gi, '$1')
        .replace(/\]\([^)\n]*\)/g, ']')
        .replace(/<\/?[A-Za-z][^>\n]*>/g, '')
        .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, decodeEntity);
}

/** The letters and digits of Markdown as a reader sees them. A code span shows what it holds, `<` included. */
function visible(markdown: string): string {
    const source = markdown.replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm, '');
    let text = '';
    let at = 0;
    for (const m of source.matchAll(/(`+)([^`][\s\S]*?)\1/g)) {
        text += shown(source.slice(at, m.index)) + m[2]!;
        at = (m.index ?? 0) + m[0].length;
    }
    text += shown(source.slice(at));
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
    // The longest tail first; a shorter one when markup the source shows and the screen does
    // not (or the other way round) sits inside it.
    for (const size of TAILS) {
        const tail = prefix.slice(-size);
        const n = occurrences(prefix, tail);
        let at = -1;
        for (let k = 0; k < n && (k === 0 || at >= 0); k++) at = rendered.text.indexOf(tail, at + 1);
        if (at >= 0) return rendered.ends[at + tail.length - 1] ?? null;
        if (tail.length === prefix.length) break;
    }
    return null;
}

/** How many characters of `data` from `from` close a passage: punctuation, and a no-break space before it. */
function closingRun(data: string, from: number): number {
    let i = from;
    while (i < data.length && (CLOSING.test(data[i]!) || (THIN.test(data[i]!) && CLOSING.test(data[i + 1] ?? '')))) i++;
    return i - from;
}

/** Put `chip` after the passage ending at `node`/`offset`: past its punctuation, out of inline markup and code. */
function placeChip(root: Element, chip: HTMLElement, node: Text, offset: number): void {
    // A code block is never cut: the chip follows it.
    const pre = node.parentElement?.closest('pre');
    if (pre && root.contains(pre)) {
        pre.after(chip);
        return;
    }
    let outer: Element | null = null;
    for (let el = node.parentElement; el && el !== root && INLINE.has(el.tagName); el = el.parentElement) outer = el;
    if (!outer) {
        node.splitText(offset + closingRun(node.data, offset));
        node.after(chip);
        return;
    }
    // Inside a link, emphasis or code: after the outermost of them, whatever follows inside.
    let after: Node = outer;
    // A formula's drawing sits beside its hidden placeholder: the chip follows the drawing.
    while (after.nextSibling instanceof Element && after.nextSibling.classList.contains('aparte-code-drawing')) after = after.nextSibling;
    const next = after.nextSibling;
    if (next instanceof Text) {
        const k = closingRun(next.data, 0);
        if (k > 0) {
            next.splitText(k);
            after = next;
        }
    }
    after.parentNode!.insertBefore(chip, after.nextSibling);
}

/** Hide the marker the model wrote for a citation (`[1]`) and put `chip` in its place; `false` when it is not there. */
function replaceMarker(chip: HTMLElement, node: Text, offset: number, marker: string): boolean {
    const hide = (el: Node): void => {
        const hidden = document.createElement('span');
        hidden.className = MARKER_CLASS;
        hidden.hidden = true;
        el.parentNode!.insertBefore(hidden, el);
        hidden.append(el);
        hidden.after(chip);
    };
    const start = node.data.lastIndexOf(marker, offset);
    if (start >= 0 && start + marker.length >= offset) {
        const rest = node.splitText(start);
        rest.splitText(marker.length);
        hide(rest);
        return true;
    }
    // A provider that reads `[1]` as a link shows `<a>1</a>`: the element is the marker.
    const parent = node.parentElement;
    const letters = marker.replace(/^\[|\]$/g, '');
    if (parent && INLINE.has(parent.tagName) && parent.textContent?.trim() === letters) {
        hide(parent);
        return true;
    }
    return false;
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
    // Drawn by the stylesheet, not written in the text: a reader selecting the passage copies
    // its words, not "wikipedia +2" (WebKit's selection takes a button's text along).
    chip.dataset.label = label;
    // The visible text first, then what it stands for (WCAG 2.5.3).
    chip.setAttribute('aria-label', `${label}, ${sourcesCount(config, sources.length)}`);
}

/** Take the chips away and show the markers again, before the text is drawn or read anew. */
export function unrenderCitations(root: Element): void {
    const parents = new Set<Node>();
    for (const chip of Array.from(root.querySelectorAll(`.${CHIP_CLASS}`))) {
        if (chip.parentNode) parents.add(chip.parentNode);
        chip.remove();
    }
    for (const marker of Array.from(root.querySelectorAll(`.${MARKER_CLASS}`))) {
        if (marker.parentNode) parents.add(marker.parentNode);
        marker.replaceWith(...Array.from(marker.childNodes));
    }
    for (const parent of parents) parent.normalize();
    drawn.delete(root);
}

/**
 * Draw the chips of a text segment's citations in its rendered Markdown. Idempotent: the
 * same segment drawn again changes nothing; text written anew (a reply streaming) gets its
 * chips again, keeping the focus and an open card on the chip that replaces theirs. Call it
 * after writing a segment's Markdown into an element of your own.
 */
export function renderCitations(root: Element, segment: AparteTextSegment): void {
    if (typeof document === 'undefined') return;
    const citations = segment.citations ?? [];
    const sources = new Map((segment.sources ?? []).map((s) => [s.id, s]));
    const signature = JSON.stringify([segment.content, citations, [...sources.values()].map((s) => [s.id, s.url, s.title, s.snippet])]);
    const before = Array.from(root.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`));
    const last = drawn.get(root);
    if (last && last.signature === signature && last.count === before.length) return;

    // Where the reader was, by position: the chips about to be drawn replace these.
    const active = document.activeElement;
    const focusedAt = focused?.root === root && (active === focused.chip || ((!active || active === document.body) && !focused.chip.isConnected)) ? focused.at : -1;
    const openAt = card?.root === root ? (card.chip.isConnected ? before.indexOf(card.chip) : card.at) : -1;
    unrenderCitations(root);
    if (citations.length === 0 || sources.size === 0) {
        drawn.set(root, { signature, count: 0 });
        if (openAt >= 0) closeCard(false);
        return;
    }
    const config = contextConfig(root);
    if (!wired.has(root)) {
        wired.add(root);
        root.addEventListener('click', (event) => {
            const chip = (event.target as Element | null)?.closest?.(`.${CHIP_CLASS}`) as HTMLElement | null;
            if (!chip || !root.contains(chip)) return;
            // A chip is never in a link, but a provider's DOM is its own: the chip's click is the card's.
            event.preventDefault();
            toggleCard(chip);
        });
        root.addEventListener('focusin', (event) => {
            const chip = event.target as HTMLElement;
            if (chip.classList?.contains(CHIP_CLASS)) focused = { root, chip, at: Array.from(root.querySelectorAll(`.${CHIP_CLASS}`)).indexOf(chip) };
        });
        root.addEventListener('focusout', (event) => {
            if (focused?.root === root && (event as FocusEvent).relatedTarget) focused = null;
        });
    }

    const rendered = renderedText(root);
    // One chip per spot: citations ending at the same place share it.
    const spots = new Map<number, { node: Text; offset: number; marker: string | null; sources: AparteSource[] }>();
    for (const citation of citations) {
        const cited = citation.sources.map((id) => sources.get(id)).filter((s): s is AparteSource => !!s);
        if (cited.length === 0) continue;
        const found = locate(segment.content, citation, rendered);
        if (!found) continue;
        const key = rendered.ends.indexOf(found);
        const marker = citation.marker && citation.start !== undefined ? segment.content.slice(citation.start, citation.end) : null;
        const spot = spots.get(key) ?? { node: found[0], offset: found[1], marker, sources: [] };
        for (const s of cited) if (!spot.sources.includes(s)) spot.sources.push(s);
        spots.set(key, spot);
    }

    // Last spot first: putting a chip in splits a text node, which moves every offset after it.
    const ordered = [...spots.values()].sort((a, b) => {
        if (a.node === b.node) return b.offset - a.offset;
        return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
    });
    for (const spot of ordered) {
        const chip = makeChip(spot.sources, config);
        chipRoots.set(chip, root);
        if (spot.marker && replaceMarker(chip, spot.node, spot.offset, spot.marker)) continue;
        placeChip(root, chip, spot.node, spot.offset);
    }

    const after = Array.from(root.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`));
    drawn.set(root, { signature, count: after.length });
    if (focusedAt >= 0) {
        if (after[focusedAt]) after[focusedAt].focus({ preventScroll: true });
        else focused = null;
    }
    if (openAt >= 0 && card) {
        const chip = after[openAt];
        if (chip) {
            card.chip = chip;
            card.at = openAt;
            chip.setAttribute('aria-expanded', 'true');
            chip.setAttribute('aria-controls', card.el.id);
        } else {
            closeCard(false);
        }
    }
}

/** Relabel the chips under `root` in the chat's current language. */
export function relabelCitations(root: Element): void {
    const config = contextConfig(root);
    for (const chip of Array.from(root.querySelectorAll<HTMLElement>(`.${CHIP_CLASS}`))) labelChip(chip, config);
}

// ── The card ─────────────────────────────────────────────────────────────────

interface Card {
    root: Element;
    chip: HTMLElement;
    /** The chip's place among its root's, to find its replacement when the text is written anew. */
    at: number;
    el: HTMLElement;
    body: HTMLElement;
    status: HTMLElement;
    sources: AparteSource[];
    index: number;
    config: AparteConfig;
    watch: MutationObserver | null;
}
let card: Card | null = null;
let cards = 0;

function toggleCard(chip: HTMLElement): void {
    if (card?.chip === chip) closeCard(true);
    else openCard(chip);
}

function openCard(chip: HTMLElement): void {
    closeCard(false);
    const sources = chipSources.get(chip) ?? [];
    if (sources.length === 0) return;
    const root = chipRoots.get(chip) ?? chip.parentElement!;
    const at = Array.from(root.querySelectorAll(`.${CHIP_CLASS}`)).indexOf(chip);
    const config = contextConfig(chip);
    const el = document.createElement('div');
    el.className = 'aparte-citation-card aparte-popover';
    el.id = `aparte-citation-card-${++cards}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', config.getLocale().sourcesCard ?? 'Sources');
    const body = document.createElement('div');
    body.className = 'aparte-citation-card__body';
    // One live region for the card's life: one created with its text is not reliably read out.
    const status = document.createElement('p');
    status.className = 'aparte-sr-only';
    status.setAttribute('role', 'status');
    el.append(body, status);
    // In the chat's tree, for its tokens; in the top layer, so nothing around the chat clips it.
    const top = typeof el.showPopover === 'function';
    if (top) el.popover = 'manual';
    (chip.closest('aparte-chat-viewport')?.parentElement ?? chip.ownerDocument.body).append(el);
    if (top) el.showPopover();
    chip.setAttribute('aria-expanded', 'true');
    chip.setAttribute('aria-controls', el.id);
    const watch = typeof MutationObserver === 'function' ? new MutationObserver(guardCard) : null;
    watch?.observe(chip.ownerDocument.body, { childList: true, subtree: true });
    card = { root, chip, at, el, body, status, sources, index: 0, config, watch };
    drawCard();
    placeCard();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', placeCard);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('keydown', onCardKey);
    focusIn(el);
}

/** The source's link, else the first button that can act. */
function focusIn(el: HTMLElement): void {
    (el.querySelector<HTMLElement>('a') ?? el.querySelector<HTMLElement>('button:not([disabled])'))?.focus();
}

function closeCard(returnFocus: boolean): void {
    if (!card) return;
    const { chip, el, watch } = card;
    card = null;
    watch?.disconnect();
    el.remove();
    chip.setAttribute('aria-expanded', 'false');
    chip.removeAttribute('aria-controls');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', placeCard);
    if (returnFocus && chip.isConnected) chip.focus();
}

/** A card whose chip has left the page (the message was removed, its text written anew) closes. */
function guardCard(): void {
    if (card && !card.chip.isConnected) closeCard(false);
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !card) return;
    event.preventDefault();
    closeCard(true);
}

/** Tab past the card's last control, or back past its first, goes back to the chip: the reader's place in the reply. */
function onCardKey(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !card) return;
    const controls = Array.from(card.el.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
    if (document.activeElement !== edge) return;
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

/** The chip's scroll container: the transcript. */
function scrollerOf(el: Element): Element | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') return node;
    }
    return null;
}

/** A chip scrolled out of the transcript takes its card with it. */
function onScroll(): void {
    if (!card) return;
    const scroller = scrollerOf(card.chip);
    if (scroller) {
        const view = scroller.getBoundingClientRect();
        const at = card.chip.getBoundingClientRect();
        if (at.bottom < view.top || at.top > view.bottom) {
            closeCard(false);
            return;
        }
    }
    placeCard();
}

/** Under the chip, flipped above when it would leave the window, aligned on the chip's start edge. */
function placeCard(): void {
    if (!card) return;
    const { chip, el } = card;
    if (!chip.isConnected) { closeCard(false); return; }
    const anchor = chip.getBoundingClientRect();
    el.style.left = '0px';
    el.style.top = '0px';
    // `position: fixed` resolves against a contained ancestor when the card is not in the top
    // layer (the chat's shell): measuring where (0, 0) landed says by how much.
    const origin = el.getBoundingClientRect();
    const gap = 6;
    const rtl = getComputedStyle(chip).direction === 'rtl';
    const start = rtl ? anchor.right - el.offsetWidth : anchor.left;
    const left = Math.max(8, Math.min(start, window.innerWidth - el.offsetWidth - 8));
    let top = anchor.bottom + gap;
    if (top + el.offsetHeight > window.innerHeight - 8 && anchor.top - el.offsetHeight - gap > 8) top = anchor.top - el.offsetHeight - gap;
    el.style.left = `${left - origin.left}px`;
    el.style.top = `${top - origin.top}px`;
}

function drawCard(): void {
    if (!card) return;
    const { el, body, status, sources, index, config } = card;
    const locale = config.getLocale();
    const source = sources[index]!;
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.aparteCardPart : undefined;
    body.replaceChildren();

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
        body.append(pager);
    }

    const url = webUrl(source);
    const title = source.title || sourceDomain(source) || source.url || '';
    if (url) {
        const link = document.createElement('a');
        link.className = 'aparte-citation-card__title';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.aparteCardPart = 'link';
        link.textContent = title;
        const hint = document.createElement('span');
        hint.className = 'aparte-sr-only';
        hint.textContent = ` ${locale.opensInNewTab ?? '(opens in a new tab)'}`;
        link.append(hint);
        body.append(link);
    } else {
        const plain = document.createElement('p');
        plain.className = 'aparte-citation-card__title';
        plain.textContent = title;
        body.append(plain);
    }
    const domain = sourceDomain(source);
    if (domain && domain !== title) {
        const p = document.createElement('p');
        p.className = 'aparte-citation-card__domain';
        p.textContent = domain;
        body.append(p);
    }
    if (source.snippet) {
        const p = document.createElement('p');
        p.className = 'aparte-citation-card__snippet';
        p.textContent = source.snippet;
        body.append(p);
    }
    if (sources.length > 1) {
        status.textContent = (locale.sourcePosition ?? 'Source {i} of {n}').replace('{i}', () => String(index + 1)).replace('{n}', () => String(sources.length));
    }
    if (focused) {
        // The control the reader was on, unless the page it turned to disabled it (the last
        // "next"): then the one that can still act, so the focus stays in the card.
        const back = el.querySelector<HTMLButtonElement | HTMLAnchorElement>(`[data-aparte-card-part="${focused}"]`); // safe-attr: one of this card's own part names
        if (back && !(back as HTMLButtonElement).disabled) back.focus();
        else (el.querySelector<HTMLElement>('.aparte-citation-card__pager button:not([disabled])') ?? el.querySelector<HTMLElement>('a'))?.focus();
    }
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
        // A source with no address is told apart by its title too: two calls both number theirs from `s1`.
        const key = s.url ?? `#${s.id}\u0001${s.title ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(s);
    }
    if (unique.length === 0) { list?.remove(); return; }
    const hintText = config.getLocale().opensInNewTab ?? '(opens in a new tab)';
    const key = [hintText, ...unique.map((s) => `${s.url ?? s.id}\u0001${s.title ?? ''}`)].join('\u0002');
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
    for (const s of unique) {
        const item = document.createElement('li');
        item.className = 'aparte-sources__item';
        const domain = sourceDomain(s);
        const title = s.title || domain || s.url || '';
        const url = webUrl(s);
        if (url) {
            const link = document.createElement('a');
            link.href = url;
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
