/**
 * @aparte/plugin-cards/product — a tool's products, drawn as cards.
 *
 *   import { setupProductCard } from '@aparte/plugin-cards/product';
 *
 *   setupProductCard({
 *     tool: 'search_products',
 *     map: (result) => ({ title: result.query, products: result.items }),
 *   });
 *
 * Three variants of one card: `card` (a tile — the photo, the shop, the name, the stars,
 * the price; several products are a row of tiles that scrolls), `compact` (a row per
 * product, to scan) and `detail` (one product at length, the others in a small row under
 * it). Your tool keeps its own fields: `readProducts` already reads the usual spellings —
 * `name` or `title`, a price as `49.9`, `"49.90"` or `"49,90 € TTC"`, schema.org's `offers`
 * and `aggregateRating`, a Google Shopping result's `extracted_price` and `source`, a Shopify
 * product from the Admin API (`variants`, `body_html`) or the Storefront API (`priceRange`,
 * `onlineStoreUrl`) — and `map` covers the rest.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardAction, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, webUrl } from '../kit/dom.js';
import { carousel } from '../kit/carousel.js';
import { currencyCode, formatNumber, formatPercent, formatPrice, readPriceText } from '../kit/format.js';
import { rating } from '../kit/rating.js';
import { word, type CardWord } from '../kit/strings.js';
import { BAG, SEARCH, TAG, TRUCK } from './icons.js';
import productStyles from './product.css?raw';

export type ProductVariant = 'card' | 'compact' | 'detail';

/** Where a product stands; anything else a tool writes is shown as it wrote it. */
export type ProductAvailability = 'in-stock' | 'low-stock' | 'out-of-stock' | 'preorder';

/**
 * One product as `map` returns it. Only `title` is needed; every other field adds a line
 * when it is there and nothing when it is not.
 */
export interface ProductInput {
    title: string;
    /** An `http(s)` URL, or `{ src, alt }`. Anything else is no photo. */
    image?: string | { src: string; alt?: string };
    /** `49.9`, or a string a shop writes: `"49.90"`, `"$49.90"`, `"49,90 €"`. */
    price?: number | string;
    /** An ISO 4217 code (`EUR`) or a usual symbol (`€`). */
    currency?: string;
    /** The price before the sale: struck through, and the discount computed from it. */
    compareAtPrice?: number | string;
    /** 0–5. */
    rating?: number;
    reviewCount?: number;
    availability?: ProductAvailability | string;
    merchant?: string;
    /** The shop's logo, small, before its name. */
    merchantLogo?: string;
    /** A word over the photo: "Bestseller", "New". */
    badge?: string;
    /** Sizes, colours: drawn as chips in `detail`. */
    options?: string[];
    /** A line of your own ("Delivered tomorrow"), or a cost — `0` reads "Free delivery". */
    shipping?: string | number;
    /** A few lines, in `detail`. Tags are stripped: it is shown as text. */
    description?: string;
    /** Where the product's name and photo link to; `http(s)` only. */
    url?: string;
    /** Your own id, handed back with the product in `aparte-card-action`. */
    id?: string;
    /**
     * At most two buttons per product, each a link (`http(s)`) or an `id`, reporting the
     * product as its `data`. A `send` is dropped: a result never writes the person's next
     * message — send one from your `aparte-card-action` listener, or the card's `actions`.
     */
    actions?: CardAction[];
}

/** What `map` returns: one product, a list, or a list with a heading. */
export type ProductsInput = ProductInput | ProductInput[] | { title?: string; products: ProductInput[] };

/** One product as the card draws it, once read. */
export interface Product {
    id?: string;
    title: string;
    image?: { src: string; alt?: string };
    price?: number;
    /** An ISO 4217 code. */
    currency?: string;
    /** Kept only when it is above `price`: a "was" price lower than the price is no sale. */
    compareAtPrice?: number;
    rating?: number;
    reviewCount?: number;
    /** One of the four, or the tool's own words. */
    availability?: { status: ProductAvailability } | { text: string };
    merchant?: string;
    merchantLogo?: string;
    badge?: string;
    options: string[];
    shipping?: { text: string } | { cost: number };
    description?: string;
    url?: string;
    actions: CardAction[];
}

/** The data as the card draws it. */
export interface ProductData {
    /** The heading over several products ("Trail shoes under €100"). */
    title?: string;
    products: Product[];
}

