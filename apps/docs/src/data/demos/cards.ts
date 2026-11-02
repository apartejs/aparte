/**
 * The Cards group's variants: each card of `@aparte/plugin-cards` on realistic data, in each of
 * its variants and while its call runs, and the two chart plugins. See ./types.ts for how a demo
 * is read.
 *
 * A card shows only `http(s)` pictures (a `data:` address is refused, like any address a tool's
 * result could use against the page), so the pictures are flat illustrations served by this
 * site, from `public/demo-pictures/`, and the demos build their absolute address at run time.
 * Every date is relative to the moment the frame opens.
 */
import type { DemoEntry } from './types';

type Card = 'weather' | 'items' | 'product' | 'place' | 'stats' | 'order' | 'stock' | 'plan' | 'score' | 'media' | 'link';

const SETUP: Record<Card, string> = {
    weather: 'setupWeatherCard',
    items: 'setupItemsCard',
    product: 'setupProductCard',
    place: 'setupPlaceCard',
    stats: 'setupStatsCard',
    order: 'setupOrderCard',
    stock: 'setupStockCard',
    plan: 'setupPlanCard',
    score: 'setupScoreCard',
    media: 'setupMediaCard',
    link: 'setupLinkCard',
};

const PICTURE = `
  // A card shows only http(s) pictures: these are served by this site.
  const picture = (name) => new URL('/demo-pictures/' + name + '.svg', location.href).href;
`;

/** A JavaScript string literal, single-quoted like the rest of the demos. */
const q = (text: string): string => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

interface Scene {
    card: Card;
    /** The argument of the setup call, as code. */
    options: string;
    /** Code run before the setup call: helpers the data or the options use. */
    before?: string;
    /** The data uses `picture(name)`. */
    pictures?: boolean;
    tool: string;
    /** The call's input, as code. */
    input: string;
    /** The tool's structured result, as code; leave it out for a call still running. */
    result?: string;
}

function head(scene: Scene): string {
    const fn = SETUP[scene.card];
    return `  // In an app: import { ${fn} } from '@aparte/plugin-cards/${scene.card}';
  const { ${fn} } = window.apartePlugins.cards.${scene.card};
${scene.pictures ? PICTURE : ''}${scene.before ?? ''}
  ${fn}(${scene.options});`;
}

function segment(scene: Scene, id = 's1'): string {
    const status = scene.result === undefined ? 'pending' : 'resolved';
    return `{
    id: '${id}', type: 'tool_call', status: '${status}',
    toolCall: { id: 'c-${id}', name: '${scene.tool}', input: ${scene.input} },${scene.result === undefined ? '' : `
    structuredResult: ${scene.result},`}
  }`;
}

/** A card in a conversation: the question, then the reply the card is drawn in. */
function inChat(id: string, title: string, height: number, question: string, scene: Scene): DemoEntry {
    return {
        id,
        title,
        plugins: ['cards'],
        html: `<aparte-chat-viewport style="height: ${height}rem"></aparte-chat-viewport>

<script>
${head(scene)}

  const viewport = document.querySelector('aparte-chat-viewport');
  viewport.appendMessage({ id: 'u1', role: 'user', content: ${q(question)}, timestamp: Date.now() });
  viewport.appendMessage({ id: 'a1', role: 'assistant', timestamp: Date.now(), segments: [${segment(scene)}] });
</script>`,
    };
}

