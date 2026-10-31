/**
 * @aparte/plugin-cards/link — a web page, previewed: its picture, its site, its title and
 * what it says it is about, the whole card one link to it.
 *
 *   import { setupLinkCard } from '@aparte/plugin-cards/link';
 *
 *   setupLinkCard({ tool: 'unfurl' });                               // one page's Open Graph, as it is
 *   setupLinkCard({ tool: 'web_search', map: (r) => r.items });      // search results
 *
 * One link, several (`[...]`), or `{ title, links: [...] }`. Three variants of one card:
 * `card` (the picture on top, the site, the title, the description), `compact` (one row: the
 * site's icon, the title, a small picture at the end) and `quote` (the block chat apps draw
 * under an unfurled link, with a coloured rule down its side). Your tool keeps its own
 * fields: `readLinks` reads Open Graph and Twitter keys, unfurlers' nested shapes and search
 * results (Google's Custom Search, SerpAPI, Brave, Tavily, Exa), and `map` says the rest.
 *
 * The card fetches nothing the tool's data does not name: no page, and no address of its
 * own making — no favicon service is asked, no icon guessed at `/favicon.ico`. A picture or an
 * icon the data names is loaded as given, wherever it is hosted (Brave's results name icons
 * on Brave's own proxy). A site without an icon in the data gets its initial on a tinted
 * square, and a page without a picture gets no picture.
 *
 * Every value is text. Search engines highlight the query in their snippets with markup
 * (Brave's `<strong>`): those tags are dropped and the usual entities decoded, and what is
 * left goes in as text — never parsed.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, webUrl, type Loose } from '../kit/dom.js';
import { formatNumber, toDate } from '../kit/format.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { CHAIN, PLAY, typeGlyph } from './icons.js';
import linkStyles from './link.css?raw';

export type LinkType = 'article' | 'video' | 'repo' | 'product' | 'website';
export type LinkVariant = 'card' | 'compact' | 'quote';

/**
 * A link as `map` returns it. Only `url` is needed; every other field adds a line when it is
 * there and nothing when it is not. `readLinks` also reads the usual aliases (listed on each
 * field).
 */
export interface LinkInput {
    /** An `http(s)` page. Also `link`, `href`, `og:url`. */
    url: string;
    /** Falls back to the page's host. Also `og:title`, `twitter:title`, `meta.title`, `name`. */
    title?: string;
    /** Also `og:description`, `snippet`, `summary`, `content`. */
    description?: string;
    /** Also `og:image`, `twitter:image`, `thumbnail`, `open_graph.images[0].url`, `pagemap.cse_image[0].src`. */
    image?: string;
    /** Falls back to the host without `www.`. Also `og:site_name`, `site`, `publisher`, `source`. */
    siteName?: string;
    /** The site's icon, loaded as given. Without it, the site's initial on a tinted square — no icon address is made up. Also `icon`, `logo`, Brave's `meta_url.favicon`. */
    favicon?: string;
    /** Also `byline`, `article:author`, `authors[0]`. */
    author?: string;
    /** An ISO date or an epoch. Also `datePublished`, `published_date`, `date`, `article:published_time`. */
    publishedAt?: string | number | Date;
    /** The badge it wears. Read from `og:type` and the host (GitHub → repo, YouTube → video) when absent. */
    type?: LinkType;
    /** A colour for the quote's side rule: `#rgb` or `#rrggbb`. Also `theme-color`. */
    themeColor?: string;
}

/** A link as the card draws it, once read. */
export interface Link {
    url: string;
    /** The page's host without `www.` — what stands in for a missing title or site name. */
    host: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
    favicon?: string;
    author?: string;
    publishedAt?: Date;
    type: LinkType;
    themeColor?: string;
}

/** The card's data: one link or several, and the collection's title. */
export interface LinkData {
    title?: string;
    links: Link[];
}

export type LinkCardOptions = CardSetupOptions<LinkData, LinkVariant>;