const P = {
    cardsProductTitle: { en: 'Products', fr: 'Produits', de: 'Produkte', es: 'Productos', it: 'Prodotti', ja: '商品', ko: '상품', pt: 'Produtos', ru: 'Товары', zh: '商品' },
    cardsProductCount: { en: '{n} products', fr: '{n} produits', de: '{n} Produkte', es: '{n} productos', it: '{n} prodotti', ja: '{n}件の商品', ko: '상품 {n}개', pt: '{n} produtos', ru: 'Товаров: {n}', zh: '{n} 件商品' },
    cardsProductInStock: { en: 'In stock', fr: 'En stock', de: 'Auf Lager', es: 'En stock', it: 'Disponibile', ja: '在庫あり', ko: '재고 있음', pt: 'Em estoque', ru: 'В наличии', zh: '有货' },
    cardsProductLowStock: { en: 'Only a few left', fr: 'Plus que quelques-uns', de: 'Nur noch wenige', es: 'Quedan pocas unidades', it: 'Ultimi pezzi', ja: '残りわずか', ko: '품절 임박', pt: 'Últimas unidades', ru: 'Осталось мало', zh: '仅剩少量' },
    cardsProductOutOfStock: { en: 'Out of stock', fr: 'Rupture de stock', de: 'Ausverkauft', es: 'Agotado', it: 'Esaurito', ja: '在庫切れ', ko: '품절', pt: 'Esgotado', ru: 'Нет в наличии', zh: '缺货' },
    cardsProductPreorder: { en: 'Pre-order', fr: 'Précommande', de: 'Vorbestellbar', es: 'Preventa', it: 'Preordine', ja: '予約受付中', ko: '예약 판매', pt: 'Pré-venda', ru: 'Предзаказ', zh: '预售' },
    cardsProductWas: { en: 'Was', fr: 'Au lieu de', de: 'Statt', es: 'Antes', it: 'Prima', ja: '通常価格', ko: '정가', pt: 'De', ru: 'Было', zh: '原价' },
    cardsProductFreeShipping: { en: 'Free delivery', fr: 'Livraison gratuite', de: 'Kostenloser Versand', es: 'Envío gratis', it: 'Spedizione gratuita', ja: '送料無料', ko: '무료 배송', pt: 'Frete grátis', ru: 'Бесплатная доставка', zh: '免运费' },
    cardsProductShippingCost: { en: '{price} delivery', fr: 'Livraison {price}', de: 'Versand {price}', es: 'Envío {price}', it: 'Spedizione {price}', ja: '送料 {price}', ko: '배송비 {price}', pt: 'Frete {price}', ru: 'Доставка {price}', zh: '运费 {price}' },
    cardsProductOptions: { en: 'Options', fr: 'Options', de: 'Optionen', es: 'Opciones', it: 'Opzioni', ja: 'オプション', ko: '옵션', pt: 'Opções', ru: 'Варианты', zh: '可选项' },
    cardsProductMoreOptions: { en: '{n} more', fr: '{n} de plus', de: '{n} weitere', es: '{n} más', it: 'altri {n}', ja: 'ほか{n}件', ko: '{n}개 더', pt: 'mais {n}', ru: 'ещё {n}', zh: '还有 {n} 个' },
    cardsProductMore: { en: 'More options', fr: 'Autres choix', de: 'Weitere Angebote', es: 'Más opciones', it: 'Altre proposte', ja: 'その他の候補', ko: '다른 상품', pt: 'Mais opções', ru: 'Другие варианты', zh: '更多选择' },
} satisfies Record<string, CardWord>;

const STOCK_WORD: Record<ProductAvailability, keyof typeof P> = {
    'in-stock': 'cardsProductInStock',
    'low-stock': 'cardsProductLowStock',
    'out-of-stock': 'cardsProductOutOfStock',
    preorder: 'cardsProductPreorder',
};

/** Ten: past that a row of tiles is a catalogue, not an answer (3–8 is the comfortable range). */
const PRODUCTS_SHOWN = 10;
const OPTIONS_SHOWN = 6;
const ACTIONS_PER_PRODUCT = 2;

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);

/** The first of `keys` that `r` has a value for. */
function pick(r: Raw | undefined, keys: readonly string[]): unknown {
    if (!r) return undefined;
    for (const key of keys) if (r[key] !== undefined && r[key] !== null) return r[key];
    return undefined;
}

/** A list from an array or a GraphQL connection (`{ nodes }`, `{ edges }`) — Shopify's Storefront API returns the latter. */
function listOf(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!isObject(value)) return [];
    if (Array.isArray(value['nodes'])) return value['nodes'];
    if (Array.isArray(value['edges'])) return value['edges'].map((e) => (isObject(e) ? e['node'] : undefined));
    return [];
}

/** An amount and its currency, from a number, a shop's text, or `{ amount, currencyCode }`. */
function readMoney(value: unknown): { amount?: number; currency?: string } {
    if (typeof value === 'number') return { amount: Number.isFinite(value) && value >= 0 ? value : undefined };
    if (typeof value === 'string') {
        // A price is not negative: a minus in a shop's text is not this price's.
        const { amount, currency } = readPriceText(value);
        return { amount: amount === undefined ? undefined : Math.abs(amount), currency };
    }
    if (isObject(value)) {
        return {
            amount: readMoney(pick(value, ['amount', 'value', 'price'])).amount,
            currency: currencyCode(pick(value, ['currencyCode', 'currency_code', 'currency'])),
        };
    }
    return {};
}

