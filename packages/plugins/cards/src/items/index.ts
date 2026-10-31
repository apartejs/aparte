/**
 * @aparte/plugin-cards/items — a tool's list of things, drawn as cards.
 *
 *   import { setupItemsCard } from '@aparte/plugin-cards/items';
 *
 *   setupItemsCard({
 *     tool: 'search_articles',
 *     map: (result) => ({
 *       title: `Articles on ${result.query}`,
 *       items: result.hits.map((h) => ({ title: h.headline, subtitle: h.source, image: h.thumbnail, url: h.link })),
 *     }),
 *   });
 *
 * The generic card: anything with a title — an article, a recipe, a listing, a course.
 * Each item may add a picture, a badge over it, a few lines of detail and up to two
 * buttons; the whole tile opens its `url`. Three variants of one card: `carousel` (tiles
 * in a row that scrolls sideways), `grid` (two columns of tiles) and `list` (rows, a
 * thumbnail at the start). One item, in any variant, is one card at full width.
 *
 * The numbers come from what the chat UIs that ship this card settled on: three to eight
 * items in a carousel (ten at most here), one picture each, three lines of detail and two
 * buttons at most per item, a title of about eighty characters.
 */
import type { AparteConfig } from '@aparte/core';
import { carousel } from '../kit/carousel.js';
import { defineCard, type CardAction, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, safeUrl, str, webUrl } from '../kit/dom.js';
import { formatNumber } from '../kit/format.js';
import { intlTag, languageOf, word, type CardWord } from '../kit/strings.js';
import { IMAGE_ICON, ITEMS_ICON } from './icons.js';
import itemsStyles from './items.css?raw';

export type ItemsVariant = 'carousel' | 'grid' | 'list';

/** A picture: its address (`http(s)` only) and what it shows. */
export interface ItemImage {
    src: string;
    /** What the picture shows. Leave it out when the title already says it: the picture is then decorative. */
    alt?: string;
}

/** One item, as `map` returns it. Only `title` is needed. */
export interface ItemInput {
    title: string;
    subtitle?: string;
    /** A few sentences; the card shows three lines of it. */
    description?: string;
    /** A URL, or `{ src, alt }`. Anything but `http(s)` draws the placeholder instead. */
    image?: string | ItemImage;
    /** A short word over the picture's corner: "New", "−20 %", "4.8 ★". */
    badge?: string;
    /** Up to three short lines: a date, a price, a distance. */
    meta?: string[];
    /** What the whole tile opens, in a new tab. Anything but `http(s)`, `mailto` or `tel` makes no link. */
    url?: string;
    /**
     * Up to two buttons, each a link (`http(s)`) or an `id`; the `aparte-card-action` event
     * carries the item as its `data`. A `send` is dropped: a result never writes the person's
     * next message — send one from your listener, or the card's `actions`.
     */
    actions?: CardAction[];
    /** Your own key for the item, handed back with its actions. */
    id?: string;
}

/** What `map` returns: the items, with a title above them — or one item, or a bare array. */
export interface ItemsInput {
    title?: string;
    items: ItemInput[];
}

/** One item, once read. */
export interface Item {
    title: string;
    subtitle?: string;
    description?: string;
    image?: { src: string; alt: string };
    badge?: string;
    meta: string[];
    url?: string;
    actions: CardAction[];
    id?: string;
}

/** The data as the card draws it, once read. */
export interface ItemsData {
    title?: string;
    items: Item[];
}

const W = {
    cardsItemsTitle: { en: 'Results', fr: 'Résultats', de: 'Ergebnisse', es: 'Resultados', it: 'Risultati', ja: '結果', ko: '결과', pt: 'Resultados', ru: 'Результаты', zh: '结果' },
    // Russian counts with a colon so one form serves every number, as the kit's reviews do.
    cardsItemsCount: { en: '{n} items', fr: '{n} éléments', de: '{n} Einträge', es: '{n} elementos', it: '{n} elementi', ja: '{n}件', ko: '{n}개 항목', pt: '{n} itens', ru: 'Элементов: {n}', zh: '{n} 项' },
    cardsItemsNewTab: { en: 'opens in a new tab', fr: 's’ouvre dans un nouvel onglet', de: 'öffnet in einem neuen Tab', es: 'se abre en una pestaña nueva', it: 'si apre in una nuova scheda', ja: '新しいタブで開きます', ko: '새 탭에서 열림', pt: 'abre em uma nova aba', ru: 'откроется в новой вкладке', zh: '在新标签页中打开' },
} satisfies Record<string, CardWord>;

