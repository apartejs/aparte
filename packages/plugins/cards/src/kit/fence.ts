/**
 * Cards written as text: a fenced block whose language names the card and whose body is its
 * fields, the way ```echarts holds a chart's option —
 *
 *   ```card-weather
 *   { "location": "Lille", "temperature": 11, "condition": "rain" }
 *   ```
 *
 * For whatever produces text and no tool calls the chat can see: a backend that runs its tools
 * itself and streams only its answer, a workflow engine, a model with no tools. A client
 * without this plugin shows the block as code, which reads; one with it draws the card.
 *
 * A code-language renderer answers with markup, and a card is live DOM (its buttons, its
 * controls, its language switch), so the markup is an element that draws the card when it
 * reaches the page, through the card's own setup. A card that is not set up yet is fetched
 * by `load`, the first time its type appears.
 */
import { aparteGlobalConfig, escapeAttr, resolveConfig, type AparteConfig } from '@aparte/core';
import { cardsSetUp, drawCardSegment, onCardSetUp } from './define.js';

/** The language prefix: ```card-weather draws the weather card. */
export const CARD_FENCE_PREFIX = 'card-';

/** The cards this package ships, so their fences are known before any of them is set up. */
const SHIPPED = ['weather', 'items', 'product', 'place', 'stats', 'order', 'stock', 'plan', 'score', 'media', 'link'];

const TAG = 'aparte-card-fence';

export interface CardFenceOptions {
    /** The config to register on (the global one by default). */
    config?: AparteConfig;
    /**
     * How to fetch a card the page has not set up, by its name: called the first time a
     * fence names it, and its `setup…Card` export run on this config. Without an entry for
     * a name, a fence that names it shows its source.
     *
     * @example
     * setupCardFences({ load: { weather: () => import('@aparte/plugin-cards/weather') } });
     */
    load?: Record<string, () => Promise<Record<string, unknown>>>;
}

/** Each config's loaders, and what each load has become. */
const loaders = new WeakMap<AparteConfig, { load: NonNullable<CardFenceOptions['load']>; pending: Map<string, Promise<boolean>> }>();

/** `weather` → `setupWeatherCard`, the setup each card's entry exports. */
const setupName = (card: string) => `setup${card.charAt(0).toUpperCase()}${card.slice(1)}Card`;

function fetchCard(config: AparteConfig, card: string): Promise<boolean> {
    const own = loaders.get(config);
    const loader = own?.load[card];
    if (!own || !loader) return Promise.resolve(false);
    let pending = own.pending.get(card);
    if (!pending) {
        pending = loader().then((module) => {
            const setup = module[setupName(card)];
            if (typeof setup !== 'function') return false;
            (setup as (options: { config: AparteConfig }) => unknown)({ config });
            return true;
        }, (error: unknown) => {
            console.warn(`[aparte-cards] the ${card} card could not be loaded; its fence shows its source.`, error);
            return false;
        });
        own.pending.set(card, pending);
    }
    return pending;
}

/** A short, stable id for a fence's card, from what it holds: the same block, the same card. */
function idOf(card: string, source: string): string {
    let h = 0;
    for (let i = 0; i < source.length; i++) h = (Math.imul(31, h) + source.charCodeAt(i)) | 0;
    return `fence-${card}-${(h >>> 0).toString(36)}`;
}

/** The fence drawn as its card, or its source when it cannot be. */
async function drawFence(el: HTMLElement): Promise<void> {
    const card = el.getAttribute('data-card') ?? '';
    const source = el.getAttribute('data-source') ?? '';
    const config = resolveConfig(el);
    const showSource = () => {
        const code = document.createElement('code');
        code.className = 'aparte-code-error';
        code.textContent = source;
        el.replaceChildren(code);
    };
    let data: unknown;
    try {
        data = JSON.parse(source);
    } catch {
        showSource();
        return;
    }
    // `"variant"` in the block picks the card's layout, when it names one of them.
    const variant = data && typeof data === 'object' && typeof (data as { variant?: unknown }).variant === 'string'
        ? (data as { variant: string }).variant : undefined;
    const segment = { id: idOf(card, source), type: 'card' as const, card, data, ...(variant ? { variant } : {}) };
    let drawn = drawCardSegment(config, segment);
    if (!drawn && await fetchCard(config, card) && el.isConnected) drawn = drawCardSegment(config, segment);
    if (drawn) el.replaceChildren(drawn);
    else showSource();
}

function defineElement(): void {
    if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined' || customElements.get(TAG)) return;
    customElements.define(TAG, class extends HTMLElement {
        connectedCallback(): void {
            // Drawn once: a fence moved inside the page keeps the card it already holds.
            if (this.hasAttribute('data-drawn')) return;
            this.setAttribute('data-drawn', '');
            void drawFence(this);
        }
    });
}

/**
 * Draw the ```card-<name> fences in replies as their cards. Returns the function that stops
 * it. The cards are the ones set up on the config, and those `load` can fetch.
 */
export function setupCardFences(options: CardFenceOptions = {}): () => void {
    const config = options.config ?? aparteGlobalConfig;
    if (options.load) loaders.set(config, { load: options.load, pending: new Map() });
    defineElement();
    const names = new Set([...SHIPPED, ...cardsSetUp(config), ...Object.keys(options.load ?? {})]);
    const renderer = {
        languages: [...names].map((name) => `${CARD_FENCE_PREFIX}${name}`),
        // A card is not code to its reader: no code card around it, no copy button.
        bare: true,
        render: ({ language, source, open }: { language: string; source: string; open: boolean }): string => {
            // A card arrives whole: until the fence closes, a quiet box where it will be.
            if (open) return '<span class="aparte-skeleton aparte-skeleton--rect aparte-rich-card__fence-wait" aria-hidden="true"></span>';
            const card = language.slice(CARD_FENCE_PREFIX.length);
            return `<${TAG} data-card="${escapeAttr(card)}" data-source="${escapeAttr(source)}"></${TAG}>`;
        },
    };
    const stops = [config.registerCodeLanguageRenderer(renderer)];
    // A card of the app's own, set up after this: its blocks are drawn too, from then on.
    stops.push(onCardSetUp(config, (name) => {
        if (names.has(name)) return;
        names.add(name);
        stops.push(config.registerCodeLanguageRenderer({ ...renderer, languages: [`${CARD_FENCE_PREFIX}${name}`] }));
    }));
    return () => {
        for (const stop of stops.splice(0)) stop();
        loaders.delete(config);
    };
}