function readImage(value: unknown): Product['image'] {
    if (Array.isArray(value)) {
        for (const item of value) {
            const image = readImage(item);
            if (image) return image;
        }
        return undefined;
    }
    if (isObject(value)) {
        // schema.org's ImageObject keeps its address in `contentUrl`.
        const src = webUrl(pick(value, ['src', 'url', 'contentUrl', 'href', 'large', 'medium', 'thumbnail']));
        const alt = str(pick(value, ['alt', 'altText', 'alt_text']));
        return src ? { src, ...(alt ? { alt } : {}) } : undefined;
    }
    const src = webUrl(value);
    return src ? { src } : undefined;
}

/** schema.org's ItemAvailability names and the usual shop words, squeezed to letters. */
const AVAILABILITY: Record<string, ProductAvailability> = {
    instock: 'in-stock', available: 'in-stock', instoreonly: 'in-stock', onlineonly: 'in-stock',
    lowstock: 'low-stock', limitedavailability: 'low-stock', fewleft: 'low-stock',
    outofstock: 'out-of-stock', soldout: 'out-of-stock', unavailable: 'out-of-stock', discontinued: 'out-of-stock',
    preorder: 'preorder', presale: 'preorder', backorder: 'preorder',
};

function readAvailability(r: Raw, offer: Raw | undefined): Product['availability'] {
    const value = pick(r, ['availability', 'stockStatus', 'stock_status']) ?? pick(offer, ['availability']);
    if (typeof value === 'string' && value.trim()) {
        // `https://schema.org/InStock`, `schema:InStock` (a JSON-LD prefix), `InStock`: one key.
        const key = value.trim().toLowerCase().replace(/^(?:https?:\/\/schema\.org\/|schema:)/, '').replace(/[^a-z]/g, '');
        const status = AVAILABILITY[key];
        return status ? { status } : { text: value.trim() };
    }
    const flag = typeof value === 'boolean' ? value : pick(r, ['inStock', 'in_stock', 'available']);
    if (typeof flag === 'boolean') return { status: flag ? 'in-stock' : 'out-of-stock' };
    return undefined;
}

function readRating(r: Raw): { rating?: number; reviewCount?: number } {
    const aggregate = isObject(r['aggregateRating']) ? r['aggregateRating'] : undefined;
    let value = pick(r, ['rating', 'stars', 'ratingValue', 'rating_value', 'averageRating', 'average_rating']) ?? pick(aggregate, ['ratingValue']);
    let count = pick(r, ['reviewCount', 'review_count', 'reviews', 'reviewsCount', 'reviews_count', 'ratingCount', 'rating_count', 'numReviews'])
        ?? pick(aggregate, ['reviewCount', 'ratingCount']);
    // `{ rate, count }`, as the Fake Store API and others nest it.
    if (isObject(value)) {
        count ??= pick(value, ['count', 'reviews']);
        value = pick(value, ['rate', 'value', 'average']);
    }
    if (Array.isArray(count)) count = count.length;
    // schema.org names the scale with `bestRating` (5 when missing): 4 out of 10 is two stars, not four.
    const best = num(pick(r, ['bestRating', 'best_rating']) ?? pick(aggregate, ['bestRating']));
    const given = num(value);
    const stars = given !== undefined && best !== undefined && best > 0 && given <= best ? (given * 5) / best : given;
    const reviews = num(count);
    return {
        // A value off the five-star scale is another scale, not a five: drawn as none.
        rating: stars !== undefined && stars >= 0 && stars <= 5 ? stars : undefined,
        reviewCount: reviews !== undefined && reviews >= 0 ? Math.floor(reviews) : undefined,
    };
}

/** Shopify's name for the one variant of a product that has none. */
const NO_VARIANT = 'Default Title';

function readOptions(r: Raw): string[] {
    const out: string[] = [];
    const add = (value: unknown) => {
        const s = str(value);
        if (s && s !== NO_VARIANT && !out.includes(s)) out.push(s);
    };
    // A shop's variants are its options combined ("Pink / M"): beside the options they would
    // say each value a second time, in another chip.
    const keys = Array.isArray(r['options']) ? ['options', 'sizes', 'colors', 'colours'] : ['sizes', 'colors', 'colours', 'variants'];
    for (const key of keys) {
        for (const item of listOf(r[key])) {
            if (!isObject(item)) add(item);
            // Shopify's `{ name: 'Size', values: ['S', 'M'] }`: the values are the choices.
            else if (Array.isArray(item['values'])) item['values'].forEach(add);
            else add(pick(item, ['title', 'name', 'value', 'label']));
        }
    }
    return out.slice(0, 50);
}

function readShipping(r: Raw): Product['shipping'] {
    if (r['freeShipping'] === true || r['free_shipping'] === true) return { cost: 0 };
    let value = pick(r, ['shipping', 'delivery', 'shippingInfo', 'shipping_info']);
    if (isObject(value)) value = pick(value, ['text', 'label', 'description']) ?? pick(value, ['cost', 'price', 'amount']);
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? { cost: value } : undefined;
    const text = str(value);
    if (!text) return undefined;
    const cost = num(text);
    return cost !== undefined && cost >= 0 ? { cost } : { text };
}

