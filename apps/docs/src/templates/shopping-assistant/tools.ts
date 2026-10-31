/**
 * The shop's tools, and the cards that draw what they return.
 *
 * Each tool answers in the shop's own shape (catalog.ts, orders.ts), the way your API does; the
 * card setups below are where that shape becomes a card. The product card's `map` reads the
 * shop's fields and adds the one button the app wants on every product, "Add to cart", as an
 * `id`: a button read from data can only open a link or report an `id`, never send a message,
 * and app.ts answers the `id` in its `aparte-card-action` listener. A button that writes a
 * message is the app's own, in a setup's `actions`.
 *
 * In a real shop the handlers call your API; the tools' shapes, the maps and the cards stay.
 */
import { aparteGlobalConfig } from '@aparte/core';
import { setupOrderCard, type OrderInput } from '@aparte/plugin-cards/order';
import { setupProductCard, type ProductInput } from '@aparte/plugin-cards/product';
import { reducedMotion } from '../runtime';
import { CATALOG, findItem, photoUrl, searchCatalog, type CatalogItem } from './catalog';
import { currentOrder, openReturn, PAST_ORDER } from './orders';

export const SEARCH_TOOL = 'search_products';
export const DETAIL_TOOL = 'get_product';
export const COMPARE_TOOL = 'compare_products';
export const ORDER_TOOL = 'get_order';
export const RETURN_TOOL = 'start_return';

/** The `id` of the button every product carries; app.ts adds the product to the cart. */
export const ADD_TO_CART = 'add-to-cart';
/** The return card's button; app.ts says the label was sent. */
export const EMAIL_LABEL = 'email-label';

/** A catalogue item as the API sends it: the photo's absolute address in place of the path. */
type ShopProduct = CatalogItem;

export interface SearchResult {
    query: string;
    max_price?: number;
    results: ShopProduct[];
}

export interface DetailResult {
    product: ShopProduct;
    /** What the shop suggests beside it. */
    related: ShopProduct[];
}

export interface CompareResult {
    products: ShopProduct[];
}

const online = (item: CatalogItem): ShopProduct => ({ ...item, photo: photoUrl(item) });

/** The product a return's input names, by its catalogue name. */
const itemOf = (input: Record<string, unknown>): string => findItem(String(input['item'] ?? ''))?.name ?? 'item';

// ── The shop's API ───────────────────────────────────────────────────────────────────────────

export function searchProducts(query: string, maxPrice?: number): SearchResult {
    return { query, ...(maxPrice !== undefined ? { max_price: maxPrice } : {}), results: searchCatalog(query, maxPrice).map(online) };
}

export function productDetail(id: string): DetailResult | undefined {
    const item = findItem(id);
    if (!item) return undefined;
    const related = CATALOG.filter((other) => other.id !== id && other.tags.includes('kettle') === item.tags.includes('kettle'));
    return { product: online(item), related: related.slice(0, 4).map(online) };
}

export function compareProducts(ids: string[]): CompareResult {
    return { products: ids.map(findItem).filter((item): item is CatalogItem => item !== undefined).map(online) };
}

/** What the model reads of a list of products: one line each, the way it would quote them. */
export function describeProducts(products: ShopProduct[]): string {
    if (!products.length) return 'No product matches.';
    return products
        .map((p) => `${p.name} (${p.id}): €${p.price}${p.listPrice ? `, was €${p.listPrice}` : ''}, ${p.stars}/5 from ${p.reviews} reviews, ${p.stock.replace('_', ' ')}`)
        .join('\n');
}

/** What the model reads of an order or a return. */
export function describeOrder(order: OrderInput): string {
    const facts = (order.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`);
    const lines = (order.items ?? []).map((item) => `${item.quantity ?? 1} × ${item.title}`);
    return [`${order.title ?? 'Order'} ${order.reference ?? ''}, ${order.status ?? ''}`, ...lines, ...facts].join('\n');
}

// ── The cards ────────────────────────────────────────────────────────────────────────────────

/** "Pour-over kettles under €80": the heading over a row of results. */
function headingOf(result: SearchResult): string {
    const query = result.query.charAt(0).toUpperCase() + result.query.slice(1);
    return result.max_price === undefined ? query : `${query} under €${result.max_price}`;
}

/** One product in the card's fields, with the button the app adds to it. */
function toCard(item: ShopProduct): ProductInput {
    return {
        id: item.id,
        title: item.name,
        image: { src: item.photo, alt: item.name },
        price: item.price,
        currency: 'EUR',
        ...(item.listPrice !== undefined ? { compareAtPrice: item.listPrice } : {}),
        rating: item.stars,
        reviewCount: item.reviews,
        availability: item.stock,
        ...(item.label ? { badge: item.label } : {}),
        options: item.colours ?? [],
        shipping: item.delivery,
        description: item.blurb,
        url: `https://example.com/products/${item.id}`,
        // Nothing to add when it cannot be bought; a pre-order says what it is.
        actions: item.stock === 'out_of_stock' ? [] : [{ label: item.stock === 'preorder' ? 'Pre-order' : 'Add to cart', id: ADD_TO_CART, primary: true }],
    };
}