/** The most items drawn: a carousel past ten is a search page, not an answer. */
export const ITEMS_MAX = 10;
const META_MAX = 3;
const ACTIONS_MAX = 2;

// ── Reading ──────────────────────────────────────────────────────────────────

function readImage(value: unknown, alt: unknown): Item['image'] {
    let src: unknown = value;
    let text: unknown = alt;
    if (value && typeof value === 'object') {
        const o = value as Record<string, unknown>;
        src = o['src'] ?? o['url'];
        text = o['alt'] ?? alt;
    }
    // An absolute `http(s)` address only: a relative one would be fetched from the app's own origin.
    const url = webUrl(src);
    return url ? { src: url, alt: str(text) ?? '' } : undefined;
}

/**
 * An action the card can run: a label, and a web link (`http(s)`) or an `id` the app's
 * `aparte-card-action` listener handles. Never a `send`: the item is the tool's result — a
 * search hit, a page, a feed — and a button that posts its text as the person's next message
 * lets that text speak for them, a lever for prompt injection. The message is the app's to
 * write, in its listener (the item comes as `data`) or the card's `actions` option.
 */
function readAction(value: unknown): CardAction | null {
    if (!value || typeof value !== 'object') return null;
    const o = value as Record<string, unknown>;
    const label = str(o['label']);
    if (!label) return null;
    const action: CardAction = { label };
    if (o['url'] !== undefined) {
        const url = webUrl(o['url']);
        if (!url) return null;
        action.url = url;
    }
    if (typeof o['id'] === 'string') action.id = o['id'];
    if (o['primary'] === true) action.primary = true;
    return action.url || action.id !== undefined ? action : null;
}

function readItem(raw: unknown): Item | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const title = str(r['title'] ?? r['name']);
    if (!title) return null;
    const meta = (Array.isArray(r['meta']) ? r['meta'] : r['meta'] !== undefined ? [r['meta']] : [])
        .map(str)
        .filter((m): m is string => m !== undefined)
        .slice(0, META_MAX);
    const actions = (Array.isArray(r['actions']) ? r['actions'] : [])
        .map(readAction)
        .filter((a): a is CardAction => a !== null)
        .slice(0, ACTIONS_MAX);
    const url = safeUrl(r['url'] ?? r['link'] ?? r['href']);
    return {
        title,
        subtitle: str(r['subtitle']),
        description: str(r['description'] ?? r['snippet'] ?? r['summary']),
        image: readImage(r['image'] ?? r['imageUrl'] ?? r['image_url'] ?? r['thumbnail'], r['alt'] ?? r['imageAlt']),
        badge: str(r['badge']),
        meta,
        ...(url ? { url } : {}),
        actions,
        id: str(r['id']),
    };
}

/**
 * The card's data from what `map` returns — `{ title?, items }`, a bare array, or one
 * item — or `null` when no item has a title. Ten items at most.
 */
export function readItems(raw: unknown): ItemsData | null {
    let list: unknown[];
    let title: string | undefined;
    if (Array.isArray(raw)) {
        list = raw;
    } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['items'])) {
        const r = raw as Record<string, unknown>;
        list = r['items'] as unknown[];
        title = str(r['title']);
    } else {
        list = [raw];
    }
    const items = list.map(readItem).filter((i): i is Item => i !== null).slice(0, ITEMS_MAX);
    return items.length ? { ...(title ? { title } : {}), items } : null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function countText(config: AparteConfig, n: number): string {
    return word(config, 'cardsItemsCount', W.cardsItemsCount, { n: formatNumber(config, n) });
}

/** The card's name: its title, the one item's, or how many there are. */
function labelOf(data: Partial<ItemsData> | null, config: AparteConfig): string {
    if (data?.title) return data.title;
    const items = data?.items ?? [];
    if (items.length === 1) return items[0]!.title;
    if (items.length > 1) return countText(config, items.length);
    return word(config, 'cardsItemsTitle', W.cardsItemsTitle);
}