const L = {
    cardsLinkTitle: { en: 'Link', fr: 'Lien', de: 'Link', es: 'Enlace', it: 'Link', ja: 'リンク', ko: '링크', pt: 'Link', ru: 'Ссылка', zh: '链接' },
    cardsLinkCount: { en: '{n} links', fr: '{n} liens', de: '{n} Links', es: '{n} enlaces', it: '{n} link', ja: 'リンク{n}件', ko: '링크 {n}개', pt: '{n} links', ru: 'Ссылок: {n}', zh: '{n} 个链接' },
    cardsLinkArticle: { en: 'Article', fr: 'Article', de: 'Artikel', es: 'Artículo', it: 'Articolo', ja: '記事', ko: '기사', pt: 'Artigo', ru: 'Статья', zh: '文章' },
    cardsLinkVideo: { en: 'Video', fr: 'Vidéo', de: 'Video', es: 'Vídeo', it: 'Video', ja: '動画', ko: '동영상', pt: 'Vídeo', ru: 'Видео', zh: '视频' },
    cardsLinkRepo: { en: 'Repository', fr: 'Dépôt', de: 'Repository', es: 'Repositorio', it: 'Repository', ja: 'リポジトリ', ko: '저장소', pt: 'Repositório', ru: 'Репозиторий', zh: '代码仓库' },
    cardsLinkProduct: { en: 'Product', fr: 'Produit', de: 'Produkt', es: 'Producto', it: 'Prodotto', ja: '商品', ko: '상품', pt: 'Produto', ru: 'Товар', zh: '商品' },
} satisfies Record<string, CardWord>;

const TYPE_WORD = { article: 'cardsLinkArticle', video: 'cardsLinkVideo', repo: 'cardsLinkRepo', product: 'cardsLinkProduct' } as const;

/** The most links one card holds: a result page of fifty is a page, not a card. */
const MAX_LINKS = 10;
/** A description longer than this is cut before it reaches the page; the sheet clamps what is left to its lines. */
const MAX_DESCRIPTION = 400;
/** How many tints a site's initial can stand on: the sheet's six hues. */
const HUES = 6;

// ── Reading ──────────────────────────────────────────────────────────────────

type Bag = Loose;

const bag = (value: unknown): Bag | undefined =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Bag : undefined;

/** An address given as a string, as `{ url | src | href | secure_url }`, or as the first of a list of either. */
function linkOf(value: unknown): unknown {
    const first = Array.isArray(value) ? value[0] : value;
    const o = bag(first);
    return o ? o['url'] ?? o['src'] ?? o['href'] ?? o['secure_url'] ?? o['uri'] : first;
}

/**
 * A page or picture address: `http(s)`, protocol-relative, or a bare host ("example.com/x",
 * what a search result's `displayLink` is), read as `https`.
 */
function address(value: unknown, guessScheme = false): string | undefined {
    let s = str(linkOf(value));
    if (!s) return undefined;
    if (s.startsWith('//')) s = `https:${s}`;
    else if (!/^https?:\/\//i.test(s)) {
        if (!guessScheme || !/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return undefined;
        s = `https://${s}`;
    }
    return webUrl(s) ?? undefined;
}

/** A name given as a string, as `{ name }`, or as the first of a list of either. */
function textOf(value: unknown): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    const o = bag(first);
    return o ? str(o['name'] ?? o['title'] ?? o['text']) : str(first);
}

/**
 * A search engine's snippet as plain text: its highlighting tags dropped (Brave wraps the
 * query's words in `<strong>`, others in `<b>` or `<em>`), then the usual entities decoded —
 * in that order, so `&lt;b&gt;` comes out as the text `<b>`, not as a tag to drop. Only those
 * inline tags: a title that NAMES a tag ("Why <div> is not a button") keeps it. The result
 * still goes in as text.
 */