function setupCards(): void {
    // A search is a row of tiles to choose from; a product asked about is a sheet, with the
    // others small under it; a comparison is rows, which read side by side.
    setupProductCard({
        tool: SEARCH_TOOL,
        map: (result: SearchResult) => ({ title: headingOf(result), products: result.results.map(toCard) }),
        variant: 'card',
    });
    setupProductCard({
        tool: DETAIL_TOOL,
        map: (result: DetailResult) => ({ products: [result.product, ...result.related].map(toCard) }),
        variant: 'detail',
        // The app's own button: this one may send a message, because the app wrote it.
        actions: (data) => [{ label: 'Compare with similar kettles', send: `Compare the ${data.products[0]?.title ?? 'kettle'} with similar kettles` }],
    });
    setupProductCard({
        tool: COMPARE_TOOL,
        map: (result: CompareResult) => ({ title: 'Side by side', products: result.products.map(toCard) }),
        variant: 'compact',
    });

    // The order as its receipt, tracking and all; the return as the moment it is opened.
    setupOrderCard({ tool: ORDER_TOOL, variant: 'receipt' });
    setupOrderCard({
        tool: RETURN_TOOL,
        variant: 'confirmation',
        // While the call waits for the customer, its line names the return, not "Order".
        mapInput: (input) => ({ title: `Return of the ${itemOf(input)}` }),
        // A label only for a parcel that goes back.
        actions: (data) =>
            data.facts.some((fact) => fact.label === 'Drop off by')
                ? [
                      { label: 'Email me the label', id: EMAIL_LABEL, primary: true },
                      { label: 'Find a drop-off point', url: 'https://example.com/parcelway/points' },
                  ]
                : [],
    });
}

// ── The tools ────────────────────────────────────────────────────────────────────────────────

/** A shop's API takes a moment: long enough to see the card's skeleton, none under reduced motion. */
const latency = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 0 : ms));

export function setupShopTools(): void {
    setupCards();

    aparteGlobalConfig.registerTool(
        {
            name: SEARCH_TOOL,
            description: 'Search the Pinecrate catalogue. Returns the matching products, best first.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' }, max_price: { type: 'number' } }, required: ['query'] },
        },
        async (call) => {
            await latency(700);
            const max = Number(call.input['max_price']);
            const result = searchProducts(String(call.input['query'] ?? ''), Number.isFinite(max) ? max : undefined);
            return { toolCallId: call.id, content: describeProducts(result.results), structuredContent: result };
        },
    );
    aparteGlobalConfig.registerTool(
        {
            name: DETAIL_TOOL,
            description: 'One product in full: description, colours, delivery, and what the shop suggests beside it.',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        async (call) => {
            await latency(500);
            const result = productDetail(String(call.input['id'] ?? ''));
            if (!result) return { toolCallId: call.id, content: 'No such product.' };
            return { toolCallId: call.id, content: `${describeProducts([result.product])}\n${result.product.blurb}`, structuredContent: result };
        },
    );
    aparteGlobalConfig.registerTool(
        {
            name: COMPARE_TOOL,
            description: 'Several products, to compare them.',
            inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
        },
        async (call) => {
            await latency(500);
            const ids = Array.isArray(call.input['ids']) ? call.input['ids'].map(String) : [];
            const result = compareProducts(ids);
            return { toolCallId: call.id, content: describeProducts(result.products), structuredContent: result };
        },
    );
    aparteGlobalConfig.registerTool(
        {
            name: ORDER_TOOL,
            description: 'One of the customer’s orders: its lines, totals, payment and delivery.',
            inputSchema: { type: 'object', properties: { reference: { type: 'string' } } },
        },
        async (call) => {
            await latency(600);
            const order = currentOrder();
            return { toolCallId: call.id, content: describeOrder(order), structuredContent: order };
        },
    );
    // The one tool that changes something: core asks the customer before it runs.
    aparteGlobalConfig.registerTool(
        {
            name: RETURN_TOOL,
            description: 'Open a return for one item of a past order, and refund it.',
            inputSchema: {
                type: 'object',
                properties: { order: { type: 'string' }, item: { type: 'string' }, reason: { type: 'string' } },
                required: ['order', 'item', 'reason'],
            },
            needsApproval: true,
        },
        async (call) => {
            await latency(600);
            const result = openReturn(String(call.input['reason'] ?? ''));
            return { toolCallId: call.id, content: describeOrder(result), structuredContent: result };
        },
    );

    // What the approval asks, in the customer's words: "Start a return for the Ash Serving
    // Board?" (app.ts sets the question's frame to "{tool}?"), and the return's terms under it.
    aparteGlobalConfig.registerToolDisplay(RETURN_TOOL, {
        label: 'Start a return',
        summary: (segment) => `for the ${itemOf(segment.toolCall.input)}`,
        formatInput: (input) =>
            [
                `${itemOf(input)}, from order #${String(input['order'] ?? PAST_ORDER.reference)}`,
                `Reason: ${String(input['reason'] ?? '')}`,
                `Refund: €${PAST_ORDER.price.toFixed(2)} to your card`,
            ].join('\n'),
    });
}