/**
 * The picture in a fixed box, the placeholder underneath it. When the picture fails to
 * load it is taken out and the placeholder shows — the box keeps its size either way, so
 * nothing below it moves.
 */
function media(item: Item, badge: boolean): HTMLElement {
    const box = el('div', { class: 'aparte-items__media', attrs: { 'data-empty': !item.image } },
        glyph(IMAGE_ICON, 'aparte-rich-card__glyph aparte-items__placeholder'));
    if (item.image) {
        const img = el('img', {
            class: 'aparte-items__image',
            attrs: {
                src: item.image.src,
                alt: item.image.alt,
                loading: 'lazy',
                decoding: 'async',
                // A third-party picture learns nothing of the page that shows it.
                referrerpolicy: 'no-referrer',
            },
        });
        img.addEventListener('error', () => {
            img.remove();
            box.setAttribute('data-empty', '');
        }, { once: true });
        box.append(img);
    }
    if (badge && item.badge) box.append(badgeOf(item.badge, 'aparte-badge--solid'));
    return box;
}

function badgeOf(text: string, fill: string): HTMLElement {
    return el('span', { class: `aparte-badge aparte-badge--primary ${fill} aparte-badge--sm aparte-items__badge`, text });
}

/**
 * The title, and the link when there is one. The link is the title alone — its name is
 * the title — and the sheet stretches its hit area over the whole tile, so the tile opens
 * it without wrapping the buttons inside a link, which HTML forbids.
 */
function titleOf(ctx: CardContext, item: Item): HTMLElement {
    if (!item.url) return el('span', { class: 'aparte-items__title', text: item.title });
    const hint = el('span', { class: 'aparte-sr-only' });
    ctx.bind(hint, () => ` (${word(ctx.config, 'cardsItemsNewTab', W.cardsItemsNewTab)})`);
    return el('a', {
        class: 'aparte-items__title aparte-items__link',
        attrs: { href: item.url, target: '_blank', rel: 'noopener noreferrer' },
    }, item.title, hint);
}

function details(item: Item): Array<HTMLElement | null> {
    return [
        item.subtitle ? el('span', { class: 'aparte-items__subtitle', text: item.subtitle }) : null,
        item.description ? el('p', { class: 'aparte-items__description', text: item.description }) : null,
        item.meta.length
            ? el('ul', { class: 'aparte-items__meta', attrs: { role: 'list' } }, ...item.meta.map((m) => el('li', { text: m })))
            : null,
    ];
}

function actionsOf(ctx: CardContext, item: Item, max: number): HTMLElement | null {
    const buttons = item.actions
        .map((action) => ctx.action(action, item, 'aparte-items__action'))
        .filter((b): b is HTMLButtonElement => b !== null)
        .slice(0, max);
    return buttons.length ? el('div', { class: 'aparte-items__actions' }, ...buttons) : null;
}

/** A tile: the picture on top, its badge in the corner, the text, the buttons at the foot. */
function tile(ctx: CardContext, item: Item): HTMLElement {
    const body = el('div', { class: 'aparte-items__body' }, titleOf(ctx, item), ...details(item));
    return el('article', { class: 'aparte-items__item aparte-items__tile', attrs: { 'data-link': !!item.url } },
        media(item, true), body, actionsOf(ctx, item, ACTIONS_MAX));
}

/**
 * A row: a square thumbnail at the start, the text, one button at the end. A list where no
 * item has a picture draws no thumbnail column at all — a column of placeholders is noise.
 */
function row(ctx: CardContext, item: Item, pictures: boolean): HTMLElement {
    const head = el('div', { class: 'aparte-items__title-line' }, titleOf(ctx, item), item.badge ? badgeOf(item.badge, 'aparte-badge--soft') : null);
    const body = el('div', { class: 'aparte-items__body' }, head, ...details(item));
    return el('article', { class: 'aparte-items__item aparte-items__row', attrs: { 'data-link': !!item.url, 'data-bare': !pictures } },
        pictures ? media(item, false) : null, body, actionsOf(ctx, item, 1));
}