function plain(text: string | undefined): string | undefined {
    if (!text) return text;
    const entities: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&amp;': '&' };
    return text
        .replace(/<\/?(?:strong|b|em|i|mark)>/gi, '')
        .replace(/&(?:lt|gt|quot|#39|#x27|amp);/gi, (entity) => entities[entity.toLowerCase()]!)
        .trim() || undefined;
}

/** The first value under any of `keys`, in any of `sources`, in that order — source by source. */
function pick(sources: Array<Bag | undefined>, keys: string[]): unknown {
    for (const source of sources) {
        if (!source) continue;
        for (const key of keys) {
            const value = source[key];
            if (value !== undefined && value !== null && value !== '') return value;
        }
    }
    return undefined;
}

/** A publication date: a Date, an epoch, or a text with a year in it — "2 days ago" is no date. */
function dateOf(value: unknown): Date | undefined {
    if (value instanceof Date) return toDate(value) ?? undefined;
    const n = num(value);
    if (n !== undefined) return n >= 1e9 ? toDate(n) ?? undefined : undefined;
    const s = str(value);
    return s && /\d{4}/.test(s) ? toDate(s) ?? undefined : undefined;
}

const TYPE_RULES: Array<[Exclude<LinkType, 'website'>, RegExp]> = [
    ['video', /video|movie|episode|tv[_ .]?show|\bclip\b/],
    ['article', /article|blog|news|post|story/],
    ['repo', /repo|repository|code|software/],
    ['product', /product|offer/],
];

function typeOf(value: unknown, url: URL): LinkType {
    const s = str(value)?.toLowerCase();
    if (s) {
        for (const [type, rule] of TYPE_RULES) if (rule.test(s)) return type;
        if (s === 'website') return 'website';
    }
    const host = url.hostname.replace(/^(www|m)\./, '');
    const path = url.pathname.split('/').filter(Boolean);
    if (/^(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)$/.test(host) && path.length >= 2) return 'repo';
    if (host === 'youtu.be' || /(^|\.)(youtube\.com|vimeo\.com|twitch\.tv|dailymotion\.com)$/.test(host)) return 'video';
    return 'website';
}

function readLink(raw: unknown): Link | null {
    const r = bag(typeof raw === 'string' ? { url: raw } : raw);
    if (!r) return null;
    const og = bag(r['open_graph'] ?? r['openGraph'] ?? r['og']);
    const meta = bag(r['meta']);
    const twitter = bag(r['twitter_card'] ?? r['twitterCard'] ?? r['twitter']);
    const pagemap = bag(r['pagemap']);
    const tags = bag(Array.isArray(pagemap?.['metatags']) ? pagemap!['metatags'][0] : undefined);
    const sources = [r, og, meta, tags, twitter];

    const url = address(pick(sources, ['url', 'link', 'href', 'og:url', 'ogUrl', 'canonical', 'uri']))
        ?? address(r['displayLink'] ?? r['displayed_link'], true);
    if (!url) return null;
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    const imageCandidates = [
        r['image'], r['imageUrl'], r['image_url'], r['og:image'], r['ogImage'], og?.['image'], og?.['images'],
        r['twitter:image'], r['twitterImage'], twitter?.['image'], twitter?.['images'], r['thumbnail'], r['thumbnail_url'], r['thumbnailUrl'],
        tags?.['og:image'], tags?.['twitter:image'], pagemap?.['cse_image'], pagemap?.['cse_thumbnail'], meta?.['image'],
    ];
    const description = plain(str(pick(sources, ['description', 'snippet', 'summary', 'excerpt', 'og:description', 'ogDescription', 'twitter:description', 'twitterDescription', 'content', 'abstract']))
        ?.replace(/\s+/g, ' '));
    const color = str(pick([r, tags], ['themeColor', 'theme-color', 'theme_color', 'color']));
    return {
        url,
        host,
        title: plain(textOf(pick(sources, ['title', 'og:title', 'ogTitle', 'twitter:title', 'twitterTitle', 'headline', 'name']))),
        description: description && description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : description,
        image: imageCandidates.map((v) => address(v)).find(Boolean),
        siteName: textOf(pick(sources, ['siteName', 'site_name', 'og:site_name', 'ogSiteName', 'site', 'publisher', 'source', 'provider_name', 'providerName']) ?? r['profile']),
        favicon: [r['favicon'], r['icon'], r['logo'], r['faviconUrl'], r['favicon_url'], r['meta_url']?.['favicon'], r['profile']?.['img'], meta?.['favicon']]
            .map((v) => address(v)).find(Boolean),
        author: textOf(pick(sources, ['author', 'byline', 'article:author', 'creator', 'authors'])),
        publishedAt: dateOf(pick(sources, ['publishedAt', 'published_at', 'datePublished', 'published_date', 'publishedDate', 'article:published_time', 'publishedTime', 'date', 'pubDate', 'page_age', 'createdAt', 'created_at'])
            ?? og?.['article']?.['published_time']),
        type: typeOf(pick(sources, ['type', 'og:type', 'ogType', 'kind']), parsed),
        themeColor: color && /^#(?:[0-9a-f]{3}){1,2}$/i.test(color) ? color : undefined,
    };
}

/**
 * The card's data from what `map` returns: one link (an object, or its address), an array,
 * or a collection (`{ title?, links | results | items | organic_results | sources }`, and
 * Brave's `web.results`). At most ten; `null` when not one has an `http(s)` address.
 */
export function readLinks(raw: unknown): LinkData | null {
    const value = typeof raw === 'string' ? [raw] : raw;
    if (!value || typeof value !== 'object') return null;
    let title: string | undefined;
    let list: unknown[];
    if (Array.isArray(value)) {
        list = value;
    } else {
        const r = value as Bag;
        const nested = [r['links'], r['results'], r['items'], r['organic_results'], r['sources'], r['search_results'], r['web']?.['results']].find(Array.isArray);
        if (nested) {
            list = nested;
            title = str(r['title']);
        } else {
            list = [value];
        }
    }
    const links = list.map(readLink).filter((l): l is Link => l !== null).slice(0, MAX_LINKS);
    return links.length ? { ...(title ? { title } : {}), links } : null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const titleOf = (link: Link) => link.title ?? link.host;
const siteOf = (link: Link) => link.siteName ?? link.host;

/** A host's tint, the same every time it is drawn: a sum of its letters, folded onto the six. */
function hueOf(host: string): number {
    let sum = 0;
    for (const char of host) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
    return sum % HUES;
}

/** "Mar 3", or "Mar 3, 2024" when it is not this year — as the chat's language writes it. */
function publishedText(config: AparteConfig, date: Date, now = new Date()): string {
    return new Intl.DateTimeFormat(intlTag(config), {
        month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    }).format(date);
}

/** The middle dot between two facts on a line — drawn, not read. */
const dot = () => el('span', { class: 'aparte-link-preview__dot', attrs: { 'aria-hidden': 'true' }, text: '·' });

function joined(className: string, parts: Array<Node | null>): HTMLElement | null {
    const present = parts.filter((p): p is Node => p !== null);
    if (!present.length) return null;
    const line = el('span', { class: className });
    present.forEach((part, i) => {
        if (i) line.append(dot());
        line.append(part);
    });
    return line;
}

function dateNode(ctx: CardContext, link: Link): HTMLElement | null {
    if (!link.publishedAt) return null;
    const date = link.publishedAt;
    const node = el('time', { class: 'aparte-link-preview__date', attrs: { datetime: date.toISOString() } });
    ctx.bind(node, () => publishedText(ctx.config, date));
    return node;
}

/**
 * The site's mark: its own icon when the data gives one, over its initial on a tint — the
 * initial is what shows when there is no icon, or when the icon fails to load. Decoration:
 * the site's name is written beside it.
 */
function iconOf(link: Link, size: 'sm' | 'lg'): HTMLElement {
    const initial = Array.from(siteOf(link))[0]!.toUpperCase();
    const box = el('span', { class: `aparte-link-preview__icon aparte-link-preview__icon--${size}`, attrs: { 'aria-hidden': 'true', 'data-hue': hueOf(link.host) } },
        el('span', { class: 'aparte-link-preview__initial', text: initial }));
    if (link.favicon) {
        const img = el('img', { class: 'aparte-link-preview__favicon', attrs: { src: link.favicon, alt: '', loading: 'lazy', decoding: 'async' } });
        img.addEventListener('error', () => {
            img.remove();
            box.removeAttribute('data-favicon');
        }, { once: true });
        box.setAttribute('data-favicon', '');
        box.append(img);
    }
    return box;
}

/** The kind of page, as a glyph and a word — a plain website wears none. */
function typeBadge(ctx: CardContext, link: Link): HTMLElement | null {
    if (link.type === 'website') return null;
    const key = TYPE_WORD[link.type];
    const label = el('span', { class: 'aparte-link-preview__type-label' });
    ctx.word(label, key, L[key]);
    return el('span', { class: 'aparte-link-preview__type', attrs: { 'data-type': link.type } },
        glyph(typeGlyph(link.type), 'aparte-rich-card__glyph aparte-link-preview__type-glyph'), label);
}

/**
 * The title, as THE link: its `::after` is stretched over the whole card or row, so every
 * part of it opens the page and a reader hears one link, named by the title.
 */
function titleNode(link: Link): HTMLElement {
    return el('div', { class: 'aparte-link-preview__title' },
        el('a', { class: 'aparte-link-preview__anchor', attrs: { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, text: titleOf(link) }));
}

function descriptionOf(link: Link): HTMLElement | null {
    return link.description ? el('p', { class: 'aparte-link-preview__description', text: link.description }) : null;
}

/**
 * The page's picture, in a box of its own. Decoration — the title names the link — so its
 * alternative text is empty. A picture that fails to load takes its box with it: a preview
 * without a picture is a preview, a grey hole is not.
 */
function mediaOf(link: Link, className: string): HTMLElement | null {
    if (!link.image) return null;
    const box = el('div', { class: className, attrs: { 'data-loading': '' } });
    const img = el('img', { class: 'aparte-link-preview__img', attrs: { src: link.image, alt: '', loading: 'lazy', decoding: 'async' } });
    img.addEventListener('load', () => box.removeAttribute('data-loading'), { once: true });
    img.addEventListener('error', () => box.remove(), { once: true });
    box.append(img);
    return box;
}

/** `card`: the picture on top, the site line, the title, the description. */
function cardOf(ctx: CardContext, link: Link): HTMLElement {
    const media = mediaOf(link, 'aparte-link-preview__media');
    if (media && link.type === 'video') {
        media.append(el('span', { class: 'aparte-link-preview__play', attrs: { 'aria-hidden': 'true' } }, glyph(PLAY, 'aparte-rich-card__glyph aparte-link-preview__play-glyph')));
    }
    const site = el('div', { class: 'aparte-link-preview__site' }, iconOf(link, 'sm'),
        joined('aparte-link-preview__site-text', [
            el('span', { class: 'aparte-link-preview__site-name', text: siteOf(link) }),
            link.author ? el('span', { class: 'aparte-link-preview__author', text: link.author }) : null,
            dateNode(ctx, link),
        ]),
        typeBadge(ctx, link));
    const body = el('div', { class: 'aparte-link-preview__body' }, site, titleNode(link), descriptionOf(link));
    return el('article', { class: 'aparte-link-preview aparte-link-preview--card', attrs: { 'data-type': link.type } }, media, body);
}

/** `compact`: one row — the site's mark (with its kind in the corner), the title, the site, a small picture. */
function rowOf(ctx: CardContext, link: Link, tag: 'div' | 'li'): HTMLElement {
    const mark = el('span', { class: 'aparte-link-preview__mark' }, iconOf(link, 'lg'));
    if (link.type !== 'website') {
        const corner = el('span', { class: 'aparte-link-preview__corner', attrs: { role: 'img', 'data-type': link.type } },
            glyph(typeGlyph(link.type), 'aparte-rich-card__glyph aparte-link-preview__corner-glyph'));
        ctx.bind(corner, () => word(ctx.config, TYPE_WORD[link.type as keyof typeof TYPE_WORD], L[TYPE_WORD[link.type as keyof typeof TYPE_WORD]]), 'aria-label');
        mark.append(corner);
    }
    const meta = joined('aparte-link-preview__meta', [el('span', { class: 'aparte-link-preview__site-name', text: siteOf(link) }), dateNode(ctx, link)]);
    const text = el('div', { class: 'aparte-link-preview__text' }, titleNode(link), meta);
    return el(tag, { class: 'aparte-link-preview aparte-link-preview--row', attrs: { 'data-type': link.type } }, mark, text, mediaOf(link, 'aparte-link-preview__thumb'));
}

/** `quote`: the block a chat app draws under an unfurled link — a coloured rule, the site, the title, the words, the picture beside. */
function quoteOf(ctx: CardContext, link: Link, tag: 'div' | 'li'): HTMLElement {
    const site = el('div', { class: 'aparte-link-preview__site' }, iconOf(link, 'sm'),
        el('span', { class: 'aparte-link-preview__site-name', text: siteOf(link) }), typeBadge(ctx, link));
    const byline = joined('aparte-link-preview__byline', [link.author ? el('span', { class: 'aparte-link-preview__author', text: link.author }) : null, dateNode(ctx, link)]);
    const text = el('div', { class: 'aparte-link-preview__quote-text' }, site, titleNode(link), descriptionOf(link), byline);
    const node = el(tag, { class: 'aparte-link-preview aparte-link-preview--quote', attrs: { 'data-type': link.type, 'data-hue': hueOf(link.host) } },
        text, mediaOf(link, 'aparte-link-preview__quote-media'));
    // A colour the reader checked (#rgb, #rrggbb), set as a property — never a style string.
    if (link.themeColor) node.style.setProperty('--aparte-link-preview-accent', link.themeColor);
    return node;
}

function countLabel(config: AparteConfig, data: Partial<LinkData>): string {
    return data.title ?? word(config, 'cardsLinkCount', L.cardsLinkCount, { n: formatNumber(config, data.links?.length ?? 0) });
}

function headingOf(ctx: CardContext, data: LinkData): HTMLElement {
    const text = el('span', { class: 'aparte-link-preview__heading-text' });
    ctx.bind(text, () => countLabel(ctx.config, data));
    return el('div', { class: 'aparte-link-preview__heading' }, glyph(CHAIN, 'aparte-rich-card__glyph aparte-link-preview__heading-glyph'), text);
}

function render(data: LinkData, ctx: CardContext<LinkVariant>): Node[] {
    const [first] = data.links as [Link];
    if (data.links.length === 1) {
        if (ctx.variant === 'compact') return [rowOf(ctx, first, 'div')];
        if (ctx.variant === 'quote') return [quoteOf(ctx, first, 'div')];
        return [cardOf(ctx, first)];
    }
    if (ctx.variant === 'quote') {
        const stack = el('ul', { class: 'aparte-link-preview__stack' }, ...data.links.map((l) => quoteOf(ctx, l, 'li')));
        ctx.bind(stack, () => countLabel(ctx.config, data), 'aria-label');
        return [stack];
    }
    // Several cards would be a wall of pictures in a chat: several links are rows, stacked,
    // in `card` as in `compact`.
    const list = el('ul', { class: 'aparte-link-preview__list' }, ...data.links.map((l) => rowOf(ctx, l, 'li')));
    ctx.bind(list, () => countLabel(ctx.config, data), 'aria-label');
    return [headingOf(ctx, data), list];
}

function skeleton(partial: Partial<LinkData> | null, ctx: CardContext<LinkVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const known = partial?.links?.[0];
    const title = known?.title ?? partial?.title;
    const titleLine = title ? el('div', { class: 'aparte-link-preview__title', text: title }) : block('aparte-link-preview__sk-title', 'text');
    const siteLine = el('div', { class: 'aparte-link-preview__site' }, block('aparte-link-preview__sk-icon'),
        known ? el('span', { class: 'aparte-link-preview__site-name', text: siteOf(known) }) : block('aparte-link-preview__sk-site', 'text'));
    if (ctx.variant === 'compact') {
        return [el('div', { class: 'aparte-link-preview aparte-link-preview--row' }, block('aparte-link-preview__sk-mark'),
            el('div', { class: 'aparte-link-preview__text' }, titleLine, known ? el('span', { class: 'aparte-link-preview__meta', text: siteOf(known) }) : block('aparte-link-preview__sk-site', 'text')))];
    }
    const lines = [block('aparte-link-preview__sk-line', 'text'), block('aparte-link-preview__sk-line aparte-link-preview__sk-line--short', 'text')];
    if (ctx.variant === 'quote') {
        return [el('div', { class: 'aparte-link-preview aparte-link-preview--quote' }, el('div', { class: 'aparte-link-preview__quote-text' }, siteLine, titleLine, ...lines))];
    }
    return [el('article', { class: 'aparte-link-preview aparte-link-preview--card' }, block('aparte-link-preview__media aparte-link-preview__sk-media'),
        el('div', { class: 'aparte-link-preview__body' }, siteLine, titleLine, ...lines))];
}

function label(data: Partial<LinkData> | null, ctx: CardContext): string {
    const links = data?.links ?? [];
    if (links.length === 1) return titleOf(links[0]!);
    if (links.length > 1) return countLabel(ctx.config, data!);
    return data?.title ?? word(ctx.config, 'cardsLinkTitle', L.cardsLinkTitle);
}

/** One line a link: "Title — Site (https://…)". */
function fallback(data: LinkData): string {
    const lines = data.links.map((l) => `${titleOf(l)} — ${siteOf(l)} (${l.url})`);
    return data.title ? `${data.title}:\n${lines.join('\n')}` : lines.join('\n');
}

/** What a running call already says: the page it unfurls, else what it searches for. */
function partial(input: Record<string, unknown>): Partial<LinkData> | null {
    const one = readLink({ url: input['url'] ?? input['link'] ?? input['href'] });
    if (one) return { links: [one] };
    const query = str(input['query'] ?? input['q'] ?? input['search'] ?? input['title']);
    return query ? { title: query } : null;
}

/** The link card — for `linkCard.segment(data)`. Plug it in with `setupLinkCard`. */
export const linkCard = defineCard<LinkData, LinkVariant>({
    name: 'link',
    variants: ['card', 'compact', 'quote'],
    styles: linkStyles,
    icon: CHAIN,
    normalize: readLinks,
    render,
    skeleton,
    label,
    fallback,
    partial,
});

/** Draw a tool's links as this card — returns the function that stops it. */
export function setupLinkCard(options: LinkCardOptions = {}): () => void {
    return linkCard.setup(options);
}