/** A card alone in a reply: a variant, or the card while its call runs. */
function inReply(id: string, title: string, scene: Scene, comment = ''): DemoEntry {
    return {
        id,
        title,
        plugins: ['cards'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
${head(scene)}
${comment ? `\n  // ${comment}` : ''}
  document.querySelector('aparte-chat-bubble').setSegments([${segment(scene)}]);
</script>`,
    };
}

const RUNNING = 'The call is still running: the card draws its skeleton, with what the input already says.';

// ── Weather ────────────────────────────────────────────────────────────────────

const LILLE = `{
      location: 'Lille', condition: 'partly-cloudy', temperature: 11, feelsLike: 9, high: 14, low: 7,
      humidity: 78, wind: { speed: 18, direction: 240 }, precipitation: 40,
      hourly: [11, 12, 13, 14, 13, 12, 10, 9].map((temperature, i) => ({
        time: new Date((Math.floor(Date.now() / 3600000) + i) * 3600000), temperature,
        condition: i > 4 ? 'rain' : 'partly-cloudy', precipitation: i > 4 ? 60 : 10,
      })),
    }`;

const WEATHER: DemoEntry[] = [
    inChat('card-weather', 'The weather card', 37, 'Weather in Lille?', {
        card: 'weather', options: `{ tool: 'get_weather' }`, tool: 'get_weather', input: `{ city: 'Lille' }`, result: LILLE,
    }),
    inReply('card-weather-compact', 'The weather card, compact', {
        card: 'weather', options: `{ tool: 'get_weather', variant: 'compact' }`, tool: 'get_weather', input: `{ city: 'Paris' }`,
        result: `{ location: 'Paris', condition: 'clear', temperature: 6, high: 13, low: 4 }`,
    }),
    inReply('card-weather-forecast', 'The weather card, a forecast', {
        card: 'weather', options: `{ tool: 'get_weather', variant: 'forecast' }`, tool: 'get_weather', input: `{ city: 'Tokyo', days: 7 }`,
        result: `{
      location: 'Tokyo', condition: 'rain', temperature: 17, high: 19, low: 13,
      daily: [[19, 13, 'rain', 80], [22, 14, 'partly-cloudy', 10], [24, 16, 'clear', 0], [21, 15, 'cloudy', 20],
        [18, 12, 'thunder', 70], [20, 13, 'drizzle', 40], [23, 15, 'clear', 0]]
        .map(([high, low, condition, precipitation], i) => ({ date: new Date(Date.now() + i * 86400000), high, low, condition, precipitation })),
    }`,
    }),
    inReply('card-weather-night', 'The weather card at night', {
        card: 'weather', options: `{ tool: 'get_weather' }`, tool: 'get_weather', input: `{ city: 'Oslo' }`,
        result: `{
      location: 'Oslo', condition: 'snow', night: true, temperature: -3, feelsLike: -8, high: -1, low: -6,
      humidity: 88, wind: { speed: 12, direction: 20 }, precipitation: 70,
      hourly: [-3, -3, -4, -4, -5, -5, -6, -6].map((temperature, i) => ({
        time: new Date((Math.floor(Date.now() / 3600000) + i) * 3600000), temperature, condition: i < 5 ? 'snow' : 'cloudy', precipitation: i < 5 ? 70 : 20,
      })),
    }`,
    }),
    inReply('card-weather-running', 'The weather card while its call runs', {
        card: 'weather', options: `{ tool: 'get_weather' }`, tool: 'get_weather', input: `{ city: 'Lille' }`,
    }, RUNNING),
];

// ── Items ──────────────────────────────────────────────────────────────────────

const DINNERS = `{
      title: 'Autumn dinners under 40 minutes',
      items: [
        { title: 'Roast tomato soup with basil', subtitle: 'Weeknight kitchen', image: picture('dish-tomato'), badge: '35 min',
          description: 'Tomatoes, garlic and onion roasted until sweet, blended with stock, finished with basil oil.',
          meta: ['4 servings', 'Vegetarian'], url: 'https://recipes.example.org/roast-tomato-soup' },
        { title: 'Butternut risotto with sage', subtitle: 'Weeknight kitchen', image: picture('dish-squash'), badge: '40 min',
          description: 'Half the squash roasted, half stirred in until it melts; crisp sage leaves on top.',
          meta: ['2 servings', 'Vegetarian'], url: 'https://recipes.example.org/butternut-risotto' },
        { title: 'Pear, walnut and bitter leaf salad', subtitle: 'Market greens', image: picture('dish-greens'), badge: '15 min',
          description: 'Chicory and rocket with sliced pear, toasted walnuts and a mustard dressing.',
          meta: ['2 servings', 'Vegan'], url: 'https://recipes.example.org/pear-walnut-salad' },
        { title: 'Blackberry almond tart', subtitle: 'Weekend baking', image: picture('dish-berries'), badge: '40 min',
          description: 'A press-in almond crust, a thin layer of frangipane and the last blackberries of the year.',
          meta: ['8 slices'], url: 'https://recipes.example.org/blackberry-almond-tart' },
      ],
    }`;

const items = (variant: string | null): Scene => ({
    card: 'items', options: variant ? `{ tool: 'search_recipes', variant: '${variant}' }` : `{ tool: 'search_recipes' }`, pictures: true,
    tool: 'search_recipes', input: `{ query: 'quick autumn dinners' }`, result: DINNERS,
});

const ITEMS: DemoEntry[] = [
    inChat('card-items', 'The items card, as a carousel', 39, 'Some quick dinner ideas for this week?', items(null)),
    inReply('card-items-list', 'The items card, as a list', items('list')),
    inReply('card-items-grid', 'The items card, as a grid', items('grid')),
    inReply('card-items-running', 'The items card while its call runs', {
        card: 'items', options: `{ tool: 'search_recipes' }`, tool: 'search_recipes', input: `{ query: 'quick autumn dinners' }`,
    }, RUNNING),
];

// ── Product ────────────────────────────────────────────────────────────────────

const ARDEN = `{ title: 'Arden 700 wireless headphones', image: picture('headphones-graphite'), price: 279, compareAtPrice: 349,
          currency: 'EUR', rating: 4.6, reviewCount: 2184, availability: 'in-stock', merchant: 'Soundhouse',
          badge: 'Bestseller', shipping: 0, url: 'https://shop.example.com/arden-700' }`;

const HEADPHONES = `{
      title: 'Wireless headphones under €300',
      products: [
        ${ARDEN},
        { title: 'Arden 500, sand', image: picture('headphones-sand'), price: 199, currency: 'EUR', rating: 4.4,
          reviewCount: 836, availability: 'low-stock', merchant: 'Soundhouse', shipping: 0, url: 'https://shop.example.com/arden-500' },
        { title: 'Fjell Studio over-ear', image: picture('headphones-sage'), price: 239, currency: 'EUR', rating: 4.2,
          reviewCount: 412, availability: 'preorder', merchant: 'Nordlyd', shipping: 4.9, url: 'https://shop.example.com/fjell-studio' },
      ],
    }`;

const PRODUCT: DemoEntry[] = [
    inChat('card-product', 'The product card', 38, 'Good wireless headphones under €300?', {
        card: 'product', options: `{ tool: 'search_products' }`, pictures: true,
        tool: 'search_products', input: `{ query: 'wireless headphones', maxPrice: 300 }`, result: HEADPHONES,
    }),
    inReply('card-product-compact', 'The product card, compact', {
        card: 'product', options: `{ tool: 'search_products', variant: 'compact' }`, pictures: true,
        tool: 'search_products', input: `{ query: 'wireless headphones', maxPrice: 300 }`, result: HEADPHONES,
    }),
    inReply('card-product-detail', 'The product card, one product in detail', {
        card: 'product', options: `{ tool: 'get_product', variant: 'detail' }`, pictures: true,
        tool: 'get_product', input: `{ id: 'arden-700' }`,
        result: `{ title: 'Arden 700 wireless headphones', image: picture('headphones-graphite'), price: 279, compareAtPrice: 349,
      currency: 'EUR', rating: 4.6, reviewCount: 2184, availability: 'in-stock', merchant: 'Soundhouse', shipping: 0,
      options: ['Graphite', 'Sand', 'Sage'],
      description: 'Forty hours on a charge, noise cancelling that adapts to the room, and ear cups that fold flat into the case.',
      url: 'https://shop.example.com/arden-700' }`,
    }),
    inReply('card-product-running', 'The product card while its call runs', {
        card: 'product', options: `{ tool: 'search_products' }`, tool: 'search_products', input: `{ query: 'wireless headphones' }`,
    }, RUNNING),
];

// ── Place ──────────────────────────────────────────────────────────────────────

const WEEK = `
  // Opening hours for every day but the ones listed.
  const week = (open, close, closed = []) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    .filter((day) => !closed.includes(day)).map((day) => ({ day, open, close }));
`;

const BISTRO = `{ name: 'Le Comptoir des Halles', category: 'Bistro', image: picture('store-bistro'), rating: 4.6, reviewCount: 1284,
          priceLevel: 2, distance: 350, address: '12 rue de la Halle, Lille', coordinates: { lat: 50.6405, lng: 3.0614 },
          website: 'https://bistro.example.com', hours: week('12:00', '23:30', ['mon']), tags: ['Terrace', 'Natural wine'] }`;

const DINNER_PLACES = `{
      title: 'Dinner near the old town',
      places: [
        ${BISTRO},
        { name: 'Café Lumière', category: 'Café', image: picture('store-cafe'), rating: 4.4, reviewCount: 532, priceLevel: 1,
          distance: 600, address: '3 place du Concert, Lille', hours: week('07:30', '19:00'), tags: ['Brunch', 'Wi-Fi'] },
        { name: 'Maison Brunel', category: 'Bakery', image: picture('store-bakery'), rating: 4.8, reviewCount: 2210, priceLevel: 1,
          distance: 900, address: '41 rue Royale, Lille', hours: week('07:00', '20:00', ['sun']), tags: ['Sourdough'] },
      ],
    }`;

const place = (variant: string | null, tool: string, input: string, result: string): Scene => ({
    card: 'place', before: WEEK, pictures: true, tool, input, result,
    options: `{ tool: '${tool}', currencySymbol: '€'${variant ? `, variant: '${variant}'` : ''} }`,
});

const PLACE: DemoEntry[] = [
    inChat('card-place', 'The place card', 35, 'Where can we eat near the old town tonight?',
        place(null, 'find_places', `{ query: 'dinner', near: 'Vieux-Lille' }`, DINNER_PLACES)),
    inReply('card-place-compact', 'The place card, compact', place('compact', 'find_places', `{ query: 'dinner', near: 'Vieux-Lille' }`, DINNER_PLACES)),
    inReply('card-place-detail', 'The place card, one place in detail', place('detail', 'get_place', `{ name: 'Le Comptoir des Halles' }`, BISTRO.replace(/\n {10}/g, '\n      '))),
    inReply('card-place-running', 'The place card while its call runs', {
        card: 'place', options: `{ tool: 'get_place', currencySymbol: '€' }`, tool: 'get_place', input: `{ name: 'Le Comptoir des Halles' }`,
    }, RUNNING),
];

// ── Stats ──────────────────────────────────────────────────────────────────────

const SALES = `{
      title: 'Sales this week', subtitle: 'Online store, every channel',
      items: [
        { label: 'Revenue', value: 48250, currency: 'EUR', change: 0.124, good: 'up', changeLabel: 'vs last week', icon: 'money',
          trend: [5200, 6100, 5800, 7400, 6900, 8300, 8550] },
        { label: 'Orders', value: 612, change: 0.08, good: 'up', icon: 'cart', trend: [71, 80, 76, 92, 88, 101, 104] },
        { label: 'Conversion rate', value: 0.031, format: 'percent', change: -0.06, good: 'up', icon: 'chart',
          trend: [0.034, 0.033, 0.033, 0.032, 0.031, 0.030, 0.031] },
        { label: 'Returns', value: 23, change: '+3%', good: 'down', hint: '3.8% of orders' },
      ],
      footnote: 'Taxes included; a refund counts on the day it is issued.',
      updatedAt: Date.now() - 5 * 60000,
    }`;

const stats = (variant: string | null): Scene => ({
    card: 'stats', options: variant ? `{ tool: 'get_sales_summary', variant: '${variant}' }` : `{ tool: 'get_sales_summary' }`,
    tool: 'get_sales_summary', input: `{ period: 'this week' }`, result: SALES,
});

const STATS: DemoEntry[] = [
    inChat('card-stats', 'The stats card, as tiles', 41, 'How did the store do this week?', stats(null)),
    inReply('card-stats-list', 'The stats card, as a list', stats('list')),
    inReply('card-stats-hero', 'The stats card, one figure first', stats('hero')),
    inReply('card-stats-running', 'The stats card while its call runs', {
        card: 'stats', options: `{ tool: 'get_sales_summary' }`, tool: 'get_sales_summary', input: `{ title: 'Sales this week' }`,
    }, RUNNING),
];

// ── Order ──────────────────────────────────────────────────────────────────────

const RECEIPT = `{
      reference: 'A-20931', status: 'shipped', date: Date.now() - 2 * 86400000, currency: 'EUR',
      items: [
        { title: 'Arden 700 wireless headphones', subtitle: 'Graphite', image: picture('headphones-graphite'), quantity: 1, price: 279 },
        { title: 'Hard carrying case', subtitle: 'Arden 700', image: picture('case'), quantity: 1, price: 29 },
        { title: 'Replacement ear cushions', quantity: 2, price: 14.5 },
      ],
      discount: 20, shipping: 0, payment: { brand: 'Visa', last4: '4242' },
      shippingAddress: { address1: '8 rue Esquermoise', zip: '59800', city: 'Lille', country: 'France' },
      delivery: {
        estimate: { from: Date.now() + 86400000, to: Date.now() + 3 * 86400000 },
        carrier: 'Express parcel', trackingNumber: '6A20931874512', trackingUrl: 'https://track.example.com/6A20931874512',
      },
      url: 'https://shop.example.com/orders/A-20931',
    }`;

const ORDER: DemoEntry[] = [
    inChat('card-order', 'The order card, as a receipt', 52, 'Where is my headphones order?', {
        card: 'order', options: `{ tool: 'get_order' }`, pictures: true, tool: 'get_order', input: `{ orderId: 'A-20931' }`, result: RECEIPT,
    }),
    inReply('card-order-compact', 'The order card, compact', {
        card: 'order', options: `{ tool: 'get_order', variant: 'compact' }`, pictures: true, tool: 'get_order', input: `{ orderId: 'A-20931' }`, result: RECEIPT,
    }),
    inReply('card-order-confirmation', 'The order card, a booking confirmed', {
        card: 'order', options: `{ tool: 'book_room', variant: 'confirmation' }`,
        before: `
  // A hotel's dates are days, not midnights: the card counts the nights between them.
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
`,
        tool: 'book_room', input: `{ hotel: 'Hôtel des Arts', nights: 3 }`,
        result: `{
      kind: 'booking', title: 'Hôtel des Arts', reference: 'HDA-7Q2M', status: 'confirmed', currency: 'EUR',
      booking: { start: day(14), end: day(17), location: '24 rue de Paris, Lille', guests: 2 },
      facts: [{ label: 'Room', value: 'Deluxe double, courtyard side' }, { label: 'Breakfast', value: 'Included' }],
      total: 486, payment: 'Paid at the hotel',
    }`,
    }),
    inReply('card-order-running', 'The order card while its call runs', {
        card: 'order', options: `{ tool: 'get_order' }`, tool: 'get_order', input: `{ orderId: 'A-20931' }`,
    }, RUNNING),
    {
        id: 'card-order-approval',
        title: 'Two order calls a person has to decide on',
        plugins: ['cards'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  // In an app: import { setupOrderCard } from '@aparte/plugin-cards/order';
  const { setupOrderCard } = window.apartePlugins.cards.order;
  setupOrderCard({ tool: ['place_order', 'cancel_order'] });

  // Waiting for a person, then refused: one line each, never a card drawn from a call that did not run.
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'tool_call', status: 'awaiting-approval',
      toolCall: { id: 'c-s1', name: 'place_order', input: { reference: 'A-21007', items: [{ title: 'Arden 500, sand', quantity: 1 }] } } },
    { id: 's2', type: 'tool_call', status: 'rejected',
      toolCall: { id: 'c-s2', name: 'cancel_order', input: { reference: 'A-20931' } } },
  ]);
</script>`,
    },
];

// ── Stock ──────────────────────────────────────────────────────────────────────

/** A made-up price walk: `n` values ending at `end`, spread over `span`, the same for a seed. */
const WALK = `
  // A made-up price walk: n values ending at end, spread over span, the same for a seed.
  const walk = (seed, n, end, span) => {
    let v = 0;
    const raw = Array.from({ length: n }, (_, i) => (v += Math.sin(i * 0.7 + seed) * 1.6 + Math.cos(i * 0.23 + seed * 2) + 0.12));
    const last = raw[n - 1];
    const scale = span / (Math.max(...raw) - Math.min(...raw));
    return raw.map((x) => Math.round((end - (last - x) * scale) * 100) / 100);
  };
`;

const STOCK: DemoEntry[] = [
    inChat('card-stock', 'The stock card, with its range buttons', 42, 'How is ACME doing today?', {
        card: 'stock',
        before: `${WALK}
  const RANGES = { '1D': [78, 3.6], '5D': [60, 8], '1M': [44, 16], '6M': [60, 30], '1Y': [52, 42] };
  const quote = (range) => ({
    symbol: 'ACME', name: 'Acme Corp.', exchange: 'NASDAQ', currency: 'USD', marketState: 'open',
    price: 184.6, change: 2.35, changePercent: 1.29, previousClose: 182.25,
    open: 182.9, high: 185.2, low: 181.6, volume: 48200000, marketCap: 312000000000,
    range, ranges: Object.keys(RANGES), series: walk(range.length * 7 + range.charCodeAt(1), RANGES[range][0], 184.6, RANGES[range][1]),
  });

  // The range buttons are drawn because something answers them: a press redraws the card in
  // place. Here the answer is computed; in an app it is a request for the quote over that range.
  const answer = async ({ name, value }) => {
    if (name !== 'range') return;
    await new Promise((done) => setTimeout(done, 250));
    return quote(value);
  };
`,
        options: `{ tool: 'get_quote', onChange: answer }`,
        tool: 'get_quote', input: `{ symbol: 'ACME' }`, result: `quote('1D')`,
    }),
    inReply('card-stock-candles', 'The stock card, as candlesticks', {
        card: 'stock', options: `{ tool: 'get_quote', variant: 'candles' }`,
        before: `
  // A month of made-up daily candles.
  const candles = Array.from({ length: 30 }, (_, i) => {
    const open = 170 + Math.sin(i / 3) * 6 + i * 0.4;
    const close = open + Math.sin(i * 1.7) * 3;
    return { time: Date.now() - (30 - i) * 86400000, open, close,
      high: Math.max(open, close) + 1 + (i % 3), low: Math.min(open, close) - 1 - (i % 2) };
  });
`,
        tool: 'get_quote', input: `{ symbol: 'ACME', range: '1M' }`,
        result: `{ symbol: 'ACME', name: 'Acme Corp.', exchange: 'NASDAQ', currency: 'USD', range: '1M', candles }`,
    }),
    inReply('card-stock-compact', 'The stock card, a watchlist', {
        card: 'stock', options: `{ tool: 'get_watchlist', variant: 'compact' }`, before: WALK,
        tool: 'get_watchlist', input: `{ list: 'Tech' }`,
        result: `{
      title: 'Tech watchlist',
      quotes: [
        { symbol: 'ACME', name: 'Acme Corp.', currency: 'USD', price: 184.6, changePercent: 1.29, series: walk(1, 40, 184.6, 3.6) },
        { symbol: 'GLBX', name: 'Globex', currency: 'USD', price: 62.18, changePercent: -0.84, series: walk(4, 40, 62.18, 1.4) },
        { symbol: 'INIT', name: 'Initech', currency: 'USD', price: 23.4, changePercent: 3.12, series: walk(7, 40, 23.4, 1.1) },
        { symbol: 'HOOL', name: 'Hooli', currency: 'USD', price: 412.05, changePercent: 0.06, series: walk(9, 40, 412.05, 4) },
      ],
    }`,
    }),
    inReply('card-stock-ticker', 'The stock card, a ticker', {
        card: 'stock', options: `{ tool: 'get_markets', variant: 'ticker' }`,
        tool: 'get_markets', input: `{}`,
        result: `[
      { symbol: 'ACME', currency: 'USD', price: 184.6, changePercent: 1.29 },
      { symbol: 'GLBX', currency: 'USD', price: 62.18, changePercent: -0.84 },
      { symbol: 'INIT', currency: 'USD', price: 23.4, changePercent: 3.12 },
      { symbol: 'BTC-USD', currency: 'USD', price: 68420, changePercent: -1.7 },
      { symbol: 'EUR/USD', price: 1.0842, changePercent: 0.12 },
      { symbol: 'HOOL', currency: 'USD', price: 412.05, changePercent: 0.06 },
    ]`,
    }),
    inReply('card-stock-running', 'The stock card while its call runs', {
        card: 'stock', options: `{ tool: 'get_quote' }`, tool: 'get_quote', input: `{ symbols: ['ACME', 'GLBX', 'INIT'] }`,
    }, RUNNING),
];

// ── Plan ───────────────────────────────────────────────────────────────────────

const RELEASE_PLAN = `{
      title: 'Publish the 2.4 release notes',
      steps: [
        { title: 'Read the merged pull requests', status: 'done' },
        { title: 'Group the changes by package', status: 'done' },
        { title: 'Write the notes', activeForm: 'Writing the notes', status: 'in-progress' },
        { title: 'Check every link', status: 'pending' },
        { title: 'Publish to the changelog', status: 'pending' },
      ],
    }`;

const PLAN: DemoEntry[] = [
    inChat('card-plan', 'The plan card, as a checklist', 30, 'Can you publish the 2.4 release notes?', {
        card: 'plan', options: `{ tool: 'update_plan' }`, tool: 'update_plan', input: `{}`, result: RELEASE_PLAN,
    }),
    inReply('card-plan-timeline', 'The plan card, as a timeline', {
        card: 'plan', options: `{ tool: 'update_plan', variant: 'timeline' }`,
        before: `
  const ago = (minutes) => Date.now() - minutes * 60000;
`,
        tool: 'update_plan', input: `{}`,
        result: `{
      title: 'Fix the failing build', timed: true,
      steps: [
        { title: 'Reproduce the failure', status: 'done', startedAt: ago(14), finishedAt: ago(12) },
        { title: 'Run the parser tests', status: 'failed', startedAt: ago(12), finishedAt: ago(11), detail: '2 of 148 failed: a heading inside a list' },
        { title: 'Fix the list parser', status: 'done', startedAt: ago(11), finishedAt: ago(4) },
        { title: 'Run the whole suite', activeForm: 'Running the whole suite', status: 'in-progress', startedAt: ago(4) },
        { title: 'Open a pull request', status: 'pending' },
      ],
    }`,
    }),
    inReply('card-plan-compact', 'The plan card, compact', {
        card: 'plan', options: `{ tool: 'update_plan', variant: 'compact' }`, tool: 'update_plan', input: `{}`, result: RELEASE_PLAN,
    }),
    {
        id: 'card-plan-live',
        title: 'The plan card, updated while the agent works',
        plugins: ['cards'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  // In an app: import { setupPlanCard } from '@aparte/plugin-cards/plan';
  const { setupPlanCard } = window.apartePlugins.cards.plan;
  // A todo tool's input is the list itself: read the input, not the "ok" it returns.
  setupPlanCard({ tool: 'write_todos', map: (_result, input) => input });

  const titles = ['Read the merged pull requests', 'Group the changes by package', 'Write the notes', 'Check every link', 'Publish to the changelog'];
  const todos = (done) => ({
    todos: titles.map((content, i) => ({ content, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' })),
  });

  // The agent sends the same call again with new statuses: the same card is redrawn, and no row moves.
  const bubble = document.querySelector('aparte-chat-bubble');
  const call = (done) => ({ id: 'c1', name: 'write_todos', input: todos(done) });
  bubble.setSegments([{ id: 's1', type: 'tool_call', status: 'resolved', toolCall: call(0), result: 'ok' }]);
  let done = 0;
  const tick = setInterval(() => {
    done += 1;
    bubble.updateSegment('s1', { toolCall: call(done) });
    if (done === titles.length) clearInterval(tick);
  }, 1600);
</script>`,
    },
    inReply('card-plan-running', 'The plan card while its call runs', {
        card: 'plan', options: `{ tool: 'make_plan' }`, tool: 'make_plan', input: `{ goal: 'Publish the 2.4 release notes' }`,
    }, RUNNING),
];

// ── Score ──────────────────────────────────────────────────────────────────────

const NORTHPORT = `{ name: 'Northport FC', shortName: 'NPT', color: '#c8102e'`;
const RIVERSIDE = `{ name: 'Riverside United', shortName: 'RIV', color: '#1d4ed8'`;

const SCORE: DemoEntry[] = [
    inChat('card-score', 'The score card, a match being played', 25, 'What’s the score in the Northport game?', {
        card: 'score', options: `{ tool: 'get_match' }`, tool: 'get_match', input: `{ team: 'Northport FC' }`,
        result: `{
      home: ${NORTHPORT}, score: 2 }, away: ${RIVERSIDE}, score: 1 },
      status: 'live', clock: 67, sport: 'football', competition: 'Coastal League', round: 'Matchday 12', venue: 'Harbour Ground',
      events: [
        { minute: 12, team: 'home', type: 'goal', player: 'M. Okafor' },
        { minute: 38, team: 'away', type: 'goal', player: 'L. Varga' },
        { minute: 61, team: 'home', type: 'penalty', player: 'S. Dubois' },
      ],
    }`,
    }),
    inReply('card-score-compact', 'The score card, a scoreboard', {
        card: 'score', options: `{ tool: 'get_scores', variant: 'compact' }`,
        before: `
  // Tomorrow at 21:00, on the reader's clock.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(21, 0, 0, 0);
`,
        tool: 'get_scores', input: `{ date: 'today' }`,
        result: `{
      title: 'Tonight',
      matches: [
        { home: ${NORTHPORT}, score: 2 }, away: ${RIVERSIDE}, score: 1 }, status: 'live', clock: 67, sport: 'football' },
        { home: { name: 'Bay City Comets', shortName: 'BAY', color: '#f59e0b', score: 88 },
          away: { name: 'Lakeside Owls', shortName: 'LAK', color: '#0f766e', score: 91 },
          status: 'live', clock: 'Q4 2:41', sport: 'basketball' },
        { home: { name: 'Westmoor', shortName: 'WES', color: '#7c3aed', score: 24 },
          away: { name: 'Eastcliff', shortName: 'EAS', color: '#be123c', score: 17 }, status: 'final', sport: 'rugby' },
        { home: { name: 'Riverside United', shortName: 'RIV', color: '#1d4ed8' },
          away: { name: 'Hillcrest Athletic', shortName: 'HIL', color: '#15803d' }, status: 'scheduled', startTime: tomorrow, sport: 'football' },
      ],
    }`,
    }),
    inReply('card-score-detail', 'The score card, a match in detail', {
        card: 'score', options: `{ tool: 'get_match', variant: 'detail' }`, tool: 'get_match', input: `{ team: 'Northport FC' }`,
        result: `{
      home: ${NORTHPORT}, score: 3, record: 'W7 D3 L1' }, away: ${RIVERSIDE}, score: 1, record: 'W5 D2 L4' },
      status: 'final', sport: 'football', competition: 'Coastal League', round: 'Matchday 11', venue: 'Harbour Ground',
      periods: [{ label: '1st half', home: 1, away: 1 }, { label: '2nd half', home: 2, away: 0 }],
      events: [
        { minute: 12, team: 'home', type: 'goal', player: 'M. Okafor', detail: 'Assist: S. Dubois' },
        { minute: 29, team: 'away', type: 'yellow', player: 'T. Brandt' },
        { minute: 38, team: 'away', type: 'goal', player: 'L. Varga' },
        { minute: 61, team: 'home', type: 'penalty', player: 'S. Dubois' },
        { minute: 74, team: 'away', type: 'sub', player: 'J. Mensah', detail: 'For L. Varga' },
        { minute: '90+2', team: 'home', type: 'goal', player: 'A. Lindqvist' },
      ],
    }`,
    }),
    inReply('card-score-running', 'The score card while its call runs', {
        card: 'score', options: `{ tool: 'get_match' }`, tool: 'get_match', input: `{ home: 'Northport FC', away: 'Riverside United' }`,
    }, RUNNING),
];

// ── Media ──────────────────────────────────────────────────────────────────────

const PHOTOS = `{
      title: 'Landscapes, flat illustration',
      items: [
        { src: picture('alps-dawn'), title: 'First light', credit: 'Studio Ridge', width: 1200, height: 800 },
        { src: picture('coast'), title: 'The cliff path', credit: 'Studio Ridge', width: 1200, height: 800 },
        { src: picture('aurora'), title: 'Northern lights', credit: 'M. Haldor', width: 1200, height: 800 },
        { src: picture('forest'), title: 'Pines in the fog', credit: 'M. Haldor', width: 1200, height: 800 },
        { src: picture('dunes'), title: 'Dunes at noon', credit: 'A. Serra', width: 1200, height: 800 },
        { src: picture('city-dusk'), title: 'The city at dusk', credit: 'A. Serra', width: 1200, height: 800 },
      ],
    }`;

const MEDIA: DemoEntry[] = [
    inChat('card-media', 'The media card, one picture', 37, 'Draw me mountains at dawn, flat style.', {
        card: 'media', options: `{ tool: 'generate_image' }`, pictures: true,
        tool: 'generate_image', input: `{ prompt: 'Mountains at dawn, layered, flat illustration' }`,
        result: `{
      src: picture('alps-dawn'), width: 1200, height: 800, title: 'Mountains at dawn',
      caption: 'Layered ridges in violet and indigo under a rose sky, the sun low behind the last one.',
      alt: 'Layered mountain ridges under a pink dawn sky, with the sun low behind them.',
    }`,
    }),
    inReply('card-media-gallery', 'The media card, a gallery', {
        card: 'media', options: `{ tool: 'search_images', variant: 'gallery' }`, pictures: true,
        tool: 'search_images', input: `{ query: 'landscapes, flat illustration' }`, result: PHOTOS,
    }),
    inReply('card-media-strip', 'The media card, a strip', {
        card: 'media', options: `{ tool: 'search_images', variant: 'strip' }`, pictures: true,
        tool: 'search_images', input: `{ query: 'landscapes, flat illustration' }`, result: PHOTOS,
    }),
    inReply('card-media-running', 'The media card while its call runs', {
        card: 'media', options: `{ tool: 'generate_image' }`, tool: 'generate_image', input: `{ prompt: 'Mountains at dawn, layered, flat illustration' }`,
    }, RUNNING),
];

// ── Link ───────────────────────────────────────────────────────────────────────

const GUIDE_LINK = `{
      url: 'https://apartejs.dev/guides/cards/', siteName: 'aparté', type: 'article', image: picture('share-guide'),
      title: 'Show a tool’s result as a card',
      description: 'Draw what a tool returns as a rich card, in variants, from your tool’s own fields.',
    }`;

const RESULTS = `{
      title: 'Rich cards in a chat',
      links: [
        { url: 'https://apartejs.dev/guides/cards/', siteName: 'aparté', type: 'article', image: picture('share-guide'),
          title: 'Show a tool’s result as a card', description: 'Draw what a tool returns as a rich card, in variants, from your tool’s own fields.' },
        { url: 'https://github.com/apartejs/apartejs', siteName: 'GitHub', type: 'repo', image: picture('share-repo'),
          title: 'apartejs/apartejs', description: 'AI chat and agent UI components, built as Web Components, with the runtime inside.' },
        { url: 'https://talks.example.org/2026/cards-not-rows', type: 'video', image: picture('share-talk'), author: 'R. Okoye',
          title: 'Cards, not rows: drawing tool results', description: 'Twenty minutes on what a person reads when an agent calls a tool.',
          publishedAt: Date.now() - 12 * 86400000 },
        { url: 'https://journal.example.org/notes/read-the-weather', type: 'article', image: picture('coast'), author: 'C. Marchetti',
          title: 'Read the weather, not the JSON', description: 'Why the first card every chat ships is the forecast.',
          publishedAt: Date.now() - 3 * 86400000 },
      ],
    }`;

const LINK: DemoEntry[] = [
    inChat('card-link', 'The link card', 35, 'What’s on this page? apartejs.dev/guides/cards', {
        card: 'link', options: `{ tool: 'unfurl' }`, pictures: true, tool: 'unfurl', input: `{ url: 'https://apartejs.dev/guides/cards/' }`, result: GUIDE_LINK,
    }),
    inReply('card-link-compact', 'The link card, compact', {
        card: 'link', options: `{ tool: 'web_search', variant: 'compact' }`, pictures: true,
        tool: 'web_search', input: `{ query: 'rich cards in a chat' }`, result: RESULTS,
    }),
    inReply('card-link-quote', 'The link card, as a quote', {
        card: 'link', options: `{ tool: 'unfurl', variant: 'quote' }`, pictures: true, tool: 'unfurl',
        input: `{ url: 'https://journal.example.org/notes/read-the-weather' }`,
        result: `{
      url: 'https://journal.example.org/notes/read-the-weather', siteName: 'The Journal', type: 'article', themeColor: '#1b8aa6',
      image: picture('coast'), author: 'C. Marchetti', publishedAt: Date.now() - 3 * 86400000,
      title: 'Read the weather, not the JSON', description: 'Why the first card every chat ships is the forecast.',
    }`,
    }),
    inReply('card-link-running', 'The link card while its call runs', {
        card: 'link', options: `{ tool: 'unfurl' }`, tool: 'unfurl', input: `{ url: 'https://apartejs.dev/guides/cards/' }`,
    }, RUNNING),
];

// ── Charts ─────────────────────────────────────────────────────────────────────

const CHARTS: DemoEntry[] = [
    {
        id: 'chart-echarts',
        title: 'An ECharts chart in a reply',
        plugins: ['markdown', 'charts'],
        html: `<aparte-chat-viewport style="height: 40rem"></aparte-chat-viewport>

<script>
  // In an app: import { setupECharts } from '@aparte/plugin-echarts'; setupECharts();
  // The model writes the library's own option in an echarts fence: each fence is a code segment.
  const option = {
    title: { text: 'Revenue by quarter (k€)' }, tooltip: { trigger: 'axis' }, legend: { bottom: 0 },
    xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] }, yAxis: { type: 'value' },
    series: [
      { name: '2025', type: 'bar', data: [120, 132, 101, 134] },
      { name: '2026', type: 'bar', data: [140, 162, 151, 190] },
    ],
  };

  const viewport = document.querySelector('aparte-chat-viewport');
  viewport.appendMessage({ id: 'u1', role: 'user', content: 'Compare our revenue by quarter with last year.', timestamp: Date.now() });
  viewport.appendMessage({ id: 'a1', role: 'assistant', timestamp: Date.now(), segments: [
    { id: 's1', type: 'text', content: 'Every quarter is up on last year, and **Q4 by 42%**:' },
    { id: 's2', type: 'code', language: 'echarts', content: JSON.stringify(option, null, 2) },
  ] });
</script>`,
    },
    {
        id: 'chart-chartjs',
        title: 'A Chart.js chart in a reply',
        plugins: ['charts'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  // In an app: import { setupChartjs } from '@aparte/plugin-chartjs'; setupChartjs();
  // A chartjs fence holds the library's own { type, data, options }.
  const config = {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        { label: 'This week', data: [820, 932, 901, 934, 1290, 1330, 1320], fill: true, tension: 0.35 },
        { label: 'Last week', data: [760, 810, 870, 880, 1010, 1150, 1090], tension: 0.35 },
      ],
    },
    options: { plugins: { title: { display: true, text: 'Visitors per day' } } },
  };
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'code', language: 'chartjs', content: JSON.stringify(config, null, 2) },
  ]);
</script>`,
    },
    {
        id: 'chart-echarts-more',
        title: 'Two more ECharts types: a donut and candlesticks',
        plugins: ['charts'],
        html: `<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  // In an app: import { setupECharts } from '@aparte/plugin-echarts'; setupECharts();
  const donut = {
    title: { text: 'Where visitors come from' }, tooltip: { trigger: 'item' }, legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['45%', '70%'], data: [
      { name: 'Search', value: 4820 }, { name: 'Direct', value: 2310 }, { name: 'Newsletter', value: 1240 },
      { name: 'Social', value: 980 }, { name: 'Referral', value: 610 },
    ] }],
  };
  // Open, close, low, high: a month of made-up daily prices.
  const days = Array.from({ length: 22 }, (_, i) => 'Day ' + (i + 1));
  const prices = days.map((_, i) => {
    const open = 170 + Math.sin(i / 3) * 6 + i * 0.4;
    const close = open + Math.sin(i * 1.7) * 3;
    return [open, close, Math.min(open, close) - 1.5, Math.max(open, close) + 1.5].map((n) => Math.round(n * 100) / 100);
  });
  const candles = {
    title: { text: 'ACME, last month' }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days }, yAxis: { type: 'value', scale: true },
    series: [{ type: 'candlestick', data: prices }],
  };
  document.querySelector('aparte-chat-bubble').setSegments([
    { id: 's1', type: 'code', language: 'echarts', content: JSON.stringify(donut, null, 2) },
    { id: 's2', type: 'code', language: 'echarts', content: JSON.stringify(candles, null, 2) },
  ]);
</script>`,
    },
];

export const CARD_DEMOS: DemoEntry[] = [...WEATHER, ...ITEMS, ...PRODUCT, ...PLACE, ...STATS, ...ORDER, ...STOCK, ...PLAN, ...SCORE, ...MEDIA, ...LINK, ...CHARTS];