function header(ctx: CardContext, title: string | undefined, count: number): HTMLElement | null {
    if (!title) return null;
    const head = el('div', { class: 'aparte-items__header' }, el('span', { class: 'aparte-items__heading', text: title }));
    if (count > 1) {
        const n = el('span', { class: 'aparte-items__count' });
        ctx.bind(n, () => countText(ctx.config, count));
        head.append(n);
    }
    return head;
}

function list(ctx: CardContext, data: ItemsData, draw: (ctx: CardContext, item: Item) => HTMLElement, className: string): HTMLElement {
    const ul = el('ul', { class: `aparte-items__list ${className}`, attrs: { role: 'list' } },
        ...data.items.map((item) => el('li', { class: 'aparte-items__entry' }, draw(ctx, item))));
    ctx.bind(ul, () => labelOf(data, ctx.config), 'aria-label');
    return ul;
}

function render(data: ItemsData, ctx: CardContext<ItemsVariant>): Node[] {
    const count = data.items.length;
    const root = el('div', { class: 'aparte-items', attrs: { 'data-count': count } }, header(ctx, data.title, count));
    if (ctx.variant === 'list') {
        const pictures = data.items.some((item) => item.image);
        root.append(list(ctx, data, (c, item) => row(c, item, pictures), 'aparte-items__rows'));
    } else if (count === 1) {
        // One item is one card: no carousel chrome, no grid of one.
        root.append(tile(ctx, data.items[0]!));
    } else if (ctx.variant === 'grid') {
        root.append(list(ctx, data, tile, 'aparte-items__grid'));
    } else {
        root.append(carousel(ctx, data.items.map((item) => tile(ctx, item)), { label: () => labelOf(data, ctx.config) }));
    }
    return [root];
}

/** Three tiles (two in a grid's row, three rows in a list) in the shape the result will take. */
function skeleton(partial: Partial<ItemsData> | null, ctx: CardContext<ItemsVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const text = () => el('div', { class: 'aparte-items__body' }, block('aparte-items__sk-title', 'text'), block('aparte-items__sk-line', 'text'));
    const root = el('div', { class: 'aparte-items' }, header(ctx, partial?.title, 0));
    const shapes = ctx.variant === 'list'
        ? [0, 1, 2].map(() => el('div', { class: 'aparte-items__item aparte-items__row' }, block('aparte-items__sk-media'), text()))
        : Array.from({ length: ctx.variant === 'grid' ? 2 : 3 }, () =>
            el('div', { class: 'aparte-items__item aparte-items__tile' }, block('aparte-items__sk-media'), text()));
    root.append(el('div', { class: `aparte-items__skeleton aparte-items__skeleton--${ctx.variant}`, attrs: { 'aria-hidden': 'true' } }, ...shapes));
    return [root];
}

/** One sentence: the title, then the items' titles as the language lists them. */
function fallback(data: ItemsData, ctx: CardContext<ItemsVariant>): string {
    const titles = data.items.map((i) => i.title);
    let joined: string;
    try {
        // The language the words are in: with no tag they read English, and so does the "and".
        joined = new Intl.ListFormat(intlTag(ctx.config) ?? languageOf(ctx.config), { type: 'conjunction' }).format(titles);
    } catch {
        joined = titles.join(', ');
    }
    return `${data.title ?? word(ctx.config, 'cardsItemsTitle', W.cardsItemsTitle)}: ${joined}.`;
}

export const itemsCard = defineCard<ItemsData, ItemsVariant>({
    name: 'items',
    variants: ['carousel', 'list', 'grid'],
    styles: itemsStyles,
    icon: ITEMS_ICON,
    normalize: readItems,
    render,
    skeleton,
    label: (data, ctx) => labelOf(data, ctx.config),
    fallback,
    partial: (input) => {
        const title = str(input['title'] ?? input['query'] ?? input['q']);
        return title ? { title } : null;
    },
});

/** Draw a tool's list of things as this card — returns the function that stops it. */
export function setupItemsCard(options: CardSetupOptions<ItemsData, ItemsVariant> = {}): () => void {
    return itemsCard.setup(options);
}