/**
 * A product's own buttons, as the result gave them: a link (`http(s)`) or an `id` your
 * `aparte-card-action` listener handles. Never a `send`: the result is the tool's — a shop's
 * page, a feed, a model — and a button that posts its text as the person's next message lets
 * that text speak for them, a lever for prompt injection. A message is the app's to write: in
 * its listener, from the product the event carries, or in the card's `actions` option.
 */
function readActions(value: unknown): CardAction[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((a): CardAction | null => {
            const label = isObject(a) ? str(a['label']) : undefined;
            if (!label) return null;
            const url = a['url'] !== undefined ? webUrl(a['url']) : undefined;
            if (url === null) return null;
            const id = str(a['id']);
            if (!url && !id) return null;
            return { label, ...(url ? { url } : {}), ...(id ? { id } : {}), ...(a['primary'] === true ? { primary: true } : {}) };
        })
        .filter((a): a is CardAction => a !== null)
        .slice(0, ACTIONS_PER_PRODUCT);
}

/** HTML's usual entities, once its tags are out: `&amp;` is `&`. One pass, so `&amp;lt;` stays `&lt;`. */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
        if (name.startsWith('#')) {
            const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
        }
        return ENTITIES[name.toLowerCase()] ?? whole;
    });
}

/** The markup a shop writes a description in (Shopify's `body_html`), as the words a reader sees. */
function plainText(html: string): string {
    return decodeEntities(html.replace(/<\/?(?:br|p|li|div|h\d)(?=[\s/>])[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

type Money = ReturnType<typeof readMoney>;

/**
 * The cheapest of a product's variants, with the price it replaces — where Shopify's Admin
 * API keeps a product's price (`variants[].price`, `compare_at_price`).
 */
function cheapestVariant(r: Raw): { price: Money; compare: Money } | undefined {
    let best: { price: Money; compare: Money } | undefined;
    for (const v of listOf(r['variants'])) {
        if (!isObject(v)) continue;
        const price = readMoney(pick(v, ['price', 'amount']));
        if (price.amount === undefined) continue;
        if (!best || price.amount < best.price.amount!) best = { price, compare: readMoney(pick(v, ['compare_at_price', 'compareAtPrice'])) };
    }
    return best;
}

/** The low end of Shopify's Storefront range, `{ minVariantPrice: { amount, currencyCode } }`. */
const lowEnd = (range: unknown) => (isObject(range) ? range['minVariantPrice'] : undefined);

/** One product from whatever a tool wrote, or `null` without a name to show. */
function readProduct(raw: unknown): Product | null {
    if (!isObject(raw)) return null;
    const r = raw;
    const title = str(pick(r, ['title', 'name', 'productName', 'product_title']));
    if (!title) return null;
    // schema.org puts the price, the currency, the stock and the link on an offer.
    const offers = r['offers'];
    const offer = Array.isArray(offers) ? (isObject(offers[0]) ? offers[0] : undefined) : isObject(offers) ? offers : undefined;

    // A price of its own, an offer's, Shopify Storefront's range — else its cheapest variant's.
    const own = pick(r, ['price', 'extracted_price', 'salePrice', 'sale_price', 'currentPrice', 'current_price'])
        ?? pick(offer, ['price', 'lowPrice']) ?? lowEnd(r['priceRange']);
    const variant = own === undefined ? cheapestVariant(r) : undefined;
    const price = variant ? variant.price : readMoney(own);
    const compareOwn = pick(r, [
        'compareAtPrice', 'compare_at_price', 'originalPrice', 'original_price', 'listPrice', 'list_price',
        'regularPrice', 'regular_price', 'wasPrice', 'was_price', 'extracted_old_price', 'oldPrice', 'old_price', 'msrp',
    ]) ?? lowEnd(r['compareAtPriceRange']);
    const compare = compareOwn === undefined && variant ? variant.compare : readMoney(compareOwn);
    const currency = currencyCode(pick(r, ['currency', 'currency_code', 'currencyCode', 'priceCurrency']) ?? pick(offer, ['priceCurrency']))
        ?? price.currency ?? compare.currency;

    const merchantRaw = pick(r, ['merchant', 'seller', 'store', 'shop', 'source', 'retailer', 'vendor']) ?? pick(r, ['brand']);
    const merchant = isObject(merchantRaw) ? str(pick(merchantRaw, ['name', 'title'])) : str(merchantRaw);
    const merchantLogo = webUrl(pick(r, ['merchantLogo', 'merchant_logo', 'source_icon', 'storeLogo', 'logo'])
        ?? (isObject(merchantRaw) ? pick(merchantRaw, ['logo', 'icon', 'image']) : undefined));

    const description = str(pick(r, ['description', 'summary', 'snippet', 'subtitle', 'body_html', 'descriptionHtml']));
    const { rating: stars, reviewCount } = readRating(r);
    const availability = readAvailability(r, offer);
    const shipping = readShipping(r);
    const image = readImage(pick(r, ['image', 'images', 'thumbnail', 'image_url', 'imageUrl', 'featuredImage', 'photo']));
    const url = webUrl(pick(r, ['url', 'link', 'permalink', 'product_link', 'productUrl', 'product_url', 'onlineStoreUrl', 'href']) ?? pick(offer, ['url']));
    const id = str(pick(r, ['id', 'sku', 'product_id', 'productId']));
    const badge = str(pick(r, ['badge', 'tag', 'ribbon']));

    return {
        title,
        ...(id ? { id } : {}),
        ...(image ? { image } : {}),
        ...(price.amount !== undefined ? { price: price.amount } : {}),
        ...(currency ? { currency } : {}),
        ...(price.amount !== undefined && compare.amount !== undefined && compare.amount > price.amount ? { compareAtPrice: compare.amount } : {}),
        ...(stars !== undefined ? { rating: stars } : {}),
        ...(reviewCount !== undefined ? { reviewCount } : {}),
        ...(availability ? { availability } : {}),
        ...(merchant ? { merchant } : {}),
        ...(merchant && merchantLogo ? { merchantLogo } : {}),
        ...(badge ? { badge } : {}),
        options: readOptions(r),
        ...(shipping ? { shipping } : {}),
        // Shown as text, so a tag would show as `<p>`: take the words out of the markup.
        ...(description ? { description: plainText(description) } : {}),
        ...(url ? { url } : {}),
        actions: readActions(r['actions']),
    };
}

/**
 * The card's data from the loose shape `map` returns — one product, a list, or
 * `{ title, products }` (also `results`, `items`, Google Shopping's `shopping_results`) —
 * or `null` when not one product has a name. At most ten are kept.
 */
export function readProducts(raw: unknown): ProductData | null {
    if (!raw || typeof raw !== 'object') return null;
    let list: unknown[];
    let title: string | undefined;
    if (Array.isArray(raw)) {
        list = raw;
    } else {
        const r = raw as Raw;
        const many = ['products', 'results', 'shopping_results', 'items'].map((key) => r[key]).find(Array.isArray);
        if (many) {
            list = many;
            title = str(pick(r, ['title', 'heading']));
        } else {
            list = [r];
        }
    }
    const products = list.map(readProduct).filter((p): p is Product => p !== null).slice(0, PRODUCTS_SHOWN);
    return products.length ? { ...(title ? { title } : {}), products } : null;
}

/** The share taken off, from the two prices — never read from a tool's "-20%". `undefined` under one percent. */
export function discountOf(product: Pick<Product, 'price' | 'compareAtPrice'>): number | undefined {
    const { price, compareAtPrice } = product;
    if (price === undefined || compareAtPrice === undefined || compareAtPrice <= price || compareAtPrice <= 0) return undefined;
    const ratio = (compareAtPrice - price) / compareAtPrice;
    return Math.round(ratio * 100) >= 1 ? ratio : undefined;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const money = (config: AparteConfig, product: Product, amount: number) => formatPrice(config, amount, product.currency);
const notNull = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/**
 * The photo in its square, over a bag glyph that stays underneath: a missing photo shows
 * the bag, and one that fails to load is hidden to show it — no node comes or goes.
 */
function media(product: Product, className = ''): HTMLElement {
    const frame = el('div', { class: `aparte-product__media${className ? ` ${className}` : ''}` },
        glyph(BAG, 'aparte-rich-card__glyph aparte-product__placeholder'));
    if (!product.image) {
        frame.setAttribute('data-empty', '');
        return frame;
    }
    const image = el('img', {
        class: 'aparte-product__image',
        attrs: {
            src: product.image.src,
            alt: product.image.alt ?? product.title,
            loading: 'lazy',
            decoding: 'async',
            // A shop's CDN learns nothing about the chat page that showed its photo.
            referrerpolicy: 'no-referrer',
        },
    });
    image.addEventListener('error', () => {
        image.hidden = true;
        frame.setAttribute('data-empty', '');
    }, { once: true });
    frame.append(image);
    return frame;
}

/** The product's name, a link out when it has a URL — the one link a tile or a row has. */
function titleOf(product: Product): HTMLElement {
    const title = el('div', { class: 'aparte-product__title' });
    if (product.url) {
        title.append(el('a', {
            class: 'aparte-product__link',
            attrs: { href: product.url, target: '_blank', rel: 'noopener noreferrer' },
            text: product.title,
        }));
    } else {
        title.textContent = product.title;
    }
    return title;
}

function merchantOf(product: Product): HTMLElement | null {
    if (!product.merchant) return null;
    const node = el('div', { class: 'aparte-product__merchant' });
    if (product.merchantLogo) {
        // Empty alt: the shop's name is written right beside it.
        const logo = el('img', { class: 'aparte-product__logo', attrs: { src: product.merchantLogo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } });
        logo.addEventListener('error', () => { logo.hidden = true; }, { once: true });
        node.append(logo);
    }
    node.append(el('span', { class: 'aparte-product__merchant-name', text: product.merchant }));
    return node;
}

function discountBadge(ctx: CardContext, product: Product): HTMLElement | null {
    const ratio = discountOf(product);
    if (ratio === undefined) return null;
    const badge = el('span', { class: 'aparte-badge aparte-badge--danger aparte-badge--solid aparte-badge--sm aparte-product__discount' });
    ctx.bind(badge, () => `\u2212${formatPercent(ctx.config, ratio)}`);
    return badge;
}

/** The price, the "was" price struck through after it, and — in `detail` — the discount beside them. */
function priceOf(ctx: CardContext, product: Product, withDiscount = false): HTMLElement | null {
    if (product.price === undefined) return null;
    const row = el('div', { class: 'aparte-product__price' });
    const now = el('span', { class: 'aparte-product__now' });
    ctx.bind(now, () => money(ctx.config, product, product.price!));
    row.append(now);
    if (product.compareAtPrice !== undefined) {
        // A struck-through number is silent to a screen reader: it is told which one this is.
        const said = el('span', { class: 'aparte-sr-only' });
        ctx.bind(said, () => `${word(ctx.config, 'cardsProductWas', P.cardsProductWas)} `);
        const value = el('span', { class: 'aparte-product__was-value' });
        ctx.bind(value, () => money(ctx.config, product, product.compareAtPrice!));
        row.append(el('del', { class: 'aparte-product__was' }, said, value));
        const discount = withDiscount ? discountBadge(ctx, product) : null;
        if (discount) row.append(discount);
    }
    return row;
}

function availabilityOf(ctx: CardContext, product: Product): HTMLElement | null {
    const availability = product.availability;
    if (!availability) return null;
    const status = 'status' in availability ? availability.status : undefined;
    const text = el('span', { class: 'aparte-product__stock-text' });
    if (status) ctx.word(text, STOCK_WORD[status], P[STOCK_WORD[status]]);
    else text.textContent = (availability as { text: string }).text;
    return el('div', { class: 'aparte-product__stock', attrs: { 'data-availability': status ?? 'other' } },
        el('span', { class: 'aparte-product__dot', attrs: { 'aria-hidden': 'true' } }),
        text);
}

function shippingOf(ctx: CardContext, product: Product): HTMLElement | null {
    const shipping = product.shipping;
    if (!shipping) return null;
    const text = el('span', { class: 'aparte-product__shipping-text' });
    if ('text' in shipping) text.textContent = shipping.text;
    else if (shipping.cost === 0) ctx.word(text, 'cardsProductFreeShipping', P.cardsProductFreeShipping);
    else ctx.bind(text, () => word(ctx.config, 'cardsProductShippingCost', P.cardsProductShippingCost, { price: money(ctx.config, product, shipping.cost) }));
    return el('div', { class: 'aparte-product__shipping', attrs: { 'data-free': 'cost' in shipping && shipping.cost === 0 } },
        glyph(TRUCK, 'aparte-rich-card__glyph aparte-product__shipping-icon'),
        text);
}

/** What sits over the photo's corner: the shop's badge, and the discount where the variant puts it there. */
function flags(ctx: CardContext, product: Product, withDiscount: boolean): HTMLElement | null {
    const items = [
        product.badge ? el('span', { class: 'aparte-badge aparte-badge--sm aparte-product__badge', text: product.badge }) : null,
        withDiscount ? discountBadge(ctx, product) : null,
    ].filter(notNull);
    return items.length ? el('div', { class: 'aparte-product__flags' }, ...items) : null;
}

/** Sizes, colours: six chips, then "+n" for the rest. */
function optionsOf(ctx: CardContext, product: Product): HTMLElement | null {
    if (!product.options.length) return null;
    const list = el('ul', { class: 'aparte-product__options', attrs: { role: 'list' } });
    ctx.bind(list, () => word(ctx.config, 'cardsProductOptions', P.cardsProductOptions), 'aria-label');
    for (const option of product.options.slice(0, OPTIONS_SHOWN)) {
        list.append(el('li', { class: 'aparte-tag aparte-tag--sm aparte-product__option' }, el('span', { class: 'aparte-tag__label', text: option })));
    }
    const rest = product.options.length - OPTIONS_SHOWN;
    if (rest > 0) {
        const shown = el('span', { class: 'aparte-tag__label', attrs: { 'aria-hidden': 'true' } });
        ctx.bind(shown, () => `+${formatNumber(ctx.config, rest)}`);
        const said = el('span', { class: 'aparte-sr-only' });
        ctx.bind(said, () => word(ctx.config, 'cardsProductMoreOptions', P.cardsProductMoreOptions, { n: formatNumber(ctx.config, rest) }));
        list.append(el('li', { class: 'aparte-tag aparte-tag--sm aparte-product__option aparte-product__option--more' }, shown, said));
    }
    return list;
}

/** A product's own buttons, each handing the product back as the event's `data`. */
function actionsOf(ctx: CardContext, product: Product, max: number): HTMLElement | null {
    const buttons = product.actions.slice(0, max).map((action) => ctx.action(action, product, 'aparte-product__action')).filter(notNull);
    return buttons.length ? el('div', { class: 'aparte-product__actions' }, ...buttons) : null;
}

function productRoot(kind: 'tile' | 'row' | 'detail', product: Product, extra = ''): HTMLElement {
    return el('div', {
        class: `aparte-product aparte-product--${kind}${extra ? ` ${extra}` : ''}`,
        attrs: {
            'data-availability': product.availability && 'status' in product.availability ? product.availability.status : undefined,
            'data-linked': product.url !== undefined,
        },
    });
}

/**
 * The `card` variant's tile. The title's link stretches over the whole tile (the sheet's
 * `::after`), so the tile is one link, read once, with its buttons lifted above it.
 * A `mini` tile — the others under a `detail` — keeps the photo, the name and the price.
 */
function tile(ctx: CardContext, product: Product, { actions, mini = false }: { actions: number; mini?: boolean }): HTMLElement {
    const node = productRoot('tile', product, mini ? 'aparte-product--mini' : '');
    const photo = media(product);
    const corner = mini ? null : flags(ctx, product, true);
    if (corner) photo.append(corner);
    const body = el('div', { class: 'aparte-product__body' },
        mini ? null : merchantOf(product),
        titleOf(product),
        mini ? null : rating(ctx, product.rating, { count: product.reviewCount }),
        priceOf(ctx, product),
        mini ? null : availabilityOf(ctx, product));
    node.append(photo, body);
    const buttons = actionsOf(ctx, product, actions);
    if (buttons) node.append(buttons);
    return node;
}

/**
 * The `compact` variant's row: thumbnail, name, shop and stars, price. "In stock" is left
 * out — it is what a reader assumes — so the line only speaks when the stock changes the choice.
 */
function row(ctx: CardContext, product: Product): HTMLElement {
    const node = productRoot('row', product);
    const meta = el('div', { class: 'aparte-product__meta' },
        product.merchant ? el('span', { class: 'aparte-product__merchant-name', text: product.merchant }) : null,
        rating(ctx, product.rating, { starsOnly: true }),
        product.availability && !('status' in product.availability && product.availability.status === 'in-stock') ? availabilityOf(ctx, product) : null);
    const main = el('div', { class: 'aparte-product__main' }, titleOf(product), meta.childNodes.length ? meta : null);
    node.append(media(product, 'aparte-product__thumb'), main);
    const amount = priceOf(ctx, product);
    if (amount) node.append(amount);
    const buttons = actionsOf(ctx, product, 1);
    if (buttons) node.append(buttons);
    return node;
}

/** The `detail` variant: everything the card knows, the photo beside it on a wide card. */
function detail(ctx: CardContext, product: Product): HTMLElement {
    const node = productRoot('detail', product);
    const photo = media(product);
    const corner = flags(ctx, product, false);
    if (corner) photo.append(corner);
    // The photo links where the name does; the name's link is the one a keyboard and a
    // screen reader meet, so this copy is out of both.
    const shown = product.url
        ? el('a', { class: 'aparte-product__media-link', attrs: { href: product.url, target: '_blank', rel: 'noopener noreferrer', tabindex: -1, 'aria-hidden': 'true' } }, photo)
        : photo;
    const facts = el('div', { class: 'aparte-product__facts' }, availabilityOf(ctx, product), shippingOf(ctx, product));
    const body = el('div', { class: 'aparte-product__body' },
        merchantOf(product),
        titleOf(product),
        rating(ctx, product.rating, { count: product.reviewCount }),
        priceOf(ctx, product, true),
        facts.childNodes.length ? facts : null,
        product.description ? el('p', { class: 'aparte-product__description', text: product.description }) : null,
        optionsOf(ctx, product),
        actionsOf(ctx, product, ACTIONS_PER_PRODUCT));
    node.append(shown, body);
    return el('div', { class: 'aparte-product__detail' }, node);
}

function heading(data: ProductData): HTMLElement | null {
    return data.title ? el('div', { class: 'aparte-product__heading', text: data.title }) : null;
}

function labelOf(data: Partial<ProductData> | null, ctx: CardContext): string {
    const products = data?.products ?? [];
    if (products.length === 1) return products[0]!.title;
    if (data?.title) return data.title;
    if (products.length > 1) return word(ctx.config, 'cardsProductCount', P.cardsProductCount, { n: formatNumber(ctx.config, products.length) });
    return word(ctx.config, 'cardsProductTitle', P.cardsProductTitle);
}

function render(data: ProductData, ctx: CardContext<ProductVariant>): Node[] {
    const { products } = data;
    const first = products[0]!;

    if (ctx.variant === 'detail') {
        // One product looked at closely; the others stay one swipe away, small, rather
        // than a second row of full tiles competing with it. Rows were the other choice,
        // but nine rows under a detail make a page, and a row of mini tiles stays one line.
        const out: Node[] = [detail(ctx, first)];
        if (products.length > 1) {
            const title = el('div', { class: 'aparte-product__more-title' });
            ctx.word(title, 'cardsProductMore', P.cardsProductMore);
            const slides = products.slice(1).map((p) => tile(ctx, p, { actions: 0, mini: true }));
            out.push(el('div', { class: 'aparte-product__more' }, title,
                carousel(ctx, slides, { label: () => word(ctx.config, 'cardsProductMore', P.cardsProductMore) })));
        }
        return out;
    }

    if (ctx.variant === 'compact') {
        if (products.length === 1) return [row(ctx, first)];
        const list = el('ul', { class: 'aparte-product__rows', attrs: { role: 'list' } },
            ...products.map((p) => el('li', { class: 'aparte-product__item' }, row(ctx, p))));
        return [heading(data), list].filter(notNull);
    }

    if (products.length === 1) return [tile(ctx, first, { actions: ACTIONS_PER_PRODUCT })];
    // Several: tiles in a row that scrolls, one button each — a row of tiles reads as a
    // choice when each offers one thing to do.
    const slides = products.map((p) => tile(ctx, p, { actions: 1 }));
    return [el('div', { class: 'aparte-product__collection' },
        heading(data),
        carousel(ctx, slides, { label: () => labelOf(data, ctx) }))];
}

function skeleton(partial: Partial<ProductData> | null, ctx: CardContext<ProductVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' = 'rect') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    const lines = () => [block('aparte-product__sk-line', 'text'), block('aparte-product__sk-line aparte-product__sk-line--short', 'text')];
    // What the search was for, before anything is found: the call's input already says it.
    const query = partial?.title
        ? el('div', { class: 'aparte-product__query' }, glyph(SEARCH, 'aparte-rich-card__glyph aparte-product__query-icon'), el('span', { class: 'aparte-product__query-text', text: partial.title }))
        : null;

    if (ctx.variant === 'compact') {
        const rows = [0, 1, 2].map(() => el('div', { class: 'aparte-product__item' },
            el('div', { class: 'aparte-product aparte-product--row aparte-product--skeleton' },
                block('aparte-product__sk-thumb'),
                el('div', { class: 'aparte-product__main' }, ...lines()),
                block('aparte-product__sk-price', 'text'))));
        return [query, el('div', { class: 'aparte-product__rows' }, ...rows)].filter(notNull);
    }
    if (ctx.variant === 'detail') {
        return [query, el('div', { class: 'aparte-product__detail' },
            el('div', { class: 'aparte-product aparte-product--detail aparte-product--skeleton' },
                block('aparte-product__sk-media'),
                el('div', { class: 'aparte-product__body' }, ...lines(), block('aparte-product__sk-price', 'text'), block('aparte-product__sk-line', 'text'))))].filter(notNull);
    }
    // Three tiles, the third cut by the edge: the shape a row of results will take.
    const tiles = [0, 1, 2].map(() => el('div', { class: 'aparte-product aparte-product--tile aparte-product--skeleton' },
        block('aparte-product__sk-media'),
        el('div', { class: 'aparte-product__body' }, ...lines(), block('aparte-product__sk-price', 'text'))));
    return [el('div', { class: 'aparte-product__collection' }, query, el('div', { class: 'aparte-product__sk-track' }, ...tiles))];
}

export const productCard = defineCard<ProductData, ProductVariant>({
    name: 'product',
    variants: ['card', 'compact', 'detail'],
    styles: productStyles,
    icon: TAG,
    normalize: readProducts,
    render,
    skeleton,
    label: labelOf,
    fallback: (data, ctx) => {
        // One line per product, "Title — price (4.6/5)", the way a model or a text-only
        // reader would want them listed.
        const lines = data.products.map((p) => {
            const amount = p.price !== undefined ? ` — ${money(ctx.config, p, p.price)}` : '';
            const stars = p.rating !== undefined ? ` (${formatNumber(ctx.config, p.rating, { maximumFractionDigits: 1 })}/5)` : '';
            return `${p.title}${amount}${stars}`;
        });
        return [data.title, ...lines].filter(notNull).join('\n');
    },
    partial: (input) => {
        const query = str(input['query'] ?? input['q'] ?? input['search'] ?? input['keywords'] ?? input['term'] ?? input['product']);
        return query ? { title: query } : null;
    },
});

/** Draw a tool's products as this card — returns the function that stops it. */
export function setupProductCard(options: CardSetupOptions<ProductData, ProductVariant> = {}): () => void {
    return productCard.setup(options);
}
